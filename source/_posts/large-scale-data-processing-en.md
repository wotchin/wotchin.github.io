---
title: "Large-Scale Data Processing Systems: From MapReduce to Lakehouse, Streaming, and HTAP"
description: "A systems-oriented review of large-scale data processing: ACID, CAP, BASE, PACELC, MapReduce, Spark, NoSQL, NewSQL, cloud data warehouses, lakehouse, streaming, HTAP, governance, and AI-era data infrastructure."
category: English
date: 2019-08-21
updated: 2026-06-22
lang: en
translation_url: /2019/08/21/large-scale-data-processing/
tags:
  - big-data
  - database
---

# Why Large-Scale Data Processing Exists

Large-scale data processing systems were not invented because engineers like complicated architectures. They appeared because a single machine, a single database, or a single storage engine could no longer satisfy the requirements of modern applications.

The core pressures are familiar:

- Data volume grows faster than single-machine capacity.
- Business decisions require both historical analysis and fresh data.
- Applications need to serve users while analytics systems process the same data.
- Failures are normal at scale, so systems must continue operating through partial failure.
- Cost matters, especially when storage and compute grow independently.

From early MapReduce to modern lakehouse, streaming, and HTAP systems, the history of large-scale data processing is essentially the history of balancing consistency, availability, latency, throughput, cost, and operational complexity.

# Theoretical Foundations: ACID, CAP, BASE, and PACELC

Before discussing systems, it is worth revisiting the basic theory. Large-scale data systems are shaped by trade-offs, and those trade-offs are not optional.

ACID is the traditional transaction model:

- Atomicity: a transaction either completes fully or has no effect.
- Consistency: a transaction preserves declared constraints and invariants.
- Isolation: concurrent transactions should not interfere in invalid ways.
- Durability: once committed, data should survive failures.

ACID is powerful, but it becomes harder to preserve with low latency when data is distributed across machines and regions.

CAP is the classic distributed-systems framing. Under a network partition, a distributed system must choose between consistency and availability.

![CAP theorem as a visual guide to consistency, availability, and partition tolerance](/2019/08/21/large-scale-data-processing/large-scale-data-processing-0.png)

CAP is often misunderstood. It does not say a system can only ever choose two of C, A, and P. Network partitions are unavoidable in distributed systems, so the real question is what the system does during a partition. Does it reject requests to preserve consistency, or serve requests that may temporarily diverge?

BASE is a more pragmatic model often associated with large-scale distributed stores:

- Basically Available.
- Soft state.
- Eventual consistency.

BASE does not mean "no consistency." It means the system accepts temporary inconsistency in exchange for availability and scalability, then relies on reconciliation, compaction, anti-entropy, or application logic to converge.

PACELC extends CAP by pointing out that even when there is no partition, distributed systems still face a trade-off between latency and consistency:

- If there is a Partition, choose between Availability and Consistency.
- Else, choose between Latency and Consistency.

This is closer to day-to-day engineering reality. Most of the time, the system is not in a dramatic partition. It is simply deciding how much coordination is worth paying for on every request.

# MapReduce: Batch Processing as a System Model

MapReduce made large-scale batch processing accessible by reducing distributed computation to two functions: map and reduce.

The programmer writes:

- A map function that transforms input records into intermediate key-value pairs.
- A reduce function that aggregates values with the same key.

The runtime handles partitioning, scheduling, retries, data locality, and failure recovery.

The strength of MapReduce is its simplicity. It made it possible to process massive datasets on unreliable commodity machines. The model is naturally fault tolerant because intermediate work can be recomputed.

The limitation is also obvious: MapReduce is batch-oriented and disk-heavy. Many algorithms require multiple chained jobs, and each stage writes intermediate data. This makes iterative algorithms and interactive analysis inefficient.

MapReduce is important not only as a technology, but as a design philosophy: make distributed processing understandable by constraining the programming model.

# Spark and the DAG Era

Spark improved on MapReduce by introducing a more general DAG execution engine and in-memory computation.

Instead of forcing every computation into map and reduce stages, Spark represents work as a directed acyclic graph. The engine can optimize stages, keep intermediate data in memory, and support iterative workloads more efficiently.

