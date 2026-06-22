---
title: 数据库中的乐观锁与悲观锁：从库存扣减到 MVCC 与隔离级别
description: 用更系统的方式理解乐观锁、悲观锁、MVCC、事务隔离级别和高并发业务中的并发控制取舍。
category: Chinese
date: 2020-02-10
updated: 2026-06-21
tags:
  - database
  - software-engineering
---

数据库并发控制最容易被讲成一句话：“冲突少用乐观锁，冲突多用悲观锁。”这句话没有错，但太粗糙。真正落到业务系统里，问题通常不是“选乐观还是悲观”这么简单，而是：

- 这个业务能不能接受失败重试？
- 读到的是不是一个一致的快照？
- 冲突发生时，是等待、失败、重试，还是降级？
- 锁的粒度在哪里：行、索引范围、业务对象、库存桶，还是分布式资源？
- 数据库隔离级别已经帮我们解决了什么，又没有解决什么？

本文尝试把“乐观锁/悲观锁”放回数据库并发控制的大框架里看。

## 一个典型问题：库存扣减

假设有一张库存表：

```sql
CREATE TABLE inventory (
  sku_id BIGINT PRIMARY KEY,
  stock INT NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL
);
```

如果两个请求同时购买同一个 `sku_id`，最危险的情况是“丢失更新”：两个事务都读到 `stock = 1`，然后都认为可以扣减，最终库存被扣成错误状态，或者卖出了超过库存的商品。

并发控制的目标不是“加锁”本身，而是在正确性、吞吐、延迟和失败体验之间做取舍。

## 悲观锁：先占住资源，再做修改

悲观锁的核心假设是：冲突很可能发生，所以先把要修改的资源锁住。数据库里最常见的写法是 `SELECT ... FOR UPDATE`：

```sql
BEGIN;

SELECT stock
FROM inventory
WHERE sku_id = 1001
FOR UPDATE;

UPDATE inventory
SET stock = stock - 1,
    updated_at = NOW()
WHERE sku_id = 1001
  AND stock > 0;

COMMIT;
```

这段逻辑的语义是：事务先获取目标行的排他性锁，其他想更新同一行的事务需要等待当前事务提交或回滚。PostgreSQL 文档把这类能力放在 explicit locking 中讨论；MySQL InnoDB 文档也把 `FOR UPDATE` 归为 locking read，用于读取后即将修改的场景。

悲观锁适合这些场景：

- 冲突概率高，例如热点库存、账户余额、优惠券核销。
- 失败重试成本高，例如支付、资金记账、库存强一致扣减。
- 业务流程短，锁持有时间可控。
- 需要明确的串行化效果，而不是让上层业务猜测冲突。

悲观锁的问题也很明显：

- 锁等待会增加 tail latency。
- 事务时间越长，吞吐越差。
- 多资源加锁顺序不一致时容易死锁。
- 如果查询条件没有走合适索引，InnoDB 可能锁住比预期更大的范围。

因此悲观锁不是“更安全所以总是更好”。它要求业务把事务边界控制得足够短，并且严格保证访问路径和加锁顺序。

## 乐观锁：先执行，提交时检测冲突

乐观锁的核心假设是：大多数情况下不会冲突，所以不提前阻塞其他事务，而是在更新时检查“我读到的版本是否仍然有效”。

最常见的实现是 version 字段：

```sql
SELECT stock, version
FROM inventory
WHERE sku_id = 1001;

UPDATE inventory
SET stock = stock - 1,
    version = version + 1,
    updated_at = NOW()
WHERE sku_id = 1001
  AND stock > 0
  AND version = :old_version;
```

如果 `UPDATE` 影响行数为 1，说明提交成功；如果影响行数为 0，说明版本已经变化，当前请求需要失败、重试，或者重新读取后再计算。

这类写法本质上是 compare-and-swap。它不依赖长时间持有锁，适合读多写少、冲突低、可以重试的业务。

乐观锁适合这些场景：

- 编辑文章、更新配置、修改用户资料等低冲突业务。
- 请求可以安全重试。
- 用户可以接受“数据已变化，请刷新后重试”。
- 需要减少长事务和锁等待。

乐观锁的问题是：冲突发生时，成本被推迟到了提交阶段。如果热点很高，大家都执行到最后才失败，系统会浪费大量计算和数据库请求。这就是为什么秒杀、抢券这种场景不能只靠朴素乐观锁硬扛。

## ABA 问题与版本号

只比较业务值可能有 ABA 问题。比如库存从 `10` 变成 `9`，又被补回 `10`。如果只检查 `stock = 10`，应用可能误以为这条记录没有变化。

所以乐观锁通常不只比较业务值，而是比较单调递增的版本：

```sql
UPDATE inventory
SET stock = stock - 1,
    version = version + 1
WHERE sku_id = 1001
  AND stock > 0
  AND version = :old_version;
```

版本号把“值是否一样”和“状态是否经历过变化”区分开了。对于审计要求更高的系统，还可以使用 `updated_at`、全局事务 ID、事件流水号或 append-only ledger 来记录变化历史。

