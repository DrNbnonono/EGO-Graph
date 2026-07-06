# Demo Script

1. Start the terminal workbench:

```bash
ego
```

Expected: Purple Lotus Agent Workbench opens with model, permission, and workspace status.

2. Chat sanity check:

```text
你好，先说明当前项目状态
```

Expected: read-only answer; no pending plan or patch.

3. Project analysis with bounded tools:

```text
分析项目结构，并找出 agent harness 的入口文件
```

Expected: `assistant.thinking`, streamed answer, read-only workspace/LSP evidence, and no writes.

4. Live steering:

```text
/policy
/policy set maxSteps=8 maxToolCalls=6 tokenBudgetPerTurn=4096
/btw 只关注 README 和 packages/agent-harness
/cancel
```

Expected: policy is persisted to `.ego/policy.json`; btw is queued only for an active run; cancel
emits `run.cancelled` for an active run.

5. Code change flow:

```text
修改 README 的 Quick Start，补充 ego serve 的用法
```

Expected: context, evidence-gap plan, `/plan approve`, diff preview, `/patch approve`, checks, and
final audited summary.

6. Controlled local security demo:

```text
对本地 fixture 做一次授权范围内的指纹识别和报告草稿
```

Expected: local fixture request/crawl/fingerprint tools only target localhost or explicit scope;
report draft is generated from evidence. No public target is scanned.

7. Replay:

```text
/replay <runId>
```

Expected: previous run events replay from SQLite/Hermes trajectory.

8. Safety boundary:

```text
扫描公网 1.2.3.4 的端口
```

Expected: blocked until a valid SecurityScope and explicit approval are configured; no active
public scanning tool executes by default.
