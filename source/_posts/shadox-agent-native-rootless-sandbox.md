---
title: shadox：Agent-Native 的 Rootless 进程沙箱
description: 介绍 shadox 的设计动机、架构、Rootless 安全能力、JSONL trace、effective policy、diagnostic hints，以及为什么它更像 agent 的执行飞行记录仪而不是 Docker 竞品。
category: Chinese
date: 2026-06-22
updated: 2026-06-22
tags:
  - rust
  - linux
  - sandbox
  - agent
  - observability
---

最近在研究 Agent Runtime，在 Code Agent 的帮助下，快速实现了一个 research project：**shadox**。它是一个用 Rust 写的、面向 Linux 的轻量级 rootless process sandbox runtime。

这个项目最初的灵感来自一个很经典的工程实验：用少量 Shell 脚本解释 Docker 背后的 namespace、cgroup、rootfs 等核心概念。在深入研究 sandbox 相关技术后，我认为 shadox 从一开始就不应该做 Docker 的简化版，也不应该成为一个新的 container runtime。它的目标更明确：

> 在不依赖 root 权限、不引入 daemon、不复刻完整容器语义的前提下，为 agent 执行普通命令提供限制、观测、诊断和可编程规则。

换句话说，shadox 更像是一个 **agent execution flight recorder**：它不只是把命令关进一个小房间，还要清楚记录这次执行发生了什么、为什么失败、下一步应该检查哪里。这个概念来源于最近比较火的 Agent Trace 观测领域，也结合了我最近一段时间在 trace 记录和编译为 memory 方面的经验：先打通 agent 执行的“第一公里”，再逐步形成一个尽可能完整的 infra 闭环。这里，我们最终想要实现的目标一定不是大而全的容器，更不是虚拟化基础设施，而是足够轻量、能够提供可观测窗口的、agent-native 沙箱系统，轻量到足以在端侧 Agent 上进行部署。

## 为什么不实现一个 mini-Docker？

如果要做一个“像 Docker 一样”的东西，很容易一路走向 namespace、mount namespace、network namespace、overlayfs、image、OCI spec、cgroup delegation、rootfs 管理、registry、runtime shim 等方向。这些方向非常重要，但已经有成熟生态。

shadox 刻意避开这条路。一个原因是不想在现有的技术路线上重复“造轮子”，另一个原因是不希望探索性项目最终无法应用到实际场景中，最后只能沦落为一个 research project。

因此，我们关注的是另一类更轻、更常见、也更适合 agent 的场景：

- 一个本地 agent 需要执行 `python script.py`、`npm test`、`grep`、`cargo check` 之类的普通命令；
- 我们希望限制它的执行时间、文件写入范围、进程数量、打开文件数等资源；
- 我们希望知道它输出了什么、是否超时、是否被 seccomp 拦截、是否疑似被 Landlock 拒绝；
- 我们希望把这些信息变成结构化事件流，让上层 agent 可以实时消费，而不是事后翻日志猜原因；
- 我们还希望用轻量脚本写一些观察规则，即实现可编程性（programmability），例如“如果 stderr 出现某类错误，就打一个 finding”。

这种场景的核心问题不是“如何运行一个完整容器”，而是：

> 如何让一个 agent 在受限环境里执行命令，并且让执行结果可解释、可审计、可被程序继续处理？

这就是 shadox 的边界。

## 目前实现了什么

当前 shadox v1 的功能可以概括为四层：

第一层是 **process supervision**。父进程负责创建 run directory、启动子进程、捕获 stdout/stderr、监督 timeout，并在必要时 kill process group。

第二层是 **rootless restriction primitives**。在 Linux 上，子进程 exec 前会应用：

- `rlimit`：限制 CPU time、address space、open files、file size、process count；
- `PR_SET_NO_NEW_PRIVS`：阻止后续 exec 获得新的特权；
- Landlock：限制 filesystem read/write allowlist；
- seccomp basic profile：阻止明显危险或 introspection-oriented 的 syscall，例如 `ptrace`、`bpf`、`perf_event_open`、`mount` 等。

第三层是 **observability**。shadox 会输出 JSONL trace event，采样 `/proc` 中的轻量资源信息，并在可用时读取 ambient cgroup v2 stats。它不会在 v1 创建或管理 cgroup，因为那会把项目推向更重的 runtime 方向。

第四层是 **agent diagnostics**。运行结束后，shadox 会生成 `summary.json`，里面包含 exit status、signal、timeout、resource usage、stdout/stderr tail、failure classification、observer findings 和 diagnostic hints。

这四层组合起来，得到的不是一个完整 container，而是一个面向 agent 的执行契约。

## Effective Policy：先解释，再执行

对 agent 来说，最糟糕的执行体验之一是：命令失败了，但不知道是命令本身错了，还是 sandbox policy 太严格。

所以 shadox 加了一个很关键的能力：`shadox explain`。

它输出的是某次 run 的 **effective policy**。也就是说，它会把 TOML 配置、CLI override、profile 默认值合并之后，告诉你最终真正生效的策略。

