---
title: "Optimistic and Pessimistic Locking in Databases: From Inventory Deduction to MVCC and Isolation Levels"
description: "A systematic explanation of optimistic locking, pessimistic locking, MVCC, transaction isolation, and concurrency-control trade-offs in high-concurrency business systems."
category: English
date: 2020-02-10
updated: 2026-06-22
lang: en
translation_url: /2020/02/10/optimistic-pessimistic-lock-in-database/
tags:
  - database
  - software-engineering
---

# The Problem Behind Locking

Optimistic locking and pessimistic locking are usually introduced as two concurrency-control strategies. That definition is correct, but too abstract. In real engineering work, the question is more concrete:

> When multiple transactions try to modify the same data at the same time, how do we prevent incorrect results while keeping throughput acceptable?

Inventory deduction is the classic example. Suppose we have a product with limited stock:

```sql
CREATE TABLE inventory (
  sku_id BIGINT PRIMARY KEY,
  stock INT NOT NULL,
  version INT NOT NULL DEFAULT 0
);
```

If two users buy the last item at the same time, both transactions may read `stock = 1`. Without proper concurrency control, both may believe the order can be placed, and the system oversells.

The key issue is not the SQL statement itself. The issue is the conflict between concurrent reads and writes over shared state.

# Pessimistic Locking

Pessimistic locking assumes conflicts are likely. Therefore, it locks the data before modifying it. Other transactions must wait until the lock is released.

In a relational database, a typical pattern is:

```sql
BEGIN;

SELECT stock
FROM inventory
WHERE sku_id = 1001
FOR UPDATE;

UPDATE inventory
SET stock = stock - 1
WHERE sku_id = 1001
  AND stock > 0;

COMMIT;
```

`SELECT ... FOR UPDATE` asks the database to acquire an exclusive row lock. While the transaction is open, other transactions trying to lock the same row must wait.

The benefit is correctness under high contention. Once a transaction owns the lock, it can safely make decisions based on the current row state.

The cost is blocking. If many transactions compete for the same row, throughput drops and latency increases. If transactions hold locks for too long, the system may also see lock wait timeouts or deadlocks.

Pessimistic locking works well when:

- Conflicts are frequent.
- The protected operation is short.
- Correctness is more important than peak throughput.
- The lock scope can be kept small.

It becomes dangerous when:

- Transactions include slow network calls.
- Locks are acquired in inconsistent order.
- Large ranges are locked unintentionally.
- Business logic holds database locks longer than necessary.

# Optimistic Locking

Optimistic locking assumes conflicts are relatively rare. Instead of locking before doing work, it detects conflicts at update time.

The usual implementation adds a version column:

```sql
SELECT stock, version
FROM inventory
WHERE sku_id = 1001;
```

The application reads `stock` and `version`, performs its business logic, then updates with a compare-and-swap style condition:

```sql
UPDATE inventory
SET stock = stock - 1,
    version = version + 1
WHERE sku_id = 1001
  AND stock > 0
  AND version = 42;
```

If the returned affected-row count is 1, the update succeeded. If it is 0, another transaction changed the row first, so the application should retry or fail gracefully.

The advantage is that no transaction waits for a lock during the read phase. This makes optimistic locking attractive for read-heavy workloads and low-conflict updates.

The cost is retry. Under high contention, many transactions may fail the version check and retry repeatedly. This can waste CPU, increase latency, and put more pressure on the database.

Optimistic locking works well when:

- Conflicts are uncommon.
- The business operation can be retried safely.
- User experience can tolerate a retry or a "please try again" response.
- The system needs high read concurrency.

It becomes problematic when:

- The same row is updated by many concurrent transactions.
- Retrying has side effects.
- The version check is forgotten in some update paths.
- The application treats update failure as success.

# The ABA Problem

A version column is not just a decoration. It prevents a subtle class of bugs often called the ABA problem.

Suppose a value changes from A to B and then back to A. If a transaction only checks the final value, it may think nothing changed. In fact, the row was modified twice.

With a monotonically increasing version, the transaction can detect the change:

```sql
UPDATE inventory
SET stock = 1,
    version = version + 1
WHERE sku_id = 1001
  AND version = 10;
```

