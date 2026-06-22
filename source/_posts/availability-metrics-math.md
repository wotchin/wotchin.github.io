---
title: 深入理解可用性指标及其数学原理
description: 系统梳理 availability、reliability、Success-Ratio、Incident-Ratio、MTTF/MTTR、Error Budget、SLA/SLO/SLI、Uptime/Downtime 与 User-Uptime 的定义、优缺点和数学本质。
category: Chinese
date: 2023-04-17
updated: 2026-06-22
mathjax2: true
lang: zh-CN
translation_url: /2023/04/17/availability-metrics-math-en/
tags:
  - sre
  - observability
  - reliability
---

首先我们应该理解一下“可用性”（availability）这个概念。它表示的是：一个系统在用户需要它的时候，能够正确提供服务的程度。更形式化一点说，可用性关心的是“服务是否处于可用状态”，以及“用户请求是否能够得到符合预期的结果”。

与此类似，还有一个概念叫“可靠性”（reliability）。可靠性表示系统在给定时间窗口内持续无故障运行的概率，强调的是“从现在开始，系统能连续稳定运行多久”。二者很接近，但侧重点不同：

- 可靠性更像“多久不坏”，关注 failure 发生之前的持续时间。
- 可用性更像“坏了也能不能及时恢复，并且用户是否还能用”，同时关注 failure frequency 和 recovery speed。
- 一个系统可以可靠性一般但可用性很高，例如故障频繁但恢复极快、用户几乎无感。
- 一个系统也可以可靠性高但可用性不一定高，例如很少故障，但一旦故障需要很久恢复。

从经典可靠性工程的角度看，如果系统在“正常运行”和“故障恢复”之间交替，并且可以用平均无故障时间 MTTF 和平均恢复时间 MTTR 描述，那么稳态可用性可以近似写成：

$$
A = \frac{MTTF}{MTTF + MTTR}
$$

这个公式很直观：系统长期处于可用状态的比例，等于平均正常工作时间除以一个完整故障周期的平均长度。它也暗示了一件非常重要的事情：提升可用性不只有“减少故障”一条路，也可以通过缩短恢复时间实现。

本文主要讨论的是可用性。

## 为什么可用性难以衡量

量化产品可用性的方法论有很多：基于请求数量的 Success-Ratio，基于目标的 Error Budget，基于故障时间的 MTTF/MTTR，基于规则阈值的 SLA/SLO，基于状态的 Up/Down，还有基于用户时间的 User-Uptime 及其派生出的 Windowed User-Uptime 等。

可用性之所以重要，是因为它不仅关系到用户体验，也反映软件本身的设计缺陷和运行结果。作为一类重要的观测指标，可用性也是系统可观测性需要核心关注的能力。

但相比性能，可用性更难衡量和提升，原因主要有四个。

第一，性能通常是连续变量，例如延迟 100ms、500ms、2s；可用性经常被表达为离散状态，例如成功/失败、可用/不可用。这种二值化会丢失很多细节：一次 502、一次 30 秒超时、一次返回旧数据，在用户眼里都可能是“不可用”，但工程根因完全不同。

第二，现代分布式系统很少是全局 Up 或全局 Down。更常见的是局部不可用：某个地域慢、某个 API 失败、某个支付渠道异常、少数租户受影响、某个版本客户端不可用。此时“系统到底算不算挂了”本身就是一个需要定义的问题。

第三，系统指标和用户感知之间并不总是线性对应。总体请求成功率 99.9% 可能看起来很好，但如果失败集中在少数重要用户、关键路径或下单高峰，则业务影响会远超这个数字。

第四，可用性指标常常会被用户行为反向影响。用户发现服务故障后可能停止重试，于是失败请求数量下降，基于请求计数的成功率反而变好。这不是系统恢复了，而是用户离开了。

所以，一个好的可用性指标至少应该回答三个问题：

