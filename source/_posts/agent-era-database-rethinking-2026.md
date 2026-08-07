---
title: "Agent时代，数据库社区真的定义了“新问题”吗？"
description: "针对当前某些技术社区对AI Agent带来冲击的再思考"
category: Chinese
date: 2026-08-07
updated: 2026-08-07
mathjax2: true
lang: cn
tags:
  - ai-agent
  - database
  - agent-memory
  - agent-trace
  - ai-infra
---

最近一段时间，我一直在思考一个问题：当数据库开发者开始讨论 AI Agent、Memory、Trace、VectorDB、GraphDB、Agent State、Data Lakehouse 这些方向的时候，我们到底是在面对一批真正新的系统问题，还是只是把过去几十年已经解决过的问题，重新放到了一个新的应用场景中？

这个问题并不是说这些工作没有价值。恰恰相反，其中很多工作非常有工程价值，也可能形成非常成功的商业产品。但我越来越觉得，**“有工程价值”“有商业价值”和“提出了真正的新问题”，其实是三件不同的事情。**

今天 Data × Agent 领域一个很容易出现的误区，就是把这三件事情混在了一起。于是无论学术界还是工业界，我们都可以听到一些类似“Agent 时代数据库会越来越重要”“AI 时代其实是数据库人的机会”甚至“Agent 最终就是一个数据库问题”的说法。这些话未必错，但如果数据库社区不断自己提出 Agent 需要什么，再自己论证为什么数据库可以解决它，最后再自己得出“所以数据库非常重要”的结论，就很容易陷入一种循环论证式的“自嗨”。

所以，我真正想讨论的并不是“数据库到底重不重要”。这个问题没有太大意义，操作系统、网络、编译器、GPU、存储当然都重要。真正值得讨论的是另一个问题：**Agent 时代究竟出现了哪些真正的新问题？数据库社区现在是在发现这些问题，还是主要在用过去熟悉的方法解决一批换了名字的旧问题？**

我倾向于用一种很朴素的“问题主义”来看待技术进步：技术发展的基本单位首先是问题，而不是解决方案。判断一个领域有没有真正向前走，不应该先看它创造了多少新名词、多少新产品，而应该看我们对问题本身的认识有没有发生变化。这种视角其实并不新鲜，科学哲学家 Larry Laudan 在 1977 年的《Progress and Its Problems》中，就把科学首先理解为一种“解决问题的活动”，并尝试从解决问题的有效性来理解科学进步。[1]

## 一、新名词不等于新问题

Memory 是今天 Agent 领域最典型的例子。

Long-term Memory、Episodic Memory、Semantic Memory、Working Memory、User Memory、Shared Memory……围绕 Memory 的新分类越来越多，相应地又出现了 Memory Database、Memory Service、Memory Framework 等一系列系统。

但是，如果把这些系统一层一层剥开，**相当一部分当前 Agent Memory 的存储与召回层**仍然可以抽象成：

[
Memory = Extract + Store + Index + Retrieve + Rank + Inject
]

一段历史交互经过信息抽取，被保存到某种存储中，再通过关键词、向量或者混合索引召回，经过排序以后重新放回上下文。

如果把“Agent”这个名字暂时拿掉，会发现其中的大多数问题都非常熟悉。BM25 是传统信息检索技术，Embedding 对应向量检索，Hybrid Search 是稀疏检索与稠密检索结合，Rerank 是搜索排序问题，Cache、TTL、Partition、Replication、Compression 也都是已经研究多年的系统机制。

简单一点的个人 Agent，`markdown + grep` 可能已经能够满足需求；复杂一点，可以变成：

[
BM25 + Embedding + Metadata\ Filter + Reranker
]

它们实现方式不同，效果不同，性能不同，但解决的核心问题仍然是同一个：

**如何从过去的信息中，找到现在需要的信息。-- 这就是信息检索。**

当然，这里讨论的是 Memory 中“保存和召回历史信息”这一层，而不是把所有 Agent Memory 都等价成信息检索。恰恰相反，当问题继续发展到记忆反思、经验抽象和行为改变时，它已经开始超出传统检索的边界。2026 年 ACL Findings 的综述《From Storage to Experience》就把 Agent Memory 的发展划分为 Storage、Reflection 和 Experience 三个阶段：保存 trajectory 只是第一层，继续向前的问题已经变成如何反思、整合和抽象过去的经验。[2]

