---
title: "Understanding Availability Metrics and Their Mathematical Foundations"
description: "A systematic explanation of availability, reliability, Success Ratio, Incident Ratio, MTTF/MTTR, Error Budget, SLA/SLO/SLI, Uptime/Downtime, and User-Uptime."
category: English
date: 2023-04-17
updated: 2026-06-22
mathjax2: true
lang: en
translation_url: /2023/04/17/availability-metrics-math/
tags:
  - sre
  - observability
  - reliability
---

# Availability and Reliability

Before discussing metrics, we need to separate two concepts that are often mixed together: availability and reliability.

Availability describes whether a system is able to provide service when users need it. A system with high availability may still fail occasionally, but it can recover quickly enough that users experience little interruption.

Reliability describes how long a system can run correctly before it fails. It is usually concerned with the probability that the system continues to work over a period of time.

In a simplified model:

$$
Availability = \frac{Uptime}{Uptime + Downtime}
$$

Reliability is often written as:

$$
R(t) = P(T > t)
$$

where \(T\) is the time to failure. If failures follow an exponential distribution with failure rate \(\lambda\), then:

$$
R(t) = e^{-\lambda t}
$$

The difference is subtle but important. A system can be unreliable but highly available if failures happen frequently but recovery is almost immediate. A system can also be reliable but not highly available if failures are rare but recovery takes a long time.

This article focuses mainly on availability.

# Why Availability Is Hard to Measure

There are many ways to quantify product availability:

- Count-based metrics such as Success Ratio.
- Goal-based metrics such as Error Budget.
- Failure-time metrics such as MTTF and MTTR.
- Rule-based targets such as SLA and SLO.
- State-based metrics such as Up and Down.
- User-time metrics such as User-Uptime and Windowed User-Uptime.

Availability matters because it connects user experience, system design, operational quality, and observability. It is one of the core signals that tells us whether a product is actually usable in production.

It is also harder to measure and improve than performance. Latency can often be measured per request. Availability is more ambiguous. A product may be usable for one user but broken for another. A single dependency may be down while the website still loads. A feature may work in one region but fail in another. Modern distributed systems rarely move cleanly between "fully up" and "fully down."

That is why availability metrics should be treated as models. Each metric makes a choice about what counts as failure, whose experience matters, and how impact is aggregated.

# 1. Success Ratio

## Definition

Success Ratio measures the number of successful requests divided by the total number of requests during a period such as a day, week, or month:

$$
Success\ Ratio = \frac{Successful\ Request\ Count}{Total\ Request\ Count}
$$

It is the complement of request failure rate.

## Strengths

The metric is easy to understand, easy to compute, and persuasive in communication. It fits naturally into HTTP services, APIs, RPC systems, and job execution platforms.

## Limitations

The first limitation is ambiguity. A system-wide success ratio has only one value, but different users may experience it very differently.

For example, suppose the system receives 100 requests and 2 fail. The global success ratio is 98 percent. A high-frequency user may send 98 requests and see only 1 failure. A low-frequency user may send a single request and see that one request fail. For that user, the experienced failure rate is 100 percent.

The second limitation is inflated results during outages. When users realize a product is broken, some of them stop retrying. Failed request volume decreases, the denominator shrinks, and the computed success ratio can look better than the real user impact.

This is a classic observability trap: absence of requests does not mean absence of pain.

# 2. Incident Ratio or Time-Based Uptime

## Definition

A simple time-based availability metric measures how long the system is considered up during a period:

$$
Incident\ Ratio = \frac{Up\ Minutes}{Total\ Minutes}
$$

Here, "up" and "down" are determined by known production incidents or monitoring rules.

## Strengths

This metric is intuitive. It maps directly to the way many people talk about system availability: the service was down for 20 minutes, or the service was available for 99.9 percent of the month.

## Limitations

The problem is the definition of "down." Once a team has to decide what counts as down, there is room for interpretation.

It also does not fit large distributed systems very well. Modern products are usually built from many services, instances, regions, caches, message queues, and data stores. The whole website may rarely be completely down. Instead, users see partial failures: product reviews cannot be submitted, the cart page loads slowly, a payment provider fails in one region, or a small percentage of API calls time out.

For these systems, a binary up/down state is too coarse.

# 3. MTTF, MTTR, and Related Metrics

## Definition

MTTF, Mean Time To Failure, measures the average amount of time a system runs before failure. A higher MTTF means the system can operate longer without interruption.

