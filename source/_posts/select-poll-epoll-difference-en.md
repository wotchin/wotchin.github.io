---
title: "Linux IO Multiplexing: select, poll, epoll, and Their Kernel-Level Differences"
description: "A deeper explanation of select, poll, and epoll from system-call semantics, kernel data structures, wait queues, ready lists, and trigger modes."
category: English
date: 2018-01-01
updated: 2026-06-22
lang: en
translation_url: /2018/01/01/select-poll-epoll-difference/
tags:
  - operation-system
---

# Why IO Multiplexing Exists

Network servers spend a surprising amount of time waiting. A socket may not have data yet. A write buffer may not have space. A connection may be idle. If a server blocks one thread per connection, the design is simple, but the cost becomes high when the connection count grows.

IO multiplexing solves this problem by allowing one thread to wait for events on many file descriptors.

The common Linux APIs are:

- `select`
- `poll`
- `epoll`

They all answer the same basic question:

> Among this set of file descriptors, which ones are ready for IO now?

The following diagram shows where IO multiplexing sits among common Linux IO models.

![Comparison of blocking IO, nonblocking IO, IO multiplexing, signal-driven IO, and asynchronous IO](/2018/01/01/select-poll-epoll-difference/select-poll-epoll-difference-0.png)

# The Readiness Model

`select`, `poll`, and `epoll` are readiness-based APIs. They do not complete the IO operation for you. They only tell you that an operation is likely to proceed without blocking.

For a TCP socket:

- Readable usually means data is available, the peer closed the connection, or an error is pending.
- Writable usually means there is space in the send buffer.
- Exceptional conditions usually represent out-of-band or error-related states.

After receiving a readiness notification, the application still needs to call `read`, `write`, `recv`, or `send`.

This is different from true asynchronous IO, where the kernel completes the IO and notifies the application afterward.

# select

The `select` API is old and portable:

```c
int select(
    int nfds,
    fd_set *readfds,
    fd_set *writefds,
    fd_set *exceptfds,
    struct timeval *timeout
);
```

The application passes three bitsets representing file descriptors of interest. The kernel modifies those sets in place and returns the number of ready descriptors.

A typical loop looks like this:

```c
fd_set rfds;
FD_ZERO(&rfds);
FD_SET(listen_fd, &rfds);
FD_SET(client_fd, &rfds);

int n = select(max_fd + 1, &rfds, NULL, NULL, &timeout);
if (n > 0 && FD_ISSET(client_fd, &rfds)) {
    read(client_fd, buf, sizeof(buf));
}
```

## Kernel-Level Behavior

Conceptually, `select` copies the descriptor sets from user space into the kernel, scans descriptors from `0` to `nfds - 1`, attaches the current task to wait queues for each descriptor, sleeps if nothing is ready, then scans again to report readiness.

The important point is that the kernel must inspect the descriptor set repeatedly. The cost is proportional to the range of file descriptors, not just the number of ready descriptors.

In simplified form, the logic resembles:

```c
for (fd = 0; fd < nfds; fd++) {
    if (fd_is_set(fd, in)) {
        mask = file->f_op->poll(file, wait);
        if (mask & requested_events)
            fd_set(fd, out);
    }
}
```

This explains the two classic limitations:

- `select` is O(n) over the descriptor range.
- The descriptor set has a fixed size limit, commonly exposed through `FD_SETSIZE`.

`select` is fine for small descriptor sets and portable code. It is not ideal for high-concurrency servers.

# poll

`poll` removes the fixed bitset limit and uses an array of `pollfd` structures:

```c
struct pollfd {
    int   fd;
    short events;
    short revents;
};

int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

Each entry contains a descriptor, requested events, and returned events.

Example:

```c
struct pollfd fds[2];
fds[0].fd = listen_fd;
fds[0].events = POLLIN;
fds[1].fd = client_fd;
fds[1].events = POLLIN;

int n = poll(fds, 2, 1000);
if (n > 0 && (fds[1].revents & POLLIN)) {
    read(client_fd, buf, sizeof(buf));
}
```

## Kernel-Level Behavior

`poll` is more flexible than `select`, but the basic model is similar. The kernel copies the `pollfd` array, visits every descriptor, calls each file's `poll` method, and returns readiness through `revents`.

Simplified:

```c
for (i = 0; i < nfds; i++) {
    file = fget(fds[i].fd);
    mask = file->f_op->poll(file, wait);
    fds[i].revents = mask & fds[i].events;
}
```

This removes the `FD_SETSIZE` problem, but not the O(n) scan. If a process monitors 100,000 descriptors and only 10 are active, `poll` still has to walk the array.

`poll` is a cleaner interface than `select`, but it does not fundamentally change the scaling model.

# epoll

`epoll` was designed for large numbers of file descriptors.

It splits the workflow into three operations:

```c
int epoll_create1(int flags);

int epoll_ctl(
    int epfd,
    int op,
    int fd,
    struct epoll_event *event
);