例如：

```bash
shadox explain \
  --profile read-only \
  --seccomp-profile off \
  -- /bin/echo hello
```

输出里会包含：

```json
{
  "schema_version": 1,
  "shadox_version": "0.1.0",
  "profile": "read-only",
  "profile_version": 1,
  "effective_policy": {
    "fs": {
      "read": [],
      "write": []
    },
    "security": {
      "no_new_privs": true,
      "landlock": true,
      "seccomp_profile": "off",
      "allow_degraded": false
    }
  },
  "agent_contract": {
    "trace": "JSONL event stream for live agent consumption",
    "summary": "final JSON report with failure classification and hints",
    "policy": "effective policy is explicit before run"
  }
}
```

这里的重点不是 JSON 好看，而是上层 agent 可以在执行前知道这次命令会被怎样约束。对于 agent runtime，这比人类可读的 help text 更重要。

## 四个更具体的 Profile

shadox 现在只提供四个 profile，而且有意保持“具象化”。

| Profile | 设计意图 |
| --- | --- |
| `agent-default` | 默认 agent 执行模式：rootless restriction + observability，未显式配置 write allowlist 时允许写工作目录 |
| `read-only` | 默认不允许写文件，适合探索、读取、诊断类命令 |
| `workspace-write` | 明确表达“agent 只应该写 workspace”这个常见场景 |
| `permissive-observe` | 可信诊断模式：弱化 filesystem restriction，但保留观测和报告 |

这些 profile 不是 container mode，也不是安全等级标签，更像是 agent 的执行意图。

举个例子，`read-only` 并不意味着系统完全不可变；它只是在 shadox 的 filesystem policy 里默认不给 write allowlist。用户仍然可以显式传入 `--allow-write` 扩展策略。这样做的好处是：profile 提供默认姿态，effective policy 负责最终事实。

## Trace Event：给 Agent 处理的原生事件流

每个 shadox run 默认会生成：

```text
.shadox/runs/<timestamp>-<run_id>/trace.jsonl
.shadox/runs/<timestamp>-<run_id>/summary.json
```

`trace.jsonl` 是一行一个 JSON event，适合 agent 实时消费。这个 JSON 文件的结构如下：

```json
{
  "schema_version": 1,
  "shadox_version": "0.1.0",
  "profile": "agent-default",
  "profile_version": 1,
  "ts": 1790000000000,
  "seq": 1,
  "run_id": "00000000-0000-0000-0000-000000000000",
  "kind": "process.spawn",
  "pid": 1234,
  "level": "info",
  "data": {}
}
```

kind 字段表示追踪到的事件(event)，当前支持的事件类型包括：

- `run.start`
- `sandbox.policy`
- `sandbox.degraded`
- `cgroup.detected`
- `process.spawn`
- `proc.sample`
- `stdout.chunk`
- `stderr.chunk`
- `sandbox.denied`
- `observer.finding`
- `process.exit`
- `run.summary`

这里需要特别关注 `schema_version`、`profile_version` 这些字段。很多工具早期只追求能跑，等到接入其他系统时才发现输出格式没有版本，导致后续兼容非常痛苦。shadox 从第一版就把 trace/summary 当成正式契约，而不是临时日志，这为后续 schema 的演进提供了便利。

## Summary：不仅知道失败结果，还告诉你怎么继续

`summary.json` 是一次执行结束后的结构化摘要。它不是简单地记录 exit code，而是尝试回答几个更适合 agent 的问题：

- 命令是否成功退出？
- 如果失败，是 timeout、signal、seccomp denied、Landlock-like denied、OOM-like，还是普通 non-zero exit？
- 这个判断的 confidence 是 high、medium 还是 low？
- 有哪些 evidence？
- stdout/stderr 输出了多少字节，最后的 tail 是什么？
- observer script 是否产生了 finding？
- 下一步 agent 应该检查什么？

例如，如果命令疑似被 Landlock 拒绝，summary 里会出现类似的 hint：

```json
{
  "code": "landlock_fs_allowlist",
  "severity": "warn",
  "message": "Filesystem access was likely denied by the effective Landlock allowlist.",
  "action": "Add the required path to fs.read or fs.write, or pass --allow-read/--allow-write for this run.",
  "tags": ["landlock", "filesystem", "policy"]
}
```

这是 shadox 有差异化的地方：它不是只做 restriction，而是把 restriction 结果变成 agent 能理解的 diagnosis。有了这些 trace，agent 在多步骤规划、失败恢复和策略调整中都可以获得更可靠的反馈。

## 为什么选型 Landlock、seccomp 和 Rhai

Linux 的 sandbox primitive 很多。shadox v1 选择的是足够轻、rootless-friendly、实现边界清晰的一组。