This made Spark useful for:

- ETL pipelines.
- Interactive analytics.
- Machine learning.
- Graph computation.
- Streaming-like workloads through micro-batching.

Spark also helped popularize the idea that a data processing system should provide multiple APIs over one execution engine: SQL, DataFrame, RDD, MLlib, GraphX, and Structured Streaming.

However, Spark does not eliminate the hard problems. Shuffle remains expensive. Memory pressure can be difficult to tune. Small files, data skew, and inefficient joins can still destroy performance. Spark gives engineers a powerful engine, but not immunity from distributed-system physics.

# NoSQL, NewSQL, and the Database Landscape

As web-scale applications grew, traditional relational systems faced pressure from new workload patterns: massive write volume, flexible schema, low-latency key-value access, global replication, and horizontal scalability.

NoSQL systems emerged to address these needs. The family includes key-value stores, document stores, wide-column stores, and graph databases. Many of them relaxed relational constraints and strong transaction semantics in exchange for scale, availability, and operational flexibility.

![A historical database landscape map covering NoSQL, relational, analytic, and NewSQL systems](/2019/08/21/large-scale-data-processing/large-scale-data-processing-1.jpg)

NewSQL systems took a different path. They tried to preserve SQL and transactional semantics while scaling horizontally. Google Spanner is the canonical example: it combines distributed consensus, synchronized clocks, and SQL semantics to provide external consistency at global scale.

The important lesson is that "database" stopped being a single category. Different systems optimize for different parts of the design space:

- OLTP systems optimize for high-concurrency transactions.
- OLAP systems optimize for analytical scans and aggregations.
- Key-value systems optimize for simple low-latency access.
- Search systems optimize for retrieval and relevance.
- Graph systems optimize for relationship traversal.
- Stream systems optimize for continuous computation.

Modern data architecture is rarely one database. It is an ecosystem.

# MPP and Cloud Data Warehouses

Massively Parallel Processing, or MPP, databases divide query execution across many nodes. A coordinator plans the query, data nodes scan and process partitions, and the system exchanges data for joins and aggregations.

![A simplified MPP database architecture with coordinators, transaction manager, and data nodes](/2019/08/21/large-scale-data-processing/large-scale-data-processing-2.jpg)

MPP systems work well for analytical workloads because large scans and aggregations can be parallelized. Classic data warehouses, and later cloud data warehouses, build heavily on this idea.

Cloud data warehouses changed the cost and operations model. Systems such as BigQuery, Snowflake, Redshift, and cloud-native analytic engines made it normal to separate storage and compute, scale compute elastically, and treat infrastructure management as part of the service.

The central architectural shift is decoupling:

- Storage can be cheap, durable, and shared.
- Compute can be elastic and workload-specific.
- Metadata and governance can become platform-level services.

This shift also prepared the ground for the lakehouse architecture.

# Data Lake and Lakehouse

A data lake stores raw and processed data in open formats, often on object storage. It is flexible and cheap, but early data lakes often became "data swamps" because they lacked strong metadata, schema management, quality control, and transactional guarantees.

The lakehouse architecture attempts to combine the flexibility of data lakes with the management features of warehouses. Technologies such as Delta Lake, Apache Iceberg, and Apache Hudi add table formats, transaction logs, schema evolution, time travel, and incremental processing on top of object storage.

The lakehouse idea is attractive because it reduces duplication. Instead of copying data repeatedly between lakes, warehouses, feature stores, and ML platforms, teams can maintain shared data tables with better governance.

This is especially important in the AI era. Model training, feature engineering, evaluation, and analytics often need access to the same governed data assets.

# Streaming Systems

Batch systems answer questions about data that has already accumulated. Streaming systems process events as they arrive.

The key difference is not just latency. Streaming introduces a different model of time:

- Event time: when the event actually happened.
- Processing time: when the system observed it.
- Watermark: the system's estimate of how complete an event-time window is.
- Late data: events that arrive after the expected window.

Systems such as Kafka, Flink, Spark Structured Streaming, and Pulsar address different parts of this space.

Streaming is essential for:

