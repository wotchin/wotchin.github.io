---
title: "shadox: An Agent-Native Rootless Process Sandbox"
description: "Introducing shadox: a lightweight rootless process sandbox for Linux that turns agent command execution into an explainable event stream with JSONL traces, effective policies, and diagnostic hints."
category: English
date: 2026-06-22
updated: 2026-06-22
tags:
  - rust
  - linux
  - sandbox
  - agent
  - observability
---

I have recently been studying Agent Runtime systems. With the help of a Code Agent, I quickly built a small research project called **shadox**: a lightweight, rootless, process-level sandbox runtime for Linux, written in Rust.

The original inspiration came from a classic engineering exercise: using a small amount of Shell code to explain the core ideas behind Docker, such as namespace, cgroup, and rootfs. But after looking more closely at sandboxing technologies, I became convinced that shadox should not be a simplified Docker, nor should it try to become another container runtime.

Its goal is narrower and more explicit:

> Without requiring root privileges, introducing a daemon, or recreating full container semantics, shadox provides restriction, observation, diagnostics, and programmable rules for ordinary commands executed by agents.

In other words, shadox is closer to an **agent execution flight recorder**. It does not merely put a command into a small room. It also records what happened during execution, why it failed, and where the agent should look next.

This idea is influenced by the growing interest in Agent Trace observability. It also connects to my recent experience with recording traces and compiling them into memory. The first step is to close the "first mile" of agent execution, then gradually form a more complete infrastructure loop. The final goal is not a large, general-purpose container system, let alone a virtualization layer. The goal is an agent-native sandbox that is lightweight enough to run on endpoint-side agents while still exposing a useful observability window.

## Why Not Build a mini-Docker?

If we try to build something "like Docker", it is very easy to move toward namespace, mount namespace, network namespace, overlayfs, image, OCI spec, cgroup delegation, rootfs management, registry, runtime shim, and so on. These directions are important, but they already have mature ecosystems.

shadox deliberately avoids that path. One reason is that I do not want to rebuild existing technology for its own sake. Another reason is that exploratory projects often fail to reach practical scenarios when their scope becomes too broad; they end up as research demos rather than useful tools.

The scenario shadox targets is lighter, more common, and more suitable for agents:

- A local agent needs to run ordinary commands such as `python script.py`, `npm test`, `grep`, or `cargo check`.
- We want to limit execution time, writable paths, process count, open files, and other resources.
- We want to know what the command printed, whether it timed out, whether it was blocked by seccomp, and whether it was likely denied by Landlock.
- We want to turn these signals into a structured event stream that an upper-layer agent can consume in real time, instead of making it inspect logs after the fact.
- We also want lightweight programmable observation rules, such as "if stderr contains a certain class of error, emit a finding".

The core question is not:

> How do we run a complete container?

The core question is:

> How do we let an agent execute commands in a restricted environment while making the result explainable, auditable, and machine-consumable?

That is the boundary of shadox.

## What shadox Implements Today

The current shadox v1 can be understood in four layers.

The first layer is **process supervision**. The parent process creates the run directory, starts the child process, captures stdout and stderr, supervises timeout, and kills the process group when necessary.

The second layer is **rootless restriction primitives**. On Linux, before the child process executes the target command, shadox applies:

- `rlimit`: limits CPU time, address space, open files, file size, and process count;
- `PR_SET_NO_NEW_PRIVS`: prevents later exec operations from gaining new privileges;
- Landlock: restricts filesystem read/write allowlists;
- a basic seccomp profile: blocks clearly dangerous or introspection-oriented syscalls such as `ptrace`, `bpf`, `perf_event_open`, and `mount`.

The third layer is **observability**. shadox emits JSONL trace events, samples lightweight resource information from `/proc`, and reads ambient cgroup v2 stats when available. It does not create or manage cgroups in v1, because that would push the project toward a heavier runtime.

The fourth layer is **agent diagnostics**. At the end of a run, shadox writes `summary.json`, which contains exit status, signal, timeout, resource usage, stdout/stderr tails, failure classification, observer findings, and diagnostic hints.

Together, these four layers produce not a full container, but an execution contract for agents.