- Meaningful：是否能反映用户真实感受？
- Proportional：数字变化是否与用户痛苦程度成比例？
- Actionable：指标变差后，是否能指导工程团队定位和改进？

这三个标准来自 Google G Suite 团队关于 availability metric 的研究。下面逐一讨论常见指标。

## 请求成功率 Success-Ratio

Success-Ratio 指一段时间内成功请求数量除以全部请求总数量：

$$
SuccessRatio = \frac{SuccessfulRequestCount}{TotalRequestCount}
$$

失败率是它的反义：

$$
ErrorRatio = 1 - SuccessRatio
$$

例如一天内收到 1,000,000 次请求，其中 2,000 次失败，则：

$$
SuccessRatio = \frac{998000}{1000000} = 99.8\%
$$

这个指标的优点很明显：原理简单、说服力强、易统计、易落地。对于 HTTP API、RPC 服务、消息处理、任务调度等系统，只要日志里有 status code 或业务状态，就可以快速计算。

但 Success-Ratio 有两个核心缺点。

第一是二义性。产品在同一时间统计到的请求成功率只有一个结果，例如 98%，但不同用户会有完全不同的感知。典型情况是高频请求用户和普通用户：前者发出 98 个请求失败 1 个，体感可能只是偶发错误；后者可能只发出 1 个请求就失败了 1 个，对他来说失败率就是 100%。而对系统整体而言，如果收到了 100 个请求失败 2 个，成功率确实是 98%，公式没有错，但它把“用户之间的差异”平均掉了。

第二是结果可能虚高。一类用户在发现产品故障后会选择离开一会，不会坐在那里不停重试。于是失败请求数量减少，分母也减少，成功率看起来可能没有显著下降。但这不代表用户影响变小了，而是用户已经放弃使用。Google 的 Meaningful Availability 论文也指出，Success-Ratio 会偏向最活跃用户，并且会受到 outage 期间用户行为变化的影响。

从数学上看，Success-Ratio 是一种请求加权平均：

$$
SuccessRatio = \frac{\sum_i successful_i}{\sum_i total_i}
$$

其中每个用户的权重等于他的请求数。请求越多的用户，对总体指标影响越大。因此它适合衡量“系统处理请求的总体结果”，但不一定适合衡量“用户群体的平均体验”。

## 系统故障率 Incident-Ratio

很多团队会用系统正常时间除以总时间来描述可用性：

$$
UptimeRatio = \frac{UpMinutes}{TotalMinutes}
$$

如果要表达故障率，则通常是：

$$
IncidentRatio = \frac{DownMinutes}{TotalMinutes} = 1 - UptimeRatio
$$

这里的 Up 和 Down 取决于系统已知的线上故障。比如一个月 30 天，总计 43,200 分钟，如果累计故障 43.2 分钟，则：

$$
UptimeRatio = 1 - \frac{43.2}{43200} = 99.9\%
$$

它的优点是直观，说服力中等，适合给管理层、客户或公开状态页展示。用户能理解“这个月宕机了多久”，团队也容易把它和事件复盘、故障等级、值班响应流程联系起来。

但这个指标也有明显缺点。

第一，何谓 Up、何谓 Down 需要人为定义，存在解释空间。首页打不开算 Down，搜索不可用算不算？支付不可用算不算？只有广东某市访问慢算不算？如果不同团队定义不同，那么指标之间不可比较。

第二，它不适用于大型分布式系统。对现代化的大规模系统而言，几乎不存在绝对 Down 和绝对 Up。微服务拆分、多实例部署、主从热备、异地多活等手段令整个网站很难彻底挂掉，更常见的是商品评论按钮点击没反应、购物车列表加载不出来、某个城市访问变慢之类的局部异常。

从数学上看，Incident-Ratio 是一种时间加权状态函数。设系统状态为：

$$
X(t) =
\begin{cases}
1, & service\ is\ up \\
0, & service\ is\ down
\end{cases}
$$

