---
title: Linux IO 多路复用：select、poll、epoll 的区别与内核实现
description: 从系统调用语义、内核数据结构、等待队列、就绪链表和触发模式角度理解 select、poll、epoll。
category: Chinese
date: 2018-01-01
updated: 2026-06-21
tags:
  - operation-system
---

`select`、`poll` 和 `epoll` 经常被总结成一句话：`select` 有 fd 数量限制，`poll` 没有限制，`epoll` 更高效。这句话适合面试速记，但不足以解释它们的本质差异。

更准确地说，三者都解决同一个问题：一个线程如何等待多个文件描述符上的 IO 就绪事件。区别在于：

- 用户态如何把“关注的 fd 集合”传给内核；
- 内核是否需要每次重新扫描这些 fd；
- 就绪事件如何从驱动/协议栈回到等待线程；
- 是否能复用内核中的关注集合；
- 返回给用户态的是全量集合还是就绪集合。

## IO 多路复用到底复用了什么

阻塞 IO 的模型是：一个线程卡在一个 fd 上，直到这个 fd 可读或可写。要同时处理很多连接，朴素做法是一个连接一个线程，但线程成本和调度成本会很快变高。

IO 多路复用复用的是“等待线程”。一个线程通过 `select/poll/epoll_wait` 把自己挂到多个 fd 的等待路径上。当任意一个 fd 对应的 socket、pipe、eventfd 等对象变为就绪，内核唤醒这个线程，用户态再去执行真正的 `read/write/accept`。

注意：多路复用只负责“通知你可以读写”，不负责把数据从内核拷贝到用户态。真正的数据读取仍然要调用 `read`、`recv`、`accept` 等系统调用。

下面这张旧图把常见的五种 IO 模型放在一起对比。它最有价值的地方，是把 IO 分成两个阶段：第一阶段是等待数据就绪，第二阶段是把数据从内核拷贝到用户空间。`select/poll/epoll` 解决的是第一阶段的等待问题；一旦返回就绪事件，第二阶段仍然是同步的 `recvfrom/read` 拷贝。

{% asset_img select-poll-epoll-difference-0.png "Comparison of blocking IO, nonblocking IO, IO multiplexing, signal-driven IO, and asynchronous IO" %}

因此，IO 多路复用不是 AIO。它不会让数据自动进入用户缓冲区，也不会消灭用户态处理逻辑。它真正优化的是：一个线程不必为了每个连接各自阻塞，也不必像非阻塞 IO 那样不断主动轮询，而是把“谁就绪了”这件事交给内核等待队列和事件通知机制。

## select：位图集合与重复扫描

`select` 的接口是：

```c
int select(int nfds, fd_set *readfds, fd_set *writefds,
           fd_set *exceptfds, struct timeval *timeout);
```

它的特点是用 `fd_set` 位图表示关注集合。用户态把 read/write/except 三个位图传进内核，内核检查这些 fd 是否就绪，再把结果写回同一批位图。

这带来几个问题。

第一，`fd_set` 有固定尺寸约束，常见上限是 `FD_SETSIZE`。这不是内核唯一限制，但足以让 `select` 不适合作为高并发网络服务器的基础接口。

第二，每次调用都要重新传入完整集合。应用层通常还要维护一份 master set，因为返回时原集合会被修改。

第三，内核需要扫描从 0 到 `nfds - 1` 的描述符。即使只有一个 fd 就绪，也要检查大量未就绪 fd。复杂度可以理解为 O(n)。

Linux 的 `fs/select.c` 中，`select` 最终走到 `do_select()` 这类逻辑；它围绕 fd 位图循环检查，并通过各文件对象的 poll 方法判断 mask。可以把核心过程理解成：

```c
for each fd below nfds:
    mask = file->f_op->poll(file, wait)
    if mask matches requested events:
        mark fd ready
```

上面是简化伪代码，不是完整内核源码。关键点是：`select` 的关注集合不常驻内核，每次等待都要重新扫描。

## poll：数组取代位图，但仍然线性扫描

`poll` 的接口是：

```c
int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

`pollfd` 大致包含三个字段：

```c
struct pollfd {
    int   fd;
    short events;
    short revents;
};
```

和 `select` 相比，`poll` 不再使用固定大小的 fd 位图，而是使用数组，所以它没有 `FD_SETSIZE` 那种位图上限问题。用户态可以传入任意长度的 `pollfd` 数组，实际受进程 fd 限制和内存限制影响。

但是 `poll` 没有改变最核心的问题：每次调用仍然要把整个数组传入内核，内核仍然要扫描整个数组，并把结果写到 `revents`。

因此 `poll` 可以看作是 `select` 的接口改良版，而不是复杂度革命。它更适合 fd 数量中等、接口表达更清晰的场景，但面对大量长连接且大多数连接不活跃的场景，仍然会浪费扫描成本。

## epoll：把关注集合留在内核

`epoll` 的接口被拆成三类：

```c
int epoll_create1(int flags);
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
int epoll_wait(int epfd, struct epoll_event *events,
               int maxevents, int timeout);