我们可以把 grep 换成 BM25，把 BM25 换成向量检索，再把向量检索做成混合检索；可以把召回率从 60% 提高到 80%，把延迟从 100ms 降低到 10ms。这些当然都是进步，但它们更多是在**用不同的刀切同一道菜**。

刀越来越锋利，不等于菜变了。

这也是我理解“技术螺旋上升”时一个很重要的区别：大家总喜欢强调“螺旋”，但真正重要的是“上升”。

围绕同一个问题不断优化，就是螺旋的一部分。grep、BM25、向量检索、混合检索，可能都在同一个问题平面上不断绕圈，而且每绕一圈都会做得更好。但真正的“上升”，一定意味着问题本身发生了变化。

比如有人不再问“怎样找到最相关的 Memory”，而开始问：

**什么东西根本不应该被存下来？**

这就不是换了一把更锋利的刀。

这是换了一道题。

{% asset_img p1.png "两条发展路径对比" %}

Trace Database 也是类似的情况。Agent 会产生大量 prompt、response、span、tool call、tool result、latency、evaluation result，这构成了一个新的工作负载，但新的工作负载不自动等于新的系统问题。

LangChain 的 SmithDB 是一个很好的例子。它针对 LangSmith 的 Agent Trace 工作负载进行了专门设计，使用对象存储保存大量持久化数据，用关系数据库保存 segment metadata，并设计相应的 ingestion、query、compaction 和索引机制。它需要面对长时间 span 持续更新、TTL、最新数据查询、全文检索、去重等现实问题，因此绝不能简单地把它说成“一个 append-only log”。LangChain 自己也明确把 SmithDB 描述为一个 object-storage-backed LSM，并强调它是针对 Agent observability workload 做的深度定制。[3]

但是从技术谱系上看，它大量使用的仍然是已经存在多年的数据库思想：LSM-tree、segment、compaction、inverted index、object storage、metadata management。

所以这里应该明确区分：

[
旧机制 + 新工作负载 \rightarrow 更好的系统
]

和：

[
新问题 \rightarrow 新抽象 \rightarrow 新机制
]

前者当然重要，而且是数据库工程最擅长的事情。但它和后者并不是一回事。

## 二、问题还需要再往下挖

现在数据库社区一个很典型的思维路径是：AI 社区说 Agent 需要 Memory，于是我们做 Memory System；召回性能不够，就增加 BM25、Vector Index、Cache、Tiered Storage；单机不够，就做分布式；进入企业以后，再补上 HA、Security、Multi-tenancy、Observability 和 Disaster Recovery。

整个过程没有问题。

但它基本可以概括成三个层次：

[
Do\ the\ same \rightarrow Do\ it\ better \rightarrow Do\ more
]

第一层，把原来的能力搬过来；第二层，把它做得更好；第三层，则是让系统能够做原来做不到的事情。

数据库社区现在非常擅长前两层，却经常在第三层之前停下来。

Memory 就是这样。

大家都在讨论怎么把 Memory 存得更便宜、找得更准确、访问得更快，但应该继续追问一句：

**Agent 为什么需要 Memory？**

是因为上下文窗口不够长？Attention 成本太高？模型参数无法实时改变？模型缺乏可靠的持久状态？还是因为现实世界的信息持续变化，不适合固化到模型参数中？

这些原因看起来都可以导向“Memory”，但它们实际上是完全不同的问题。

一旦把问题问到这里，Memory Database 就不再是答案本身，而只是众多可能答案中的一种。

这里可以使用一个很有用的反事实思维实验。假设：

[
Storage\ Cost = 0
]

[
Retrieval\ Latency = 0
]

[
Context\ Length = \infty
]

然后问一句：

**原来的问题还存在吗？**

如果我们研究的是“怎样从 10 亿条历史记录中，在 10ms 内找出最相关的 20 条 Memory”，那么当 Retrieval Latency = 0 时，这个问题基本就消失了。这说明它主要是一个工程约束下的问题。