Even if the visible stock value returns to the old value, the version no longer matches.

In practice, a version field, update timestamp, or revision number is a simple but important part of optimistic concurrency control.

# MVCC Is Not the Same Thing

MVCC, Multi-Version Concurrency Control, is a database engine technique that allows readers and writers to proceed concurrently by keeping multiple versions of rows.

With MVCC, a transaction reads a snapshot of the database. Writers create new row versions rather than overwriting the visible version in place. This greatly improves read concurrency.

However, MVCC does not automatically solve every write conflict at the business level.

For example, two transactions can both read that a coupon is unused. If both then try to mark it used, the database isolation level and write conditions determine whether one is rejected, one waits, or both produce an invalid business result.

MVCC is a foundation. Optimistic and pessimistic locking are strategies built on top of database behavior and application requirements.

# Isolation Levels and Locking

Transaction isolation defines what anomalies are allowed between concurrent transactions.

Common isolation levels include:

- Read Uncommitted: transactions may read uncommitted data.
- Read Committed: each statement sees only committed data.
- Repeatable Read: reads within a transaction see a stable snapshot.
- Serializable: transactions behave as if executed one by one.

Different databases implement these levels differently. MySQL InnoDB and PostgreSQL both use MVCC, but their locking behavior and Serializable implementations are not identical.

This matters because locking strategies interact with isolation levels.

At Read Committed, a transaction may see different committed values across statements. At Repeatable Read, snapshot reads are stable, but current reads and locking reads may still interact with newer versions. At Serializable, the database may reject transactions to prevent anomalies.

A common mistake is assuming that a high isolation level eliminates the need for business-level concurrency checks. It often does not. For inventory deduction, the safest pattern is still to encode the invariant in the update condition:

```sql
UPDATE inventory
SET stock = stock - 1
WHERE sku_id = 1001
  AND stock > 0;
```

This statement makes the business rule atomic: stock cannot be reduced below zero by this update.

# Choosing Between Optimistic and Pessimistic Locking

The choice depends on conflict probability, retry cost, user experience, and correctness requirements.

Use pessimistic locking when conflict is expected and the operation must be serialized. Examples include deducting the last few units of inventory, assigning unique scarce resources, or updating a financial balance where retry semantics are complicated.

Use optimistic locking when conflict is rare and retry is cheap. Examples include editing profile data, updating configuration records, or saving documents where the user can resolve conflicts.

For high-concurrency inventory systems, a hybrid design is common:

- Use an atomic conditional update for the database invariant.
- Use optimistic retry for moderate contention.
- Use queuing, sharding, or reservation records for hot SKUs.
- Use cache or pre-deduction only when reconciliation is well designed.

The database lock is only one piece of the system design.

# Common Mistakes

The first mistake is holding a pessimistic lock while calling external services. Database locks should protect short critical sections. Payment calls, remote APIs, and slow business workflows should not run inside the locked transaction.

The second mistake is implementing optimistic locking but not checking the affected-row count. If the update affects zero rows, the conflict was detected. Ignoring that result defeats the whole mechanism.

The third mistake is protecting only one code path. If one update uses version checks but another background job updates the row without them, the optimistic lock is no longer reliable.

The fourth mistake is locking too much data. A missing index can turn a row-level operation into a range scan or table-level bottleneck, depending on the database and execution plan.

The fifth mistake is believing that distributed locks are a simple replacement for database concurrency control. Distributed locks can be useful, but they introduce their own failure modes: lease expiration, clock assumptions, client pauses, and lock ownership ambiguity.

# Summary

Optimistic locking and pessimistic locking are not competing slogans. They are two different responses to the same problem: concurrent modification of shared state.

Pessimistic locking prevents conflicts by making other transactions wait. It is simple and strong, but can reduce throughput under contention.

Optimistic locking allows concurrency and detects conflicts at commit or update time. It scales well when conflicts are rare, but depends on correct retry handling.

MVCC improves read-write concurrency, but business correctness still requires careful update conditions, isolation-level awareness, and invariant design.

In production systems, the best answer is often not "use optimistic locking" or "use pessimistic locking." The best answer is to make the business invariant atomic, keep transactions short, measure contention, and choose the simplest concurrency-control strategy that preserves correctness.