则时间窗口 \\([0,T]\\) 内的可用性为：

$$
A_T = \frac{1}{T}\int_0^T X(t)dt
$$

这个模型的问题在于，它要求系统状态可以被压缩成一个二值变量。但真实系统往往是多维状态：某个 region、某个 API、某类用户、某个租户、某个客户端版本都可能分别处于不同状态。把它们压成一个 Up/Down，必然会损失信息。

## 故障恢复时间 MTTF/MTTR/MTBF

MTTF（Mean Time To Failure）指系统可无故障运行的平均时间或平均工作次数。越高，表示系统持续服务能力越强。

MTTR（Mean Time To Recovery）指从出现故障到恢复服务之间的平均时长。这里通常包含检测、响应、定位、修复和验证所需的时间。越短，表示系统易恢复性越好。

MTBF（Mean Time Between Failures）指两次相邻故障之间的平均时长：

$$
MTBF = MTTF + MTTR
$$

通常 MTTR 远小于 MTTF，因此很多场景下会近似认为：

$$
MTBF \approx MTTF
$$

此外，还有一组类似术语：

- MTTD：Mean Time To Detect，平均检测时间。
- MTTA：Mean Time To Acknowledge，平均响应时间。
- MTTI：Mean Time To Identify，平均识别时间。
- MTTK：Mean Time To Know，平均定位根因时间。
- MTTV：Mean Time To Verify，平均修复后验证时间。
- MDT：Mean Down Time，平均停机时间。
- MTRS：Mean Time to Restore Service，通常可写作 total downtime / number of failures。
- MTBSI：Mean Time Between Service Incidents，有些语境中写作 MTBF + MTRS。

这些术语的原理大体相同：把一个故障生命周期拆成若干阶段，然后计算每个阶段的平均耗时。

它们的优点是倾向于描述系统整体可用性的宏观情况。比如 MTTD 变短，说明监控发现问题更快；MTTA 变短，说明值班响应更快；MTTR 变短，说明恢复流程更成熟。

缺点也很明显。

第一，它们和 Incident-Ratio 一样，需要定义什么叫故障，也更适用于只有 Up/Down 二元状态的系统。

第二，粒度粗。顾名思义，这批指标都是 Mean/Average/平均值，可衡量宏观趋势，但不适合描述某次具体故障。一次 5 分钟故障和一次 5 小时故障，对平均值的影响可能被长期数据稀释。

第三，均值对分布形态不敏感。如果恢复时间服从长尾分布，那么平均值可能掩盖少数极端故障。工程上最好同时看 P50/P90/P99、最大值、分位数趋势和故障等级分布。

从数学上看，MTTF/MTTR 是随机变量的期望：

$$
MTTF = E[T_{failure}]
$$

$$
MTTR = E[T_{recovery}]
$$

如果系统可抽象为“正常”和“故障”两个状态的交替更新过程，那么长期稳态可用性可以近似写成：

$$
A = \frac{E[T_{up}]}{E[T_{up}] + E[T_{down}]}
$$

这类模型适合硬件、单体服务、基础设施组件，但对复杂产品体验仍然不够。

## 错误预算 Error Budget

Error Budget 是 SRE 中非常重要的概念。它的基本思想是：先给产品设定一个可用率目标，然后把允许失败的部分称为预算。每次发生故障或不满足 SLO，就消耗预算。

如果目标是 99.9% 可用性，则错误预算是：

$$
ErrorBudget = 1 - 99.9\% = 0.1\%
$$

如果以 30 天为窗口：

$$
BudgetMinutes = 30 \times 24 \times 60 \times 0.001 = 43.2\ minutes
$$

如果以请求数为窗口，4 周内有 1,000,000 次请求，99.9% 可用性目标对应的错误预算就是：

$$
BudgetErrors = 1000000 \times 0.001 = 1000
$$