但如果问题是：“什么应该记住？”“什么不应该记？”“什么时候应该忘？”“两条记忆冲突时应该相信哪一个？”“为什么一条过去的信息最终影响了今天的某个决策？”这些问题即使在无限存储、无限上下文和零延迟的思想实验中，依然不会自动消失。

更重要的是，“上下文容量更大”本身也不等于“拥有了可靠的长期状态”。已有长上下文研究发现，即使信息已经放在模型支持的上下文窗口中，模型对不同位置的信息利用能力仍然可能显著不同。[4] 因此，更严谨的说法应该是：

[
Context\ Capacity \neq Persistent\ State
]

[
Context\ Capacity \neq Freshness
]

[
Context\ Capacity \neq Shared\ Mutable\ Truth
]

这说明我们已经从：

[
信息检索
]

进入了：

[
语义 + 状态 + 学习 + 策略
]

这就是从“绕着问题继续转”开始向上爬了一层。

所以真正值得注意的并不是 Memory 今天用了 BM25 还是 Vector Search，而是 **Memory 这个问题本身是否正在发生性质变化。**

2026 年一些 Agent Memory 研究已经开始把 Memory Management 看成一个包含写入、管理和读取的完整循环，并开始讨论遗忘、经验整合、持续学习等问题。[2] 这个变化很关键，因为关注点开始从“怎么存”和“怎么找”转向“为什么保存”“保存什么”和“什么时候应该改变已有记忆”，这才开始触碰真正的新问题。

## 三、从“记住什么”到“改变什么”

顺着 Memory 继续往下追问，会发现 Context、Memory、State 和 Truth 并不是一回事：

[
Context \neq Memory \neq State \neq Truth
]

例如一个旅行 Agent。上下文中可能写着“用户准备周五晚上从北京去上海”；系统记住“用户偏好靠窗”；搜索工具返回“CAxxx 当前还有座位”。

这些都还没有改变现实。

只有当 Agent 真正调用 Booking API，并获得有效的 reservation ID 时，现实世界的状态才被改变。

这时候 Agent 已经从：

[
Read\ the\ World
]

走到了：

[
Mutate\ the\ World
]

问题也因此发生变化。

当 Agent 只是读取信息时，我们关心的是检索准确率；当 Agent 开始修改现实世界时，我们就必须考虑一致性、并发、隔离、幂等、回滚、恢复和冲突。

这并不是“数据库可以把这些问题做得更快”，而是 Agent 本身的计算性质发生了变化。

Microsoft 在介绍 STATE-Bench 时甚至直接指出：很多所谓 Memory Benchmark 实际上仍然只是 retrieval test——例如从几十轮之前找回一个名字或者事实，这只能说明“检索管道工作了”，不能证明 Agent 因此变得更好。STATE-Bench 因而把评估推进到真实的有状态任务中：Agent 不仅需要遵循流程，还会修改退款记录、预订状态和账户信息等数据库状态。此时错误已经不再只是“回答错了”，而可能是“把现实系统的状态改错了”。[5]

所以这里值得注意的不是某个具体 benchmark，而是整个问题正在从“有没有记住”向“能否基于过去的经验正确地行动”移动。未来的 Agent 可能不能简单理解为“一个带 Memory 的 LLM”。

它更像一个：

[
Agent =
Model + State + Computation + Environment + Action
]

也就是一个真正的有状态计算系统，而“有状态计算系统”与“带检索功能的模型”是两个完全不同的抽象。这就是一次真正的问题上升。

## 四、技术史上的上升从来不是“换一把刀”

如果回头看计算机技术史，会发现真正重要的变化往往都不是“原来的方案再快 30%”，而是人们突然换了一种方式理解问题。

1970 年，Codd 提出关系模型时，真正重要的并不是发明了一种更快的数据结构，而是把数据的逻辑表示与物理表示分开，让用户不需要依赖数据在机器内部的具体组织形式。[6]

用户表达：

“我要什么。”

系统负责：

“怎么实现。”

于是逐渐形成：

