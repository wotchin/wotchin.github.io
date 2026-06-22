---
title: 大规模数据处理系统：从 MapReduce 到湖仓、流式与 HTAP
description: 重新梳理大规模数据处理系统的演进逻辑：存储计算分离、批流一体、湖仓、HTAP、查询优化和 AI 时代的数据基础设施。
category: Chinese
date: 2019-08-21
updated: 2026-06-21
lang: zh-CN
translation_url: /2019/08/21/large-scale-data-processing-en/
tags:
  - big-data
  - database
---

这篇文章最早写于 2019 年。当时“大数据”仍然经常被当作一个很宽泛的词：Hadoop、Hive、Spark、NoSQL、NewSQL、云原生数据库都可以被放进同一个篮子。几年后再看，这种写法显得过于松散，也容易停留在概念罗列层面。

更好的方式是把大规模数据处理系统看成一组长期存在的工程矛盾：

- 数据规模变大后，如何存储？
- 计算资源如何扩展？
- 失败如何恢复？
- 批处理、流处理、交互式查询、事务处理如何共存？
- 数据如何治理，并被 AI/ML 系统消费？
- 系统如何在性能、成本、复杂度之间取平衡？

本文按这些问题重新梳理大规模数据处理系统的演进。

## 一条更底层的线索：ACID、CAP、BASE 与 PACELC

如果只从产品名看，大规模数据处理系统很容易变成 Hadoop、Spark、Kafka、Flink、TiDB、Snowflake、Databricks 的名词列表。更有解释力的视角，是先看系统在做哪些取舍。

传统数据库最核心的承诺是事务的 ACID：

- Atomicity：事务要么全部成功，要么全部失败。
- Consistency：事务执行前后，数据库约束保持成立。
- Isolation：并发事务之间不能互相污染。
- Durability：事务提交后，结果不会因为进程崩溃而丢失。

这套承诺非常适合银行转账、订单扣库存、账户余额这类业务。问题在于，当系统从单机走向分布式，数据不再只存在一台机器上，ACID 里的隔离、持久化和一致性都要跨网络完成。网络是不可靠的，节点会故障，消息会延迟，时钟会漂移，于是分布式数据系统首先遇到 CAP 定理。

{% asset_img large-scale-data-processing-0.png "CAP theorem as a visual guide to consistency, availability, and partition tolerance" %}

CAP 的三个字母分别是：

- Consistency：所有读请求都能看到同一份最新数据，更接近线性一致性语义。
- Availability：每个非故障节点都能在有限时间内返回响应。
- Partition tolerance：网络分区发生时，系统仍然能继续运行。

一个常见误解是“系统可以自由三选二”。现实里，分布式系统必须面对网络分区，所以真正困难的是：当分区发生时，到底优先保证 C 还是 A。CP 系统倾向于在无法确认多数派或一致状态时拒绝服务；AP 系统倾向于继续服务，但允许短时间读到旧值或产生冲突，之后再通过补偿、合并或异步复制修复。

这也是 BASE 思想出现的背景。BASE 不是 ACID 的简单反面，而是一种面向高可用系统的工程妥协：

- Basically Available：系统尽量保持可用，必要时降级。
- Soft state：系统允许中间状态存在。
- Eventually Consistent：最终收敛到一致状态。

CAP 解释了网络分区时的选择，但没有解释“没有分区时”的日常代价。PACELC 补上了这一点：如果发生 Partition，系统在 Availability 和 Consistency 之间选择；Else，即没有分区时，系统仍然要在 Latency 和 Consistency 之间取舍。换句话说，即使网络正常，跨地域强一致读写也会付出延迟成本。

这个框架解释了很多后续技术路线：

- NoSQL 系统优先解决水平扩展和高可用，通常牺牲一部分关系模型、事务能力或强一致性。
- NewSQL 系统试图同时保留 SQL、事务、强一致和水平扩展，于是引入 Paxos/Raft、分片、分布式事务、全局时间戳等机制。
- 云数仓和 Lakehouse 通常弱化高并发事务，把重点放在低成本存储、弹性计算和分析吞吐。
- HTAP 系统尝试把事务新鲜度和分析能力拉近，但要处理行存/列存、隔离、资源隔离和复制延迟之间的矛盾。

## 第一阶段：以批处理为中心

早期大规模数据处理的经典范式是 Google 的 GFS + MapReduce。GFS 解决大规模分布式文件存储问题，MapReduce 则把大任务拆成 map 和 reduce 两个阶段，由运行时负责调度、容错和数据交换。