MTTR, Mean Time To Recovery, measures the average time from failure to recovery. It includes detection, confirmation, investigation, repair, and validation. A lower MTTR means the system is easier to recover.

MTBF, Mean Time Between Failures, measures the average time between adjacent failures:

$$
MTBF = MTTF + MTTR
$$

In many systems, MTTR is much smaller than MTTF, so:

$$
MTBF \approx MTTF
$$

There are many related terms:

- MTTD: Mean Time To Detect.
- MTTA: Mean Time To Acknowledge.
- MTTI: Mean Time To Identify.
- MTTK: Mean Time To Know, meaning time to root cause.
- MTTV: Mean Time To Verify.
- MDT: Mean Down Time.
- MTRS: Mean Time to Restore Service.
- MTBSI: Mean Time Between Service Incidents.

These metrics share the same basic idea: break the incident lifecycle into measurable intervals.

## Strengths

They are useful for describing macro-level operational health. They help answer questions such as:

- Are failures becoming less frequent?
- Are we recovering faster?
- Which stage of incident response consumes the most time?
- Should we invest more in prevention, detection, diagnosis, or recovery?

## Limitations

Like time-based uptime, these metrics depend on a definition of incident or failure. They also work best when the system has a meaningful binary state.

Another limitation is granularity. The word "mean" is doing a lot of work. An average can hide the difference between many small incidents and one catastrophic incident. It can also hide long-tail recovery behavior.

For incident operations, average values are useful, but they should usually be paired with percentiles, distributions, and concrete postmortem analysis.

# 4. Error Budget

## Definition

An Error Budget starts from a target and turns unreliability into a spendable budget.

For example:

- The system may be unavailable for no more than 50 minutes per month.
- Checkout failures may not exceed 1,000 per day.

Those 50 minutes or 1,000 failures are the budget. Each incident consumes part of it. Teams often visualize this with a burn-down or burn-rate chart.

## Strengths

Error Budget is practical. It turns availability into a governance mechanism. If the budget is healthy, the team can ship faster. If the budget burns too quickly, the team slows down releases and invests in reliability.

This is one of the most useful ideas from Site Reliability Engineering because it converts reliability from an abstract quality goal into an operational control loop.

## Limitations

The metric is still coarse. It does not describe the detailed user impact of each incident. It also depends heavily on whether the chosen SLO is meaningful.

If the target is poorly defined, the budget is precise but not useful.

# 5. SLA, SLO, and SLI

## Definition

The usual practice has four steps.

First, define a Service Level Agreement, or SLA. An SLA is a business commitment, often expressed as an availability percentage. For example, a monthly SLA of 99.99 percent means downtime must stay below about 4.3 minutes in a 30-day month. That allowed downtime becomes the Error Budget.

Second, choose Service Level Indicators, or SLIs. These are the measurements used to evaluate service quality. Google's SRE practice often describes four golden signals:

- Latency.
- Traffic.
- Errors.
- Saturation.

Other systems may also need indicators such as accuracy, freshness, coverage, data correctness, queue delay, or successful job completion.

Third, define Service Level Objectives, or SLOs. These are concrete targets for SLIs. Examples:

- The 99th percentile latency of checkout requests should be no higher than 500 ms.
- The 5xx error rate of payment requests should be below 0.01 percent.
- Data freshness should remain within 10 minutes for 99 percent of reporting jobs.

Fourth, monitor whether these objectives are met. If the system violates the target, the Error Budget is consumed. If the SLA is breached, external compensation or contractual consequences may apply.

## Strengths

SLA, SLO, and SLI provide a shared language for business, engineering, operations, and customers.

SLA is especially important because it is a commercial commitment. SLO is valuable because it guides engineering decisions before the SLA is violated. SLI is the measurement layer that makes both possible.

Error Budget burn rate can also be used to control release frequency, risky changes, and reliability work.

## Limitations

The methodology is not conceptually hard, but implementation is easy to get wrong.

Choosing the right SLIs requires product understanding. Setting SLO thresholds requires historical data, user expectations, and operational judgment. Defining the SLA period and the number of nines may involve product owners, engineering, QA, SRE, operations, and sometimes legal teams.

There is also engineering cost. Like CMDB systems, there is no universal implementation that fits every company. Each organization adapts the model to its own architecture and operating culture.

Finally, SLOs are not set once and forgotten. Teams need regular reviews:

- Should the SLI set change?
- Are thresholds still meaningful?
- Do new features require new objectives?
- Is the SLA too weak or too aggressive?
- Why did the Error Budget burn so fast last month?