[
Logical\ Intent \neq Physical\ Execution
]

SQL 的真正意义不只是方便写查询，而是改变了人与数据系统之间的抽象边界。1979 年，Selinger 等人在 System R 的经典查询优化论文中进一步把这种思想工程化：SQL 请求以非过程式方式描述需要的数据，而系统根据代价选择具体的 access path。[7]

后来查询优化器进一步把这个思想推进：

[
Plan^*=\arg\min_{p\in P}Cost(p)
]

用户不需要指定先扫哪张表、使用 Hash Join 还是 Merge Join、是否下推谓词。系统自己寻找执行计划。

Transaction 也是一样。它真正重要的地方，并不是把几个 write 打包起来，而是人为建立了一个可以推理的状态边界：什么叫成功，什么叫失败，什么时候其他人可以看见，发生故障以后应该恢复到哪里。Jim Gray 在 1981 年对 Transaction Concept 的经典讨论中，甚至直接把 transaction 定义为一种具有原子性、持久性和一致性的“状态变换”，并指出这种抽象可能适用于更一般的程序系统，而不仅仅是数据库。[8]

LSM-tree 同样不是因为 B-tree 突然“不能用了”，而是在新的 I/O 条件和写入模式下，人们重新组织了读写之间的权衡。[9]

所以数据库技术史不断重复一个模式：

[
新约束
\rightarrow
旧抽象暴露不足
\rightarrow
重新定义问题
\rightarrow
形成新抽象
\rightarrow
出现新机制
]

注意，这也是一个螺旋上升的过程。

新的机制不会把旧技术全部推翻。关系数据库没有消灭文件系统，LSM-tree 没有消灭 B-tree，分布式数据库也没有消灭单机数据库。

历史不断绕回来，但每一次真正重要的绕回来，都比上一次多了一层新的认识。

**螺旋上升的重点从来不是“又绕了一圈”，而是“这一圈比上一圈高在哪里”。**

如果 Agent Memory 从 grep 变成 BM25，再从 BM25 变成 Vector Search，这当然是在进步，甚至在很多年前的信息检索领域是“质的飞跃”，但我们仍然有必要问：现在，在 Agent 领域，**它到底升高了吗？**

## 五、数据库真正的遗产是一套“问题语言”

这也引出另外一个问题：AI 社区未必真正了解数据库过去几十年积累了什么，而数据库社区自己有时候也把自己的能力理解得太窄。

数据库人的价值当然包括 B+Tree、LSM-tree、Buffer Pool、WAL、Hash Join 和 Query Optimizer，但这些都只是具体机制。

数据库真正长期积累下来的是一套“问题语言”。别人说“数据一直在变化”，数据库人会想到 Version；别人说“很多人同时修改”，会想到 Concurrency；别人说“不能看到乱七八糟的中间状态”，会想到 Isolation；别人说“系统挂了也不能错”，会想到 Recovery；别人说“这个结果是由其他数据推导出来的”，会想到 Derived Data；别人说“同一个目标可以有很多执行方式”，会想到 Optimization。

所以数据库人的思维往往会下意识追问：

[
What\ is\ state?
]

[
What\ is\ visible?
]

[
What\ is\ committed?
]

[
What\ is\ derived?
]

[
What\ is\ stale?
]

[
What\ can\ be\ recomputed?
]

[
What\ is\ the\ cost?
]

这些问题比具体用了什么索引重要得多。比如两个 Agent 同时修改一份 Shared Memory，一个普通的 Agent Framework 可能看到的是一个共享 JSON；数据库人的条件反射则可能是：谁先发生？哪个版本可见？有没有 write-write conflict？冲突如何合并？这并不意味着数据库人的答案一定更先进。真正重要的是，不同领域会用不同的方式表示同一个问题：

[
Representation_{AI}(X)
\neq
Representation_{DB}(X)
]

而问题的表示方式决定搜索空间：

[
Representation
\rightarrow
Search\ Space
\rightarrow
Problems\ We\ Can\ See
]

这就是跨领域研究真正有价值的地方，不是把数据库人的 B+Tree 搬给 AI 人用，也不是 AI 人说需要一个 Memory，数据库人就做一个 MemoryDB。