它的优点是直观、易操作，适合做团队管理和发布节奏控制。比如预算消耗过快，就暂停高风险发布，把工程注意力转向稳定性；预算充足，则允许更积极地推进变更。

Google SRE Workbook 对 Error Budget 的解释很经典：错误预算是平衡服务可靠性和创新速度的工具。它不是要求系统永远不出错，而是明确告诉团队“我们可以承受多少不可靠”。

缺点是粒度仍然较粗。Error Budget 能告诉你预算燃烧速度过快，但不能天然告诉你具体是哪类用户、哪个地域、哪个功能受影响。它需要和 SLI、故障标签、日志维度、事件复盘结合使用。

## 服务水平目标 SLA/SLO/SLI

SLA、SLO、SLI 是一组经常被混用的概念。更准确的关系是：

- SLI：Service Level Indicator，服务水平指标，是被测量的量。
- SLO：Service Level Objective，服务水平目标，是 SLI 应该达到的目标。
- SLA：Service Level Agreement，服务水平协议，是对外承诺，通常包含未达标后的赔偿或惩罚。

Google SRE Book 对 SLI 的定义是：对服务水平某个方面的、经过仔细定义的量化度量。常见 SLI 包括 request latency、error rate、throughput 和 availability。SLO 则是对 SLI 的目标值或目标范围。SLA 是带有后果的协议，如果没有明确后果，通常更像 SLO 而不是 SLA。

落地时通常有四步。

第一步，为产品设定可用率目标。比如一个月不低于 99.99%，俗称“4 个 9”。按 30 天计算，允许故障时长约为：

$$
30 \times 24 \times 60 \times (1 - 0.9999) = 4.32\ minutes
$$

第二步，为产品选择合适的 SLI。Google SRE 常提到的四类黄金信号是 Latency、Traffic、Errors、Saturation。除此之外，还有 Accuracy、Freshness、Coverage、Correctness、Durability 等。SLI 并不是越多越好，关键是要贴近用户体验和业务关键路径。

对于典型在线电商产品，HTTP Web 类核心链路可能优先选择两个指标：

- Latency：如下单请求 P99 不高于 500ms。
- Error：如支付请求 5xx 比例低于万分之一。

第三步，为每个 SLI 设置 SLO。SLO 应该具体、可测量、可复盘。例如：

$$
P99(ResponseTime_{checkout}) \le 500ms
$$

$$
5xxRatio_{payment} < 0.01\%
$$

第四步，持续监控这些目标是否达成。不能达成则消耗错误预算；如果预算耗光，甚至低于对外 SLA 承诺值，则可能触发用户赔偿、内部升级、暂停发布或稳定性专项。

这套方法的优点是业界通行，尤其 SLA 是厂商和用户都认可的共同语言。SLO/SLI 则更适合作为内部工程治理工具，帮助团队做数据驱动的可靠性决策。

缺点有三个：

第一，不易操作。概念本身不复杂，但选哪些 SLI、SLO 阈值设多少、SLA 周期定多长、承诺几个 9，都需要评审。通常要联合负责人、研发、测试、运维，有时还需要法务参与。

第二，有研发成本。业界没有绝对统一的落地方案。每家公司都需要结合自身产品形态和监控体系做本土化建设。

第三，有维护成本。SLO 不是一次配置后永久有效。它需要定期复盘：SLI 是否增补，SLO 阈值是否调整，新功能是否需要新规则，SLA 目标是否上调，上个月 Error Budget 为什么消耗这么快。

## 在线/离线状态 Uptime/Downtime

Uptime/Downtime 指统计产品正常工作或宕机的状态，以及持续时间，并面向用户公开。常见展示方式包括状态页、邮件通知、RSS 订阅、管理后台展示、官网展示等。

它的价值不只是一个指标，还包含沟通机制。对于云服务、SaaS、API 平台而言，公开状态页能降低用户不确定性：用户至少知道是自己配置错误、网络问题，还是服务方正在处理故障。