MapReduce 的意义不在于 API 多优雅，而在于它把三个复杂问题封装起来：

- 数据分片：大文件切成块，分布在多台机器上。
- 计算调度：任务尽量靠近数据执行，减少网络传输。
- 失败恢复：机器故障是常态，任务可以重试。

Hadoop 生态把这套思想开源化，形成 HDFS、MapReduce、Hive 等系统。Hive 的价值是让用户用 SQL 表达分析逻辑，而不是手写 MapReduce 程序。

但 MapReduce 的批处理模型也有明显问题：每个阶段都需要落盘，中间结果重，延迟高，不适合交互式分析和迭代式机器学习。

## 第二阶段：以内存计算和 DAG 为中心

Spark 的兴起可以理解为对 MapReduce 的两点修正：

第一，把计算表达成 DAG，而不是固定的 map/reduce 两阶段。这样优化器可以更灵活地安排算子。

第二，把中间数据尽量放在内存里，减少反复落盘带来的开销。对于迭代算法、交互式查询和复杂 ETL，性能会好很多。

从系统视角看，Spark 代表了大规模数据处理从“批处理框架”转向“通用分布式计算引擎”。SQL、DataFrame、流处理、机器学习库都可以放在同一个执行框架上。

不过 Spark 并没有消灭数据仓库。原因很简单：企业分析系统不仅需要计算，还需要稳定的 SQL 性能、权限、元数据、优化器、并发控制、成本治理和运维体验。这些恰恰是传统数据库和云数仓长期积累的能力。

## NoSQL 与 NewSQL：分布式约束下的两条回应

互联网业务把数据系统推向了两个方向：一边是海量用户和高并发访问，另一边是更复杂的数据形态。用户画像、Feed、日志、文档、图关系、缓存、搜索索引，不一定都适合塞进单机关系数据库。NoSQL 的出现，本质上是为了优先解决扩展性、可用性和灵活数据模型。

早期 NoSQL 生态可以粗略分为 key-value、document、wide-column、graph 等模型。下面这张旧图虽然有明显时代痕迹，但仍然有助于理解当时业界如何把数据库系统按照数据模型和 workload 进行划分。

{% asset_img large-scale-data-processing-1.jpg "A historical database landscape map covering NoSQL, relational, analytic, and NewSQL systems" %}

NoSQL 的价值不是“不要 SQL”，而是把单机关系数据库不擅长的一部分问题拆出去。例如：

- key-value/cache 适合极低延迟读写和缓存穿透保护。
- document database 适合 schema 变化较快的半结构化业务对象。
- wide-column store 适合大规模稀疏列和高写入吞吐。
- graph database 适合关系遍历和路径查询。

但 NoSQL 也带来了代价：跨记录事务变弱，复杂查询能力变弱，数据一致性和二级索引维护更依赖应用层。很多公司最后发现，业务最初为了扩展性拆掉 SQL 和事务，后面又在应用层手写了一堆半成品数据库能力。

NewSQL 可以理解为对这个问题的反向修正：能不能在分布式架构下继续保留 SQL、ACID 事务、强一致复制和水平扩展？Spanner、CockroachDB、TiDB、OceanBase 这类系统大多沿着这条路线前进。它们通常会组合几类技术：

- shared-nothing 分片，把数据按 key range 或 hash 分布到多个节点。
- Raft/Paxos 多副本复制，让每个分片内部具备强一致和故障切换能力。
- 分布式事务协议，处理跨分片写入的一致性。
- MVCC 和时间戳，支撑快照读、并发控制和历史版本。
- SQL 优化器，把逻辑计划拆成分布式执行计划。

所以 NewSQL 不是“比 NoSQL 更新”的营销词，而是把关系数据库能力重新带回分布式系统的一次工程整合。它解决的问题更接近 OLTP 和实时业务，而不是替代所有离线分析平台。

## 第三阶段：云数仓与存储计算分离

云数仓的核心变化是存储和计算解耦。数据放在廉价、弹性、可靠的云对象存储或分布式存储上，计算集群按需扩缩容。

这种架构解决了传统 MPP 数据仓库的几个痛点：

- 存储和计算不再绑定扩容。
- 多个计算集群可以共享同一份数据。
- 冷热数据可以用不同成本管理。
- 弹性资源让峰值查询更容易处理。