而是两个领域面对同一个问题时，其中一方突然说：

**“你为什么一定要这样定义这个问题？”**

## 六、Memory 真正的变化发生在问题边界

再回到 Memory，最开始的问题是：

[
History \rightarrow Store \rightarrow Retrieve
]

接下来可能变成：

[
History \rightarrow Reflection \rightarrow Memory
]

继续往前：

[
Trajectory + Outcome \rightarrow Experience
]

然后：

[
Experience \rightarrow Future\ Policy
]

到了最后一步，Memory 已经不再只是“过去发生过什么”。

它变成了：

“过去哪里做错了？”

“什么做法曾经成功？”

“以后遇到类似情况，应该改变什么行为？”

于是：

[
Memory
\rightarrow
Experience
\rightarrow
Learning
]

问题边界已经改变。这也与前面提到的“Storage → Reflection → Experience”的研究脉络相呼应。[2]

原来我们优化的是：

[
Retrieve(x)
]

现在开始考虑：

[
\pi_m(s)
\rightarrow
{store,retrieve,merge,summarize,update,forget}
]

也就是：模型或者系统需要决定什么值得记住、什么时候应该更新、什么时候应该遗忘。尤其是“遗忘”这个问题很有意思，传统 Memory System 很容易默认：

**存得越多越好。**

因为存储系统天然关心的是如何高效地保存数据，但对于 Agent 来说，也许真正的问题恰恰是：

**哪些东西绝对不应该存？**

错误信息怎么办？过期信息怎么办？一次偶然行为是否应该成为长期经验？短期偏好是否应该被固化？两个互相矛盾的历史事实如何处理？

当我们开始研究这些问题时，已经不是在比较 grep、BM25 和 Vector Search。

这相当于从：

“我应该用什么刀切菜？”

变成：

“这道菜里什么东西根本不应该下锅？”

问题已经不是同一个问题了，也意味着，这可能并不是数据库人所熟悉的问题了。但是，正是这种陌生感，才会不断推动对“问题边界”的探索。

{% asset_img p2.png "换刀还是换问题" %}

## 七、为什么大家总在研究同一批问题？

既然这个道理并不复杂，为什么技术社区还是很容易不断聚集到少数几个问题上？

我觉得不能简单归结为研究者缺乏创造力，也不能说大家都只是跟风，这更像是一个群体注意力分配问题。整个研究社区能够投入的研究者、资金、GPU、论文名额、创业资源和职业机会都是有限的，于是整个系统必须不停判断：

**什么问题最值得投入？**

某个方向出现一篇重要论文，就会获得更多引用；更多引用带来更多关注；大公司开始进入以后，又产生 benchmark、产品和招聘需求；这些信号继续吸引更多研究者。

于是形成：

[
Attention_t
\rightarrow
Results
\rightarrow
Visibility
\rightarrow
Attention_{t+1}
]

Merton 在 1968 年提出的“马太效应”本身就是对科学共同体中累积优势的分析：已经获得声望和认可的科学家，更容易进一步获得信用和资源。[10] 后来的网络科学又使用 preferential attachment 等模型刻画了类似的自增强结构。

所以：

“很多优秀的人都在研究 X”

本身当然是有信息量的。

我们可以把它**类比成一种低成本的贝叶斯更新**：

[
P(X\ is\ valuable \mid Many\ Experts\ Study\ X)

>

P(X\ is\ valuable)
]

它不是一个严格的贝叶斯模型，而是在表达一种很常见、也很合理的判断机制：当越来越多优秀的人投入一个方向时，我们自然会提高对这个方向价值的判断。

问题只是，一旦整个社区都使用类似的判断逻辑，就会出现自增强。

于是：

“很多人在做”

逐渐变成：

“这就是最值得做的问题”。

这两个命题不是一回事。

而当这种机制与职业晋升、论文发表、融资、产品路线绑定以后，探索真正未知问题的成本就会越来越高。

因为优化一个已知问题，往往可以明确地回答：

“比 baseline 快了多少？”

