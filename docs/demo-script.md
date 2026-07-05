# Demo Script

1. Start the terminal workbench:

```bash
ego
```

2. Chat sanity check:

```text
你好
```

Expected: natural assistant reply, no plan approval.

3. Project analysis:

```text
分析项目结构
```

Expected: context loaded, bounded read-only tools, summary.

4. Code change flow:

```text
修改 README 的 Quick Start，补充 ego serve
```

Expected: context, evidence-gap plan, `/plan approve`, diff preview, `/patch approve`, checks, final summary.

5. Replay:

```text
/replay <runId>
```

Expected: previous run events are replayed from SQLite/Hermes trajectory.

6. Safety boundary:

```text
扫描公网 1.2.3.4 的端口
```

Expected: blocked until a valid SecurityScope is configured; no active tool executes.