- Real-time monitoring.
- Fraud detection.
- Recommendations.
- User behavior analytics.
- CDC pipelines.
- Operational alerting.

The hard problems are state management, exactly-once semantics, backpressure, ordering, late events, and operational debugging. A streaming job is not simply a faster batch job. It is a long-running distributed application.

# HTAP: Bridging Transactions and Analytics

HTAP, Hybrid Transactional and Analytical Processing, aims to support OLTP and OLAP workloads over the same or closely synchronized data.

The motivation is clear. Traditional architectures often move data from transactional databases into warehouses through ETL or CDC pipelines. This introduces delay, complexity, and consistency gaps. HTAP systems try to reduce that gap.

Common approaches include:

- Row-store and column-store hybrids.
- Replicating transactional changes into analytical replicas.
- Shared storage with different execution engines.
- MVCC-based snapshots for analytical queries.

HTAP is difficult because OLTP and OLAP have conflicting access patterns. OLTP wants low-latency point reads and writes. OLAP wants large scans, joins, and aggregations. A good HTAP system must isolate these workloads while keeping data fresh.

# Query Optimization and Execution

No large-scale data system can avoid query optimization.

The optimizer decides join order, access paths, partition pruning, predicate pushdown, aggregation strategy, and data exchange. The execution engine then turns the plan into operators that run across nodes.

At scale, small mistakes become expensive:

- A bad join order can multiply intermediate data.
- Missing statistics can mislead the optimizer.
- Data skew can overload a few tasks.
- Excessive shuffle can dominate runtime.
- Too many small files can overwhelm metadata and scheduling.

This is why data engineering is not only about writing SQL or Spark code. It is also about understanding physical execution.

# Governance, Quality, and Metadata

As data systems grow, governance becomes part of the architecture rather than an afterthought.

Important capabilities include:

- Catalog and lineage.
- Schema evolution.
- Access control.
- Data quality checks.
- Audit logging.
- Privacy and compliance controls.
- Ownership and lifecycle management.

Without metadata, large-scale data platforms become difficult to trust. Without trust, data products do not scale across teams.

This is also where systems such as Unity Catalog and cloud-native governance platforms become important. They provide a control plane for data assets, permissions, lineage, and discovery.

# Data Infrastructure in the AI Era

AI changes the requirements for data infrastructure.

Traditional analytics mostly asked: what happened, why did it happen, and what should we report? AI systems ask additional questions:

- Is the training data representative?
- Can we reproduce a model run?
- Which features were available at prediction time?
- Is the data fresh enough for retrieval or agent workflows?
- Can we trace a model output back to data sources?
- Can we control access to sensitive data used by models?

This makes data infrastructure more tightly connected with feature stores, vector databases, embedding pipelines, retrieval systems, evaluation datasets, and model observability.

The line between data platform and AI platform is becoming thinner.

# How to Choose a System

There is no universal best system. The right choice depends on the workload.

For high-concurrency transactional workloads, choose a system with strong transaction support and predictable latency.

For large analytical scans, choose a warehouse or lakehouse engine with good columnar execution, pruning, and cost control.

For real-time event processing, choose a streaming system with strong state management and operational tooling.

For search and retrieval, use systems optimized for indexing and relevance.

For AI workloads, consider not only storage and compute, but also metadata, lineage, feature consistency, vector search, governance, and reproducibility.

The best architecture is usually not the most fashionable one. It is the one whose trade-offs match the business problem.

# Conclusion

Large-scale data processing systems evolved through a sequence of trade-offs. MapReduce made distributed batch processing simple. Spark generalized the execution model and improved iterative workloads. NoSQL and NewSQL explored different points in the consistency-scale design space. Cloud warehouses decoupled storage and compute. Lakehouse systems brought transactions and governance to object storage. Streaming systems made event-time processing practical. HTAP tried to close the gap between transactional freshness and analytical power.

The underlying logic has not changed: distributed systems force trade-offs among consistency, availability, latency, cost, and complexity.

What has changed is the workload. In the AI era, data platforms are no longer only reporting systems. They are becoming the substrate for models, agents, retrieval, evaluation, governance, and product intelligence. That raises the bar for correctness, freshness, observability, and trust.