```

这种拆分就是它和 `select/poll` 的根本区别。

- `epoll_create1` 创建一个 epoll 实例。
- `epoll_ctl` 增删改关注的 fd。
- `epoll_wait` 只等待已经注册过的 fd 产生事件。

也就是说，关注集合不再每次从用户态传进来，而是常驻在内核的 epoll 实例中。应用只在连接建立、关闭或关注事件变化时调用 `epoll_ctl`。

Linux `fs/eventpoll.c` 里，epoll 实例的核心结构可以从两个成员看出来：

```c
struct rb_root_cached rbr;
struct list_head rdllist;
```

`rbr` 用于组织被监控的 fd，`rdllist` 用于保存已经就绪的事件。这个设计解释了 epoll 的两个优势：

第一，注册集合可复用。大量 fd 不需要每次 `epoll_wait` 都重新传入。

第二，返回的是就绪事件。`epoll_wait` 不需要把所有 fd 都返回给用户态，而是把 ready list 中的事件拷贝出去。

## epoll 的事件是怎么来的

理解 epoll 的关键是等待队列回调。

当你把一个 socket 加入 epoll 时，内核会通过该文件对象的 `poll` 方法，把 epoll 的回调挂到目标对象的等待队列上。之后网络包到达、socket 状态变化、pipe 被写入等事件发生时，对应对象会唤醒等待队列。epoll 的回调被执行，把对应事件加入 ready list，并唤醒正在 `epoll_wait` 的线程。

简化流程如下：

```text
epoll_ctl(ADD)
  -> 注册 fd
  -> 安装 poll wait callback

数据到达 socket
  -> socket wait queue 被唤醒
  -> epoll callback 触发
  -> event 进入 rdllist
  -> epoll_wait 返回
```

这也是为什么 epoll 对“大量连接、少量活跃”的场景特别友好。它不需要每次扫描所有连接，而是在事件发生时把活跃 fd 放入就绪链表。

## Level-triggered 与 Edge-triggered

epoll 支持两种常见触发模式。

Level-triggered，简称 LT。只要 fd 仍然处于就绪状态，`epoll_wait` 就会反复返回这个事件。它和 `poll` 的语义更接近，使用更简单。

Edge-triggered，简称 ET。只有状态从“不就绪”变成“就绪”时才通知一次。它减少重复通知，但要求用户态一次性把数据读到 `EAGAIN`，否则可能因为没有新的边沿变化而饿死。

ET 模式通常要搭配非阻塞 fd：

```c
for (;;) {
    n = read(fd, buf, sizeof(buf));
    if (n > 0) {
        handle(buf, n);
    } else if (n == -1 && errno == EAGAIN) {
        break;
    } else {
        close(fd);
        break;
    }
}
```

如果没有读到 `EAGAIN` 就退出，buffer 里可能还有数据，但由于没有新的边沿触发，应用可能再也收不到通知。

## 三者的复杂度对比

| 维度 | select | poll | epoll |
| --- | --- | --- | --- |
| 关注集合传递 | 每次传 fd_set | 每次传 pollfd 数组 | 通过 epoll_ctl 注册 |
| fd 数量限制 | 受 fd_set 限制明显 | 受 fd/内存限制 | 受 fd/内存限制 |
| 内核扫描 | O(n) | O(n) | 主要处理就绪事件 |
| 返回结果 | 修改原 fd_set | 写 revents | 返回 ready events |
| 适合场景 | 少量 fd、兼容性 | 中等 fd、接口简单 | 大量连接、事件稀疏 |
| 使用复杂度 | 中 | 中 | 较高 |

需要避免一个误解：epoll 不是所有场景都更快。如果 fd 数量很少，或者所有 fd 几乎总是活跃，`select/poll` 的扫描成本并不一定是瓶颈。epoll 的优势主要来自“避免反复提交关注集合”和“只返回就绪事件”。

## epoll 的工程注意事项

第一，ET 模式必须使用非阻塞 IO，并读写到 `EAGAIN`。

第二，要正确处理半关闭、错误和 hangup。不要只监听 `EPOLLIN`，忽略 `EPOLLERR`、`EPOLLHUP`、`EPOLLRDHUP`。

第三，`epoll_ctl` 不是免费的。连接频繁增删时，注册成本也会变成开销。

第四，事件循环里不要做长时间 CPU 计算。否则即使 IO 通知很高效，也会被用户态处理逻辑拖垮。

第五，one-shot 场景可以考虑 `EPOLLONESHOT`，避免多个 worker 同时处理同一个 fd，但要记得处理完后重新 arm。

第六，accept 新连接时也要循环 accept 到 `EAGAIN`，否则在 ET 模式下可能漏掉已排队连接。

## 与 Reactor 模型的关系

高性能网络框架通常把 epoll 封装成 Reactor：

1. event loop 调用 `epoll_wait`。
2. 内核返回 ready events。
3. event loop 分发到 accept/read/write handler。
4. handler 执行业务逻辑或把任务丢给 worker。
5. 根据写缓冲状态修改关注事件。

Redis、Nginx、Netty、libuv 等系统都可以用这个模型理解。差异在于线程模型、任务调度、内存管理和协议处理，而底层等待机制在 Linux 上通常会落到 epoll。

## 小结

`select`、`poll`、`epoll` 的本质区别不是“新旧 API”，而是“关注集合和就绪集合的管理方式”。

- `select` 用位图，每次传入，每次扫描。
- `poll` 用数组，突破位图限制，但仍然每次扫描。
- `epoll` 把关注集合留在内核，用就绪链表返回活跃事件。

如果只记一个结论：`select/poll` 是“我每次把全部 fd 给你，你帮我看看谁好了”；`epoll` 是“我先告诉你我要关注谁，之后谁好了你再通知我”。

这就是 epoll 能支撑大规模长连接服务的根本原因。

## 参考资料

[1] [Linux kernel source: fs/select.c](https://github.com/torvalds/linux/blob/master/fs/select.c)

[2] [Linux kernel source: fs/eventpoll.c](https://github.com/torvalds/linux/blob/master/fs/eventpoll.c)

[3] [Linux man-pages: select(2)](https://man7.org/linux/man-pages/man2/select.2.html)

[4] [Linux man-pages: poll(2)](https://man7.org/linux/man-pages/man2/poll.2.html)

[5] [Linux man-pages: epoll(7)](https://man7.org/linux/man-pages/man7/epoll.7.html)