## Effective Policy: Explain Before Run

One of the worst execution experiences for an agent is this: a command fails, but the agent cannot tell whether the command itself was wrong or the sandbox policy was too strict.

This is why shadox includes an important capability: `shadox explain`.

It outputs the **effective policy** of a run. In other words, it merges the TOML config, CLI overrides, and profile defaults, then tells you the policy that will actually take effect.

For example:

```bash
shadox explain \
  --profile read-only \
  --seccomp-profile off \
  -- /bin/echo hello
```

The output includes fields like:

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

The point is not that the JSON is pretty. The point is that an upper-layer agent can know how this command will be constrained before it runs. For agent runtimes, this is more important than a human-readable help text.

## Four Concrete Profiles

shadox currently provides only four profiles, and they are intentionally concrete.

| Profile | Design Intent |
| --- | --- |
| `agent-default` | The default agent execution mode: rootless restrictions plus observability. If no write allowlist is configured, the working directory is writable. |
| `read-only` | Denies filesystem writes by default. Useful for exploration, reading, and diagnostics. |
| `workspace-write` | Expresses the common case where an agent should only write inside the workspace. |
| `permissive-observe` | A trusted diagnostics mode that weakens filesystem restriction while keeping telemetry and reporting enabled. |

These profiles are not container modes or security level labels. They are closer to execution intents for agents.

For example, `read-only` does not mean the entire system is immutable. It only means that shadox does not provide a write allowlist by default in its filesystem policy. Users can still explicitly pass `--allow-write` to broaden the policy. The profile provides a default posture; the effective policy remains the final source of truth.

## Trace Events: A Native Event Stream for Agents

Each shadox run writes the following files by default:

```text
.shadox/runs/<timestamp>-<run_id>/trace.jsonl
.shadox/runs/<timestamp>-<run_id>/summary.json
```

`trace.jsonl` stores one JSON event per line, which makes it suitable for real-time agent consumption. Its structure looks like this:

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

The `kind` field represents the event type. Current event kinds include:

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

The fields `schema_version` and `profile_version` are especially important. Many tools focus only on "making it run" in the beginning, then discover later that their output format has no versioning, which makes integration painful. shadox treats trace and summary as formal contracts from the first version, not as temporary logs. This gives the schema room to evolve.

## Summary: Not Just What Failed, But What to Do Next

`summary.json` is the structured report produced after a run. It does not simply record an exit code. It tries to answer questions that are more useful to agents:

- Did the command exit successfully?
- If it failed, was it a timeout, signal, seccomp denial, Landlock-like denial, OOM-like failure, or ordinary non-zero exit?
- Is the classification high, medium, or low confidence?
- What evidence supports the classification?
- How many bytes were written to stdout and stderr, and what are the output tails?
- Did the observer script emit any findings?
- What should the agent inspect next?

For example, if a command was likely denied by Landlock, the summary may include a hint like this:

```json
{
  "code": "landlock_fs_allowlist",
  "severity": "warn",
  "message": "Filesystem access was likely denied by the effective Landlock allowlist.",
  "action": "Add the required path to fs.read or fs.write, or pass --allow-read/--allow-write for this run.",
  "tags": ["landlock", "filesystem", "policy"]
}
```

This is where shadox becomes differentiated. It is not only applying restrictions. It turns the result of those restrictions into diagnoses that an agent can understand. With these traces, an agent can get more reliable feedback for multi-step planning, failure recovery, and policy adjustment.

## Why Landlock, seccomp, and Rhai

Linux has many sandboxing primitives. shadox v1 chooses a set that is lightweight, rootless-friendly, and clear in implementation scope.