但是 Uptime/Downtime 仍然依赖 Up/Down 定义，且更适合对外沟通，不足以作为内部工程改进的唯一依据。状态页说“部分服务降级”，工程团队还需要知道降级发生在哪个 region、哪个 API、哪个租户、哪个版本、影响多少用户。

## Google G Suite 的 User-Uptime 与 Windowed User-Uptime

上述很多指标本质上都是基于时间或数量统计的。Google G Suite 团队在 Meaningful Availability 论文中提出了一套更贴近用户感知的可用性指标：User-Uptime 和 Windowed User-Uptime。

这套指标认为，一个好的 availability metric 应该满足三个条件：

- Meaningful：能体现用户切身感受。
- Proportional：数字变化与用户感受成比例相关。
- Actionable：具备故障源头指导意义。

它们还希望指标尽量不依赖人为阈值。因为阈值需要专家经验，容易武断，并且需要长期跟踪和调优。

User-Uptime 的核心思想是：不要只看请求，而要先为每个用户计算他的 up/down minutes，再把用户等权聚合。这样可以避免高频用户在请求数量上压倒低频用户。

可以把某个用户 \\(u\\) 在第 \\(t\\) 分钟的状态定义为：

$$
X_{u,t} =
\begin{cases}
1, & user\ u\ is\ available\ at\ minute\ t \\
0, & user\ u\ is\ unavailable\ at\ minute\ t
\end{cases}
$$

那么用户 \\(u\\) 在时间窗口 \\(T\\) 内的可用性为：

$$
A_u(T) = \frac{1}{|T|}\sum_{t \in T} X_{u,t}
$$

整体 User-Uptime 则可以写成用户维度的平均：

$$
UserUptime(T) = \frac{1}{|U|}\sum_{u \in U} A_u(T)
$$

这个公式和 Success-Ratio 的关键区别在于权重。Success-Ratio 按请求数加权，User-Uptime 按用户加权。前者回答“请求总体成功了多少”，后者回答“用户总体可用了多久”。

Windowed User-Uptime 则进一步解决时间尺度问题。两个系统可能总体可用性相同，但一个是很多次 1 分钟短故障，另一个是一次 60 分钟长故障。对用户和工程团队来说，这两种模式完全不同。Windowed User-Uptime 会在多个时间窗口上同时计算可用性，从而区分“短而频繁”和“长而集中”的不可用。

这套方法的优点是更接近用户体验，也更容易暴露短时但高影响的故障。缺点是实现成本高：需要细粒度用户操作日志，需要能识别用户、时间戳、操作类型、成功/失败状态，还要处理多产品、多客户端、多租户和隐私合规问题。Google 的论文提到，将 Windowed User-Uptime 部署到全部 G Suite 应用大约花了一年，其中大量时间花在统一日志格式和判断哪些操作应该计入可用性上。

## 从数学角度统一理解这些指标

从数学角度看，可用性指标大体可以分成五类工具。

第一类是比例估计。Success-Ratio、Error-Ratio、请求级 SLI 都属于这一类。每次请求可以看作一个 Bernoulli 随机变量，成功为 1，失败为 0。总体成功率就是样本均值。

第二类是时间积分。Uptime、Downtime、Incident-Ratio 属于这一类。系统状态被定义为时间函数 \\(X(t)\\)，可用性就是该状态函数在时间窗口上的平均。

第三类是更新过程和生存分析。MTTF、MTTR、MTBF 属于这一类。它们把故障看作随机事件，把系统寿命和恢复时间看作随机变量，用期望值、分布、分位数描述系统宏观行为。

第四类是预算约束。Error Budget、SLO burn rate 属于这一类。它们把不可用性看作可消耗资源，通过预算余额和消耗速率指导发布、演练和稳定性投入。