但存储计算分离也不是免费午餐。远端存储访问延迟更高，缓存、数据布局、元数据管理、文件大小、统计信息和查询优化变得更重要。一个云数仓是否好用，往往取决于它能不能把“远端数据”伪装得像“本地数据”一样高效。

## 第四阶段：Lakehouse 的出现

传统数据湖的问题是：便宜、开放、能存一切，但治理弱、事务弱、数据质量差。传统数据仓库的问题是：性能和治理强，但成本高、格式封闭、对机器学习和非结构化数据支持不自然。

Lakehouse 试图把二者合并：底层使用开放文件格式和对象存储，上层提供类似仓库的事务、schema、元数据、权限和性能优化。CIDR 2021 的 Lakehouse 论文把这个趋势总结为新的数据平台架构。

从工程角度看，Lakehouse 的关键不是名字，而是这几项能力：

- 开放数据格式，例如 Parquet/ORC。
- 表格式元数据和事务日志。
- schema evolution 和 time travel。
- 批处理、流处理、BI、ML 访问同一份数据。
- 数据治理和权限控制下沉到统一 catalog。

这类架构的本质是：把“文件集合”重新变成“可管理的表”。

## 流处理：从延迟补丁到主链路

早期很多公司把流处理当作离线数仓的补丁：离线 T+1 太慢，所以用 Kafka + Storm/Flink 做实时指标。

现在更合理的理解是：流处理是一种持续数据计算模型。它处理的不是“更快的批任务”，而是不断到来的事件。这里的核心问题包括：

- 事件时间和处理时间的区别。
- out-of-order 数据如何处理。
- watermark 如何推进。
- exactly-once 语义到底覆盖到哪里。
- 状态如何 checkpoint 和恢复。

Flink 这类系统的价值不只是低延迟，而是把状态管理、时间语义和容错放进统一运行时。实时风控、实时推荐、实时画像、CDC 入湖、流式 ETL 都依赖这些能力。

## HTAP：事务与分析的再融合

OLTP 和 OLAP 的分离来自现实约束：事务系统追求低延迟和高并发写入，分析系统追求大扫描和复杂聚合。二者数据结构、执行引擎和资源模型都不同。

但分离会带来数据新鲜度和系统复杂度问题。业务库的数据要同步到数仓，链路里有 CDC、消息队列、ETL、质量校验和延迟。一旦链路复杂，排障和治理成本就会上升。

HTAP 的目标是让同一份业务数据更快进入分析路径，甚至在同一系统里同时支持事务和分析。典型做法包括：

- 行存服务 OLTP，列存副本服务 OLAP。
- Raft/Paxos 复制保证事务一致性。
- 后台异步构建分析副本。
- 优化器根据 workload 选择不同执行路径。

从历史上看，MPP 数据库也是这条融合路线的重要前身。MPP 通常采用 shared-nothing 架构，把 SQL 计划拆成多个子计划，由 coordinator 分发给 data node 并行执行。它更偏 OLAP，但已经体现出“SQL 优化器 + 分布式执行 + 数据分片”的组合思想。

{% asset_img large-scale-data-processing-2.jpg "A simplified MPP database architecture with coordinators, transaction manager, and data nodes" %}

MPP 的优势是并行扫描、并行 join 和高吞吐分析；劣势是弹性、事务能力、跨节点数据重分布和运维复杂度。云数仓继承并产品化了 MPP 的很多思想，而 NewSQL/HTAP 则把这套分布式执行能力进一步带回事务系统。

HTAP 很有吸引力，但不要误解成“一个系统替代所有系统”。在极大规模历史分析、复杂数据治理和多源融合场景下，湖仓/数仓仍然有价值。HTAP 更适合高新鲜度分析、运营看板、实时决策和中等复杂度的混合负载。

## 查询优化仍然是核心

无论系统包装成 Hadoop、Spark、云数仓、Lakehouse 还是 HTAP，最终都绕不开查询优化。

大规模数据处理里最昂贵的通常不是单个算子，而是错误的数据移动：

- Join 顺序错误会造成中间结果爆炸。
- 小文件过多会拖垮元数据和调度。
- 数据倾斜会让少数 task 成为瓶颈。
- 不准确的统计信息会误导优化器。
- 过度 shuffle 会把网络变成瓶颈。

因此现代系统会在多个层次优化：