# 6. Uptime and Downtime

## Definition

Uptime and Downtime track whether a product is in an Up or Down state and how long that state lasts. The result may be published to users through email, RSS, an admin console, a public status page, or a dedicated incident page.

## Strengths

This is the most direct form of availability communication. Users can quickly see whether a service is known to be unhealthy.

## Limitations

The same binary-state problem remains. For a simple single-service product, Up and Down may be enough. For a large distributed product, the actual state is usually more nuanced:

- Up for most users but slow in one region.
- Up for read operations but broken for writes.
- Up for old users but failing for newly registered users.
- Up for the website but down for background jobs.

Status pages are useful, but they are communication tools, not complete availability models.

# 7. User-Uptime and Windowed User-Uptime

Many traditional availability metrics are based on time or request counts. The Google G Suite team explored a different direction: a good availability metric should be meaningful, proportional, and actionable.

Meaningful means the metric reflects real user experience.

Proportional means the number changes in proportion to user impact. A small incident affecting a few users should not look the same as a broad outage affecting everyone.

Actionable means the metric should help engineers understand where to investigate.

The key idea is to shift the unit of analysis from system time to user time.

In a simplified form, User-Uptime asks: during the observation window, how much of each user's time was the product usable?

For a user \(u\), we can define:

$$
UserAvailability(u) = \frac{UsableTime(u)}{ObservedTime(u)}
$$

Then aggregate across users:

$$
UserUptime = \frac{\sum_u UsableTime(u)}{\sum_u ObservedTime(u)}
$$

Windowed User-Uptime goes further by evaluating user availability over rolling windows. This helps avoid a common problem: a global daily metric may look fine even if many users experienced short but painful interruptions.

This model is closer to product reality. It asks not only whether servers were up, but whether users could do what they came to do.

# A Mathematical View

Most availability metrics can be understood by asking four questions.

First, what is the unit of observation?

- Request.
- Time.
- Incident.
- User.
- Feature.
- Region.
- Business transaction.

Second, what is the state function?

For a request:

$$
S(r) \in \{0, 1\}
$$

where 1 means success and 0 means failure.

For a user at time \(t\):

$$
U(u, t) \in \{0, 1\}
$$

where 1 means the product is usable for that user.

For a feature in a region:

$$
F(feature, region, t) \in \{0, 1\}
$$

Third, how do we aggregate?

Success Ratio aggregates over requests:

$$
\frac{\sum_r S(r)}{|R|}
$$

Time-based uptime aggregates over time:

$$
\frac{\int_0^T Up(t)dt}{T}
$$

User-Uptime aggregates over user-time:

$$
\frac{\sum_u \int_0^T U(u,t)dt}{\sum_u T_u}
$$

Fourth, what weight do we assign?

Not all failures are equal. A failed health-check request, a failed checkout request, and a failed internal dashboard query should not necessarily carry the same weight. In a more general form:

$$
Availability = \frac{\sum_i w_i \cdot S_i}{\sum_i w_i}
$$

The hard part is choosing \(i\), \(S_i\), and \(w_i\) so that the metric matches product reality.

# Choosing the Right Metric

There is no single best availability metric. The right metric depends on the system.

For a simple API, request Success Ratio and latency-based SLOs may be enough.

For a SaaS product, user-journey SLIs and User-Uptime are often more meaningful.

For infrastructure platforms, uptime, Error Budget, and MTTx metrics are important because customers care about contractual guarantees and operational transparency.

For data platforms, freshness, completeness, correctness, and successful job completion may be more important than HTTP availability.

For large distributed systems, the best approach is usually a layered model:

- Request-level metrics for local symptoms.
- User-level metrics for real experience.
- Incident metrics for operational response.
- SLO and Error Budget for governance.
- Business metrics for product impact.

# Conclusion

Availability is not a single number. It is a modeling choice.

Success Ratio is easy to compute but can hide uneven user impact. Uptime is intuitive but too binary for distributed systems. MTTF and MTTR describe operational maturity but smooth over incident details. Error Budget connects reliability to release governance. SLA, SLO, and SLI provide a shared framework, but require careful design. User-Uptime moves the model closer to actual user experience.

The most important principle is simple: measure availability from the perspective of the product promise. If users came to place an order, "the homepage returned 200" is not enough. If customers depend on data freshness, "the API is up" is not enough.

A good availability metric should be meaningful, proportional, and actionable. It should explain not only whether the system was technically alive, but whether it was useful.