第五类是用户加权与窗口分析。User-Uptime、Windowed User-Uptime 属于这一类。它们把用户作为一等对象，把请求日志转换成用户时间，再从多个时间尺度观察不可用模式。

下面给出一个简化分类表。

| 指标/方法 | 数学本质 | 适合场景 | 主要风险 |
| --- | --- | --- | --- |
| Success-Ratio | 请求级样本均值 | API、RPC、HTTP 服务 | 高频用户权重过大，用户离开会造成结果虚高 |
| Incident-Ratio / Uptime | 时间状态函数积分 | 单体服务、基础设施、状态页 | Up/Down 定义困难，局部故障难表达 |
| MTTF/MTTR/MTBF | 随机变量期望、更新过程 | 硬件、基础组件、宏观稳定性趋势 | 均值掩盖长尾，不适合描述单次故障 |
| Error Budget | 预算约束、燃尽模型 | 发布治理、SRE 管理、稳定性决策 | 粒度粗，需要和故障维度结合 |
| SLA/SLO/SLI | 目标约束、阈值判断 | 对外承诺、内部可靠性治理 | 选指标和设阈值需要经验，维护成本高 |
| Uptime/Downtime 状态页 | 时间段标注与事件沟通 | SaaS、云服务、API 平台 | 更适合沟通，不足以指导根因分析 |
| User-Uptime | 用户等权平均 | 用户体验导向产品 | 需要用户级细粒度日志 |
| Windowed User-Uptime | 用户时间 + 多尺度窗口 | 大规模分布式产品、局部短故障分析 | 实施复杂，数据治理要求高 |

一个实用建议是：不要试图用一个指标描述所有可用性。更合理的做法是分层。

- 对外承诺用 SLA。
- 内部目标用 SLO。
- 具体测量用 SLI。
- 发布治理用 Error Budget。
- 请求链路用 Success-Ratio 和 latency percentile。
- 故障复盘用 MTTD、MTTA、MTTR。
- 用户体验用 User-Uptime 或按用户/租户/地域聚合的可用性。
- 公开沟通用 Uptime/Downtime 状态页。

## 总结

可用性不是一个简单的百分比。它既可以是请求成功率，也可以是时间可用率；既可以是故障恢复速度，也可以是用户实际可用时间；既可以是对外商业承诺，也可以是内部工程治理工具。

Success-Ratio 简单有效，但偏向高频请求。Incident-Ratio 直观，但难以表达现代分布式系统的局部故障。MTTF/MTTR 能描述宏观恢复能力，但平均值会掩盖长尾。Error Budget 能把可靠性和发布速度连接起来，但需要好的 SLI 支撑。SLA/SLO/SLI 是通用语言，但落地需要持续治理。User-Uptime 和 Windowed User-Uptime 更接近用户体验，但需要更强的数据能力。

因此，真正成熟的可用性度量体系，不是选择某一个“最正确”的指标，而是明确每个指标回答的问题、适用的场景和隐藏的偏差。只有这样，可用性才不会停留在报表里的几个 9，而会变成团队可以理解、可以权衡、可以持续改进的工程能力。

## 参考资料

[1] Google SRE Book, [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/).

[2] Google SRE Workbook, [Implementing SLOs](https://sre.google/workbook/implementing-slos/).

[3] Google SRE Workbook, [Error Budget Policy for Service Reliability](https://sre.google/workbook/error-budget-policy/).

[4] Tamas Hauer et al., [Meaningful Availability](https://www.usenix.org/system/files/nsdi20spring_hauer_prepub.pdf), NSDI 2020.

[5] 网易严选技术团队, [可用性指标最新盘点，哪个技术团队还没贴墙上](https://mp.weixin.qq.com/s?__biz=MzkzMjYzNjkzNw==&mid=2247611780&idx=1&sn=081edec33dc8ff97589858ada5d5d102&source=41&poc_token=HLe3OGqjpqJlcpNHIn_oCppiNFquVH54Wggohe4w)