## MVCC：读写并发的另一条主线

乐观锁和悲观锁通常讨论“写写冲突”，但数据库还要处理“读写并发”。现代关系数据库普遍使用 MVCC，也就是多版本并发控制。

MVCC 的直觉是：写入不直接覆盖读者正在看的版本，而是保留多个版本，让读事务看到一个一致视图。这样读和写可以减少互相阻塞。PostgreSQL 文档明确把事务隔离和 MVCC 关联起来；InnoDB 也通过 undo log 维护旧版本，从而支持一致性读。

这会带来一个重要结论：数据库里的“锁”不是唯一的并发控制手段。

- 普通 `SELECT` 可能读取快照，不阻塞写。
- `UPDATE` 仍然需要处理写写冲突。
- `SELECT ... FOR UPDATE` 会把读变成锁定读。
- 不同隔离级别下，快照可见性和异常现象不同。

所以讨论“乐观锁/悲观锁”时，必须同时问：当前数据库隔离级别是什么？

## 隔离级别与异常现象

常见隔离级别大致是：

- Read Committed：只能读到已提交数据，但两次查询可能看到不同结果。
- Repeatable Read：事务内多次读取通常看到一致快照。
- Serializable：数据库尽力让并发执行结果等价于某种串行顺序。

隔离级别解决的是事务之间的可见性和一致性问题，但不等于自动解决所有业务并发问题。比如在 `Read Committed` 下，两个事务分别读取余额后再更新，如果没有 `FOR UPDATE` 或原子条件更新，就可能产生丢失更新风险。在更高隔离级别下，数据库可能通过锁、冲突检测或事务回滚来保证语义，但应用仍然需要处理失败重试。

更好的写法是把条件放进单条更新语句里：

```sql
UPDATE inventory
SET stock = stock - 1,
    version = version + 1
WHERE sku_id = 1001
  AND stock >= 1;
```

这比“先查再改”更安全，因为检查和更新由数据库在一个写操作中完成。许多库存扣减场景可以先用这种原子条件更新解决，而不是一上来就开启长事务。

## 怎么选择

一个实用判断框架如下：

| 场景 | 推荐思路 |
| --- | --- |
| 冲突低，失败可重试 | 乐观锁，version 字段 |
| 冲突高，业务流程短 | 悲观锁，`SELECT ... FOR UPDATE` |
| 单行条件扣减 | 原子 `UPDATE ... WHERE stock >= n` |
| 多行资源转移 | 显式事务，固定加锁顺序 |
| 分布式跨库资源 | 优先重构边界；必要时用 Saga/Outbox/TCC |
| 读多写少配置 | 乐观锁 + 用户提示 |
| 金融记账 | append-only ledger + 幂等键 + 强事务 |

在工程实践中，我更倾向于按下面的顺序思考：

1. 能不能把业务变成单条原子 SQL？
2. 如果不能，能不能缩短事务边界？
3. 如果冲突低，使用乐观锁和重试。
4. 如果冲突高，使用悲观锁并控制锁顺序。
5. 如果跨服务跨库，不要假装一个本地锁能解决分布式一致性。

## 常见错误

第一，事务里做外部调用。比如锁住库存行后调用支付接口，锁会被持有很久，系统延迟和死锁概率都会变差。正确做法通常是先冻结资源、提交事务，再异步推进外部流程。

第二，只在应用层加锁。单机 `synchronized`、进程内 mutex 或本地缓存锁无法覆盖多实例部署。真正的共享状态在数据库里，就必须让数据库参与并发控制。

第三，忘记检查更新行数。乐观锁是否成功不是看 SQL 有没有报错，而是看 `affected rows` 是否为 1。

第四，没有幂等。无论乐观锁还是悲观锁，网络重试都可能导致重复请求。订单、支付、库存流水都应该有业务幂等键。

第五，忽略索引。`FOR UPDATE` 是否只锁目标行，取决于数据库执行计划和存储引擎行为。高并发路径必须检查执行计划。

## 小结

乐观锁和悲观锁不是两个 SQL 技巧，而是两种冲突处理哲学：

- 悲观锁把冲突成本前置，用等待换确定性。
- 乐观锁把冲突成本后置，用重试换吞吐。

数据库系统本身还提供 MVCC、隔离级别、行锁、范围锁、唯一约束、原子更新等机制。优秀的并发设计不是迷信某一种锁，而是把业务不变量放到数据库能保证的位置，并让应用层明确处理等待、失败、重试和幂等。

## 参考资料

[1] [PostgreSQL Documentation: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)

[2] [PostgreSQL Documentation: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

[3] [MySQL Reference Manual: InnoDB Locking Reads](https://dev.mysql.com/doc/en/innodb-locking-reads.html)

[4] [MySQL Reference Manual: InnoDB Multi-Versioning](https://dev.mysql.com/doc/refman/8.4/en/innodb-multi-versioning.html)