- 逻辑优化：谓词下推、列裁剪、投影合并。
- 物理优化：join 算法选择、broadcast、sort-merge、hash join。
- 运行时优化：adaptive query execution、动态过滤、运行时统计。
- 存储优化：分区、排序、聚簇、索引、数据跳过。
- 成本治理：资源队列、弹性扩缩容、缓存策略。

这也是数据库技术和大数据技术逐渐融合的原因：大数据系统越来越需要数据库优化器，而数据库系统越来越需要分布式执行能力。

## 数据治理成为系统能力

大规模数据处理的后半场不再只是“算得动”。企业真正痛苦的问题往往是：

- 这张表是谁生产的？
- 字段含义是什么？
- 数据是否可信？
- 口径变更影响哪些报表和模型？
- 谁有权限访问敏感字段？
- 模型训练用的数据是否可追溯？

所以 catalog、lineage、quality、privacy、access control、data contract 变得越来越重要。没有治理能力的数据平台，只是一个更大的临时文件夹。

AI 时代会进一步放大这个问题。RAG、特征工程、模型评估、训练数据构建都依赖数据质量和可追溯性。未来的数据平台不会只是 BI 的后端，也会成为 AI 应用的基础设施。

## AI 时代的新变量

AI 给大规模数据处理带来三个新需求。

第一，非结构化数据进入主链路。文档、图片、音频、日志、代码、网页都需要被解析、清洗、切分、向量化和索引。

第二，向量检索和结构化查询开始融合。很多应用既要 SQL 过滤，也要 embedding search，还要权限控制和 freshness。

第三，数据处理和模型推理之间的边界变模糊。特征生成、prompt 构造、检索、rerank、模型调用、结果评估，都可能出现在同一条数据链路里。

这意味着未来的数据平台会更像“数据 + 计算 + AI runtime”的组合，而不是单纯的离线数仓。

## 一个实用的架构判断框架

如果从业务问题出发，而不是从产品名出发，可以按下面的方式选择技术：

| 需求 | 更适合的系统 |
| --- | --- |
| T+1 离线报表 | Lakehouse / 数仓 / Spark |
| 交互式 BI | 云数仓 / MPP / OLAP 引擎 |
| 实时指标 | Kafka + Flink / 流式 SQL |
| 事务系统 | MySQL/PostgreSQL/NewSQL |
| 高新鲜度分析 | HTAP / CDC + OLAP |
| 海量历史数据低成本存储 | Data Lake / Lakehouse |
| ML 特征与训练数据 | Lakehouse + Feature Store |
| RAG 数据管道 | 文档处理 + 向量库 + 元数据治理 |

架构上最危险的不是选错一个组件，而是没有意识到组件之间的数据边界、延迟边界和治理边界。

## 小结

大规模数据处理系统的发展不是简单的“新技术淘汰旧技术”。更准确的演进逻辑是：

- GFS/MapReduce 解决了廉价机器上的批处理规模化。
- Spark 把批处理扩展成通用分布式计算。
- 云数仓把存储计算分离和弹性资源产品化。
- Lakehouse 试图统一开放数据湖和数据仓库治理。
- 流处理把持续事件计算变成主链路。
- HTAP 试图缩短事务数据到分析数据的路径。
- AI 时代要求平台同时处理结构化、非结构化和向量化数据。

今天再谈“大数据”，不应该停留在 Hadoop、Spark、NoSQL 的名词列表，而应该回到系统问题本身：数据在哪里，计算在哪里，状态如何维护，失败如何恢复，语义如何保证，成本如何控制，以及这些能力如何服务业务决策和 AI 应用。

## 参考资料

[1] Jeffrey Dean and Sanjay Ghemawat, [MapReduce: Simplified Data Processing on Large Clusters](https://research.google.com/archive/mapreduce-osdi04.pdf), OSDI 2004.

[2] Sanjay Ghemawat, Howard Gobioff, and Shun-Tak Leung, [The Google File System](https://research.google.com/archive/gfs-sosp2003.pdf), SOSP 2003.

[3] James C. Corbett et al., [Spanner: Google's Globally-Distributed Database](https://www.usenix.org/system/files/conference/osdi12/osdi12-final-16.pdf), OSDI 2012.

[4] Michael Armbrust et al., [Lakehouse: A New Generation of Open Platforms that Unify Data Warehousing and Advanced Analytics](https://www.cidrdb.org/cidr2021/papers/cidr2021_paper17.pdf), CIDR 2021.