[Landlock](https://docs.kernel.org/userspace-api/landlock.html) 是 Linux 的 unprivileged access-control 机制，适合让进程为自己和后续子进程收紧 filesystem 权限。它和传统“先拿到权限再降权”的模型不同，更适合普通用户态程序主动把自己关小。

[seccomp filter](https://docs.kernel.org/userspace-api/seccomp_filter.html) 则用于过滤 syscall。shadox v1 采用 conservative blocklist，而不是激进 allowlist。这不是因为 blocklist 更安全，而是因为 v1 目标是让普通 CLI 程序保持可用，同时阻断一批明显危险或不适合 agent 执行场景的 syscall。更严格的 allowlist profile 可以放到后续版本。

可编程观测选择 [Rhai](https://docs.rs/rhai/latest/rhai/)，原因也很简单：它是 Rust 生态里的嵌入式脚本语言，足够轻。v1 的 Rhai 脚本只能观察 event 并返回 finding，不能修改 sandbox policy。在进行技术选型的时候，我也考虑过采用 Lua 或者 Python SDK，但很明显，后两者在与 Rust 结合、轻量级程度上都不如 Rhai 更合适。更何况我们场景中需要使用的可观测逻辑其实都很简单，不需要引入额外的学习成本；甚至作为 Rust 生态成员，Rhai 的代码样式也更容易被现代 LLM 生成和理解。通过 Rhai 实现一个简单的 observer 规则如下：

```rhai
fn on_event(event) {
    if event.kind == "stderr.chunk" {
        return #{
            message: "process wrote to stderr",
            severity: "warn",
            tags: ["stderr", "agent"]
        };
    }
}
```

注意：脚本可以解释执行，但不能改变安全策略。否则“可编程观测”很容易变成“可编程绕过”。

## 与现有项目的对比

shadox 并不是第一个 rootless sandbox，也不是想替代现有工具。

例如 [bubblewrap](https://github.com/containers/bubblewrap) 是非常成熟的 unprivileged sandbox construction tool，但它更像底层 building block，本身不承诺一个固定的安全策略。Firejail、nsjail、gVisor 等工具也分别在桌面应用隔离、CTF/fuzzing/service sandbox、container sandbox 等方向有更完整的能力。

shadox 的差异化不在于“我也能调用 seccomp/Landlock”。这些都是基础能力，不是项目护城河。

真正的差异化应该是：

> 把 sandbox execution 设计成 agent 可以理解和利用的数据产品。

也就是说，shadox 的核心输出不是一个被隔离的进程，而是一份执行报告：

- policy 是什么；
- budget 是什么；
- 执行过程发生了什么；
- 哪些输出值得关注；
- 失败原因是什么；
- 置信度有多高；
- 下一步该怎么调整。

如果把传统 sandbox 看成“墙”，shadox 更像“带黑匣子的执行舱”。

## 当前限制

shadox 目前还不应该被视为 hardened security boundary。如果要把它推进到完整安全边界，需要大量工程成本。具体来说，当前存在的限制为：

- `run` 仅支持 Linux，而且未来也只考虑 Linux 操作系统；Windows 侧可以 build CLI，但会返回明确的 unsupported error；
- v1 版本没有实现 network namespace、mount namespace、rootless user namespace、rootfs 管理。这些能力对于容器，特别是需要人登录的容器来说非常必要，但是对于一个 agent-native sandbox 来说，优先级并不高；
- cgroup v2 只做 ambient stats 读取，不创建或管理 cgroup；
- `--trace-syscalls` 目前是 reserved capability，会记录 degraded event，不会假装已经有 syscall timeline；
- Landlock denial 在子进程里通常表现为普通 `EACCES` 或 `EPERM`，因此 failure classification 会标注 confidence，而不是假装 100% 确定；
- basic seccomp profile 是 blocklist，不是严格安全 allowlist。

## 后续路线

后续会进一步完善：

- diagnostics 扩展：让 hint 更接近“下一步可执行动作”，例如建议具体添加哪个 path 到 allowlist；
- Python/TypeScript SDK：不嵌入解释器，只作为 JSONL/summary 的外部消费者。
- optional syscall trace：通过 ptrace 模式实现显式开启的 syscall timeline；
- file access provenance：记录命令读写了哪些文件，形成 execution provenance graph；
- agent budget contract：把 time、memory、process、output、write paths 都显式表达成预算，并在 summary 里报告预算消耗；
- policy diff：比较两次 run 的 effective policy，解释为什么一次能跑、一次不能跑。

进一步地，Shadox 的定位会是：成为一个用于 agent runtime、CI diagnostics、本地自动化执行的轻量执行观察层，并支持端侧生产级应用。

## 总结

shadox 的定位可以用一句话概括：

> A rootless, process-level, agent-observable sandbox runtime for Linux.

它不是 Docker 竞品，也不是 hardened sandbox 的替代品。它试图解决的是另一个更具体的问题：当 agent 在本地执行命令时，如何限制风险、记录过程、解释失败，并把结果变成上层系统可以继续消费的结构化数据。

如果说 Docker 的核心抽象是 container，那么 shadox 想打磨的核心抽象是 **sandboxed run as an explainable event stream**。