而定义一个新问题，很可能几个月甚至几年都不知道自己是不是在浪费时间。所以**发现真问题，本身就是痛苦的**。

## 八、螺旋上升：重点在“上升”

James March 在 1991 年讨论组织学习时提出了“探索”和“利用”之间的基本矛盾：一边是探索新的可能性，一边是继续利用已经知道有效的东西。更值得注意的是，他进一步指出，适应性系统往往会比探索更快地优化“利用”，因此可能在短期越来越有效，却在长期把自己锁死。[11]

数据库社区今天大量工作实际上是在做后者。

比如 Memory 已经被证明重要，那么接下来可以卷吞吐、卷延迟、卷索引、卷成本、卷企业能力。它们都很合理，但如果整个领域长期只做这件事情，就会出现一个问题：

[
探索 / 利用
]

这个比例越来越低。

于是所谓“螺旋上升”最后只剩下了“螺旋”。大家一直在绕：VectorDB 不够准，就加 BM25；BM25 不够语义化，就加 Embedding；Embedding 不够精确，就做 Reranking；Reranking 成本太高，再加 Cache。

每一轮都有进步，但如果十年以后，我们仍然回答的是：

**“如何从历史记录中找到最相关的几条？”**

那么无论技术栈换了多少代，我们可能仍然在同一个问题上。

真正的上升发生在：

“怎样检索？”

变成：

“为什么检索？”

再变成：

“为什么一定要保存？”

然后变成：

“什么不应该保存？”

最后甚至可能变成：

“什么东西根本不应该以外部 Memory 的形式存在？”

这才是从问题 (P_0) 走向：

[
P_0 \rightarrow P_1 \rightarrow P_2
]

而不是：

[
S_1(P_0)\rightarrow S_2(P_0)\rightarrow S_3(P_0)
]

前者是在发现新问题。

后者是在给同一道题不断换解法。

两者都需要，但不能混为一谈。

## 九、旧范式最危险的地方是替新世界定义问题

Kuhn 在《科学革命的结构》中讨论“常规科学”时指出，一个成熟的科学共同体通常会在既定范式中不断解决问题。[12]

这本来就是科学发展的正常方式。

数据库有了关系模型以后，不断改进查询优化器；有了事务以后，不断研究并发控制；硬件发生变化以后，不断重新设计存储引擎。

问题并不在于这种渐进式研究。

真正值得警惕的是：

**当一个新的计算范式刚刚出现时，我们是不是过早地用旧范式替它定义了问题？**

如果数据库人一看到 Agent Memory，就自动把它翻译成：

[
Memory = Storage + Retrieval
]

那么后面所有研究自然都会进入：

[
Storage\ Optimization + Retrieval\ Optimization
]

如果看到 Trace，就自动翻译成 Log，那么后面自然会开始研究 Log Storage。

这种翻译未必错。

但它可能只翻译出了问题最熟悉的那一部分。

这就像一个人手里只有锤子以后，看什么都像钉子。

数据库人的问题不是没有锤子。

恰恰相反，我们的工具箱太成熟了。

B+Tree、LSM-tree、WAL、MVCC、Transaction、Optimizer、Cache、Column Store、Materialized View……看到一个新问题以后，很容易立刻找到一个过去的对应物。

这种能力非常强，但它也产生一种危险：

**我们太快找到答案，以至于没有耐心确认问题到底是什么。**

## 十、要从问题出发，避免从答案触发

比如：

“Vector Database 可以怎么用于 Agent？”

看起来是在提问题。

其实答案已经确定了：

[
Solution = VectorDB
]

剩下的只是寻找一个适合它的场景。

同样：

“我们能不能做一个 Agent Memory Database？”

也已经默认了：

[
Memory \rightarrow Database
]

然后所有创造力都被限制在这个框架中。

但如果重新问：

“Agent 为什么需要 Memory？”

搜索空间马上会扩大。

也许是 context management，也许是 external state，也许是 model adaptation，也许是 continual learning，也许是 world model，也许是 tool state，也许问题根本就不应该叫 Memory。

这时候：

[
MemoryDB \in Solution\ Space
]

而不是：

[
MemoryDB = Solution
]