[Landlock](https://docs.kernel.org/userspace-api/landlock.html) is an unprivileged access-control mechanism in Linux. It is suitable for letting a process restrict filesystem permissions for itself and its future child processes. Compared with the traditional model of acquiring privileges first and then dropping them, Landlock is a better fit for ordinary user-space programs that want to voluntarily confine themselves.

[seccomp filter](https://docs.kernel.org/userspace-api/seccomp_filter.html) is used to filter syscalls. shadox v1 uses a conservative blocklist rather than an aggressive allowlist. This is not because blocklists are safer. It is because the v1 goal is to keep ordinary CLI programs usable while blocking a set of clearly dangerous or unsuitable syscalls for agent execution scenarios. Stricter allowlist profiles can come in later versions.

For programmable observation, shadox uses [Rhai](https://docs.rs/rhai/latest/rhai/). The reason is straightforward: Rhai is an embedded scripting language in the Rust ecosystem, and it is lightweight enough for this use case. In v1, Rhai scripts can only observe events and return findings; they cannot modify sandbox policy.

I also considered Lua and a Python SDK. But in terms of Rust integration and runtime weight, Rhai is a better fit for this stage. The observability logic we need is usually simple, so introducing a heavier runtime is unnecessary. Rhai-style code is also relatively easy for modern LLMs to generate and understand.

A simple observer rule looks like this:

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

The important constraint is this: scripts can interpret events, but they cannot change security policy. Otherwise, "programmable observation" can easily turn into "programmable bypass".

## Comparison with Existing Projects

shadox is not the first rootless sandbox, and it is not trying to replace existing tools.

For example, [bubblewrap](https://github.com/containers/bubblewrap) is a mature unprivileged sandbox construction tool, but it is closer to a low-level building block and does not itself promise a fixed security policy. Firejail, nsjail, and gVisor each have more complete capabilities in desktop application isolation, CTF/fuzzing/service sandboxing, and container sandboxing.

The differentiation of shadox is not "it can call seccomp and Landlock too". Those are basic capabilities, not the moat.

The real differentiation should be:

> Designing sandbox execution as a data product that agents can understand and use.

In other words, the core output of shadox is not merely an isolated process. It is an execution report:

- What was the policy?
- What was the budget?
- What happened during execution?
- Which outputs deserve attention?
- Why did it fail?
- How confident is the diagnosis?
- What should change next?

If a traditional sandbox is a wall, shadox is closer to an execution cabin with a black box.

## Current Limitations

shadox should not currently be treated as a hardened security boundary. Turning it into a complete security boundary would require a significant amount of engineering work. Current limitations include:

- `run` only supports Linux, and the project is expected to remain Linux-focused. The Windows side can build the CLI, but `run` returns a clear unsupported error.
- v1 does not implement network namespace, mount namespace, rootless user namespace, or rootfs management. These are important for containers, especially containers intended for human login, but they are not high-priority for an agent-native sandbox.
- cgroup v2 is used only for ambient stats reading; shadox does not create or manage cgroups.
- `--trace-syscalls` is currently a reserved capability. It records a degraded event and does not pretend to provide a syscall timeline.
- Landlock denials usually appear to the child process as ordinary `EACCES` or `EPERM`, so failure classification is labeled with confidence instead of pretending to be 100% certain.
- The basic seccomp profile is a blocklist, not a strict security allowlist.

## Roadmap

The next steps are:

- diagnostics expansion: make hints closer to executable next actions, such as suggesting the specific path to add to an allowlist;
- Python/TypeScript SDKs: keep them as external consumers of JSONL and summary files rather than embedding interpreters;
- optional syscall trace: add an explicitly enabled ptrace-backed syscall timeline;
- file access provenance: record which files a command reads and writes, forming an execution provenance graph;
- agent budget contract: express time, memory, process, output, and write paths as explicit budgets, then report budget consumption in the summary;
- policy diff: compare the effective policies of two runs and explain why one succeeded while the other failed.

More broadly, shadox aims to become a lightweight execution observation layer for agent runtimes, CI diagnostics, and local automation. The long-term goal is endpoint-side production usability while staying aligned with the lightweight positioning.

## Summary

The positioning of shadox can be summarized in one sentence:

> A rootless, process-level, agent-observable sandbox runtime for Linux.

It is not a Docker competitor, nor is it a replacement for hardened sandboxes. It tries to solve a more specific problem: when an agent executes commands locally, how do we limit risk, record the process, explain failures, and turn the result into structured data that upper-layer systems can continue to consume?

If the core abstraction of Docker is the container, the core abstraction shadox wants to refine is **sandboxed run as an explainable event stream**.