int epoll_wait(
    int epfd,
    struct epoll_event *events,
    int maxevents,
    int timeout
);
```

The idea is simple:

1. Create an epoll instance.
2. Register file descriptors and their desired events.
3. Wait for ready events.

Example:

```c
int epfd = epoll_create1(0);

struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = client_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

struct epoll_event events[128];
int n = epoll_wait(epfd, events, 128, 1000);

for (int i = 0; i < n; i++) {
    int fd = events[i].data.fd;
    read(fd, buf, sizeof(buf));
}
```

# What epoll Changes

The key improvement is that `epoll` separates registration from waiting.

With `select` and `poll`, the application passes the whole descriptor set on every wait call. With `epoll`, descriptors are registered once through `epoll_ctl`. The kernel keeps an interest list inside the epoll instance.

Internally, epoll maintains two important structures:

- An interest set, which records descriptors being watched.
- A ready list, which records descriptors that have become ready.

When a watched file descriptor becomes ready, its wait-queue callback can add the corresponding epoll item to the ready list. Then `epoll_wait` can return ready descriptors without scanning the entire interest set.

In simplified form:

```c
// Registration path
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, event);
add fd to epoll interest tree;
attach callback to fd wait queue;

// Wakeup path
when fd becomes ready:
    callback adds fd to epoll ready list;

// Wait path
epoll_wait(epfd, events, maxevents, timeout);
copy ready events to user space;
```

This is why `epoll_wait` scales with the number of ready descriptors rather than the total number of watched descriptors in the common case.

# Level-Triggered and Edge-Triggered Modes

`epoll` supports two main notification modes.

Level-triggered mode is the default. If a descriptor remains readable or writable, `epoll_wait` may keep reporting it.

This is easier to use:

```c
ev.events = EPOLLIN;
```

If the application reads only part of the available data, the descriptor will still be reported later.

Edge-triggered mode reports only when the state changes from not ready to ready:

```c
ev.events = EPOLLIN | EPOLLET;
```

This can reduce repeated notifications, but it requires stricter application logic. The descriptor should be non-blocking, and the application should read or write until `EAGAIN`.

Typical pattern:

```c
for (;;) {
    ssize_t n = read(fd, buf, sizeof(buf));
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

If you use edge-triggered mode but do not drain the descriptor, you may miss future notifications and stall the connection.

# Complexity Comparison

| API | Descriptor registration | Wait cost | User-kernel copy | Descriptor limit | Typical use |
| --- | --- | --- | --- | --- | --- |
| `select` | Passed on every call | O(n) scan | Bitsets copied every call | Limited by `FD_SETSIZE` | Small portable programs |
| `poll` | Passed on every call | O(n) scan | Array copied every call | No fixed bitset limit | Medium descriptor sets |
| `epoll` | Registered once | Usually O(ready) | Ready events copied | Scales to large sets | High-concurrency Linux servers |

This table is a simplification, but it captures the most important engineering difference.

# Reactor Pattern

IO multiplexing is often used with the Reactor pattern.

The event loop waits for readiness events, then dispatches handlers:

```c
while (running) {
    int n = epoll_wait(epfd, events, maxevents, timeout);
    for (int i = 0; i < n; i++) {
        dispatch(events[i]);
    }
}
```

Many high-performance network systems follow this model: Nginx, Redis, Netty, libuv, and many custom RPC frameworks.

The model works well because it keeps a small number of threads busy with many connections. It also makes backpressure and connection state explicit in the application.

# Practical Notes

First, readiness does not guarantee a full operation will succeed. Always use non-blocking descriptors in event-driven servers, and handle `EAGAIN`.

Second, writable events are often always ready. If you subscribe to write readiness for every socket all the time, the event loop may spin. Register write events only when there is pending data to send.

Third, handle close and error events. A readable socket may mean the peer closed the connection. `EPOLLERR` and `EPOLLHUP` should not be ignored.

Fourth, avoid long-running work inside the event loop. CPU-heavy tasks should be moved to worker threads or separate processes.

Fifth, be careful with edge-triggered mode. It can improve efficiency, but level-triggered mode is often safer and good enough.

# Summary

`select`, `poll`, and `epoll` solve the same problem: waiting for IO readiness across multiple file descriptors.

`select` is portable but limited by fixed-size descriptor sets and O(n) scans. `poll` removes the fixed bitset limit but still scans all descriptors. `epoll` changes the model by keeping an interest list in the kernel and returning descriptors from a ready list.

The practical result is clear: for small programs, `select` or `poll` may be sufficient. For high-concurrency Linux servers, `epoll` is usually the right primitive.

The deeper lesson is that performance comes from avoiding repeated work. `epoll` is faster not because it magically makes IO cheaper, but because it avoids rebuilding and rescanning the whole descriptor set on every wait.

# References

[1]. Linux manual page: select(2)

[2]. Linux manual page: poll(2)

[3]. Linux manual page: epoll(7)