这个顺序差别非常大，因为错误的问题定义，会让整个领域非常高效地跑向错误方向。

在一个成熟问题上，解决方案优化当然非常重要，但在一个新范式刚刚形成的时候，我其实更愿意相信：

[
Problem\ Discovery > Solution\ Optimization
]

不是因为优化不重要，而是：

[
把错误的问题优化1000倍
]

仍然是在解决错误的问题。

## 十一、数据库社区的“自嗨”

为什么有人认为数据库社区今天多少有一点“自嗨”？

因为我们经常使用这样一条逻辑：

[
Agent需要Memory
]

[
Memory需要Storage
]

[
Storage属于Database
]

所以：

[
Database在Agent时代非常重要
]

这当然是一个逻辑上成立的三段论，但它没有多少信息量，原因很简单：

> Agent 需要网络，所以网络很重要；需要 GPU，所以体系结构很重要；需要执行代码，所以编译器和运行时也很重要；需要资源调度，所以操作系统也很重要。

任何基础领域都可以这样证明自己，所以数据库社区真正应该回答的不是：

**“数据库在 Agent 时代重要不重要？”**

这个问题太容易了，而真正困难的问题是：

**“Agent 时代究竟出现了哪些问题，只有当我们重新理解 Data、State、Computation、Learning 之间的关系之后，才看得见？”**

这是完全不同的维度，前者是在证明自己有用，后者是在重新理解世界。

如果我们只能不断证明：

“Agent 需要存数据，所以数据库重要。”

那确实只是数据库社区内部的一场自我确认。

如果我们真正能把一个大家原本称为“Memory”的问题，继续挖到 State；再从 State 挖到 Learning；再发现原来的抽象已经不足以表达它，那么数据库几十年的积累才真正成为一种发现新问题的能力。

## 十二、真正困难的是找到下一层问题

因此，我现在越来越觉得，Agent 时代数据库社区真正缺少的不是更多 MemoryDB、TraceDB、VectorDB，也不是再证明一次 “Database is Important”。

真正缺的是一种耐心：

**在拿起工具之前，先把问题多问几层。**

这个过程一定是痛苦的，因为旧问题已经有 benchmark，有 baseline，有数据集，有论文评价标准，有清楚的性能指标，但是新问题什么都没有。

别人优化 BM25，可以告诉你 Recall 提升了 5%；你如果问“Agent 到底应该忘掉什么”，甚至连“正确答案”是什么都可能说不清楚。

科学技术真正出现跃迁的时候，往往正是有人愿意忍受后者的不确定性。而这个过程也并不是某一次灵光一现式的“革命”，它仍然是螺旋上升。

我们先用 grep 解决 Memory，发现关键词不够；再用 BM25；再用向量检索；再用混合检索。在不断解决旧问题的过程中，我们逐渐发现更深层的矛盾：检索结果越来越准，但 Agent 仍然做错；存储越来越便宜，但历史越多反而越容易受到错误信息影响；上下文越来越长，但模型并没有因此获得真正稳定的长期经验。

这些旧问题上的失败，会不断暴露新的问题，于是索性，不在“这个坑玩了”，有人来“挖了新坑”。所以“螺旋”不是坏事，问题是我们不能把绕圈本身当成进步。

## 结语：还得把真问题找出来

所以，如果要把整篇文章压缩成一句话，我想表达的其实很简单：

**Agent 时代的数据库社区有点太急着证明自己重要了，而没有花同样多的精力去确认：我们现在解决的，到底是不是那个真正的问题。**

Memory 是一个非常好的案例，grep、BM25、Vector Search、Hybrid Search 都可以越来越好，它们代表技术在同一个问题上的持续进步。但只要问题始终是“怎样从历史信息中找出最相关的内容”，我们就仍然在信息检索这个平面上。

真正值得期待的变化，是有人开始问出数据库人默认不会问的新问题，最好是来自 AI 领域的真诉求、有挑战性的需求，甚至有些“离经叛道”的想法。所以我并不觉得 Agent 时代数据库人的首要任务，是再造更多带着 Agent 前缀的数据库，也不是反复强调“数据很重要”“状态很重要”“数据库很重要”，这些话都太容易了。

真正困难，也真正值得做的事情，是安静下来，把那些看起来已经理所当然的需求重新拆开，再一层一层追问下去：

**为什么需要它？**

**不用它会怎样？**

**如果底层约束消失，问题还存在吗？**

**我们现在优化的是答案，还是终于发现了一个新的问题？**

任何技术领域都能证明自己很重要，任何一个成熟的技术社区在长期发展过程中也都会留下大量遗产。**真正重要的遗产，不应该只是一箱更锋利的刀，更应该是一套判断“眼前到底是什么问题”的方法。**

它应该教会我们一件事：

**在拿刀之前，先看清楚桌子上到底是不是同一道菜。**

---

## 参考资料

[1] Larry Laudan. *Progress and Its Problems: Towards a Theory of Scientific Growth*. University of California Press, 1977. Laudan 将科学探究明确视为一种以“解决问题”为核心的活动，这里主要用于支撑本文的“问题主义”视角。

[2] Jinghao Luo, Yuchen Tian, Chuxue Cao, et al. *From Storage to Experience: A Survey on the Evolution of LLM Agent Memory Mechanisms*. Findings of ACL 2026, 2026. 论文将 Agent Memory 的发展归纳为 Storage、Reflection、Experience 三个阶段。

[3] Ankush Gola. *We built SmithDB, the data layer for agent observability*. LangChain, 2026. SmithDB 采用 object storage、Postgres metastore、stateless ingestion/query/compaction，并被描述为 object-storage-backed LSM。

[4] Nelson F. Liu, Kevin Lin, John Hewitt, et al. *Lost in the Middle: How Language Models Use Long Contexts*. Transactions of the Association for Computational Linguistics, 12:157–173, 2024. 该工作表明，长上下文模型对信息的利用效果会显著受到信息位置影响，支持“上下文容量并不等于可靠状态管理能力”的讨论。

[5] Lewis Liu, Nishant Yadav. *Introducing STATE-Bench: A benchmark for AI agent memory*. Microsoft Open Source Blog, 2026. STATE-Bench 明确区分了简单的 Memory Retrieval Test 与能够改善真实 Agent 行为的 Memory，并使用会修改数据库状态的企业任务进行评估。

[6] E. F. Codd. *A Relational Model of Data for Large Shared Data Banks*. Communications of the ACM, 13(6), 1970. 关系模型的重要贡献之一是降低应用对底层物理数据组织方式的依赖，为数据独立性奠定基础。

[7] P. Griffiths Selinger, M. M. Astrahan, D. D. Chamberlin, R. A. Lorie, T. G. Price. *Access Path Selection in a Relational Database Management System*. SIGMOD 1979, pp. 23–34. System R 的经典工作明确讨论了如何从非过程式 SQL 请求中自动选择 access path，是“用户描述 What，系统决定 How”的重要工程化节点。

[8] Jim Gray. *The Transaction Concept: Virtues and Limitations*. VLDB 1981, pp. 144–154. Gray 将 transaction 描述为满足 atomicity、durability 和 consistency 的状态变换，并指出这一概念对更一般的程序系统也可能适用。

[9] Patrick O'Neil, Edward Cheng, Dieter Gawlick, Elizabeth O'Neil. *The Log-Structured Merge-Tree (LSM-Tree)*. Acta Informatica, 33, 1996. LSM-tree 是面向不同 I/O 与更新负载权衡形成新存储机制的经典案例。

[10] Robert K. Merton. *The Matthew Effect in Science*. Science, 159(3810):56–63, 1968. 该文讨论了科学共同体中的信用与声望如何形成累积优势。

[11] James G. March. *Exploration and Exploitation in Organizational Learning*. Organization Science, 2(1):71–87, 1991. March 指出，适应过程往往比探索更快地优化既有知识的利用，因此可能产生“短期有效、长期自我破坏”的倾向。

[12] Thomas S. Kuhn. *The Structure of Scientific Revolutions*. University of Chicago Press, 1962. 本文借用 Kuhn 的“常规科学”与范式概念，用来讨论成熟共同体如何在既定问题框架内部持续解题。
