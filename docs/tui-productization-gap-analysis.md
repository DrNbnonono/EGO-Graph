# EGO-Graph TUI Productization Gap Analysis

本文记录当前终端 TUI 的真实状态、和 Claude Code / Codex 类终端 Agent 体验的差距，以及本轮改造方案。范围只覆盖终端产品体验，不新增安全攻击能力，不改变 Plan -> Diff -> Approval -> Apply -> Checks 的安全边界。

## 1. 当前 TUI 调用链

当前入口链路如下：

```text
pnpm dev / ego
  -> apps/ego-cli/src/index.ts
  -> runCli()
  -> default command action
  -> apps/ego-cli/src/commands/tui.ts
  -> renderTui()
  -> apps/ego-cli/src/tui.tsx
  -> createTerminalAgentSession()
  -> packages/agent-harness/src/session.ts
```

TUI 通过 `createTerminalAgentSession()` 调用 Agent Harness。普通聊天进入 `submitMessage()`，代码修改和安全任务进入 `startTask()`，审批通过 `approvePlan()` 和 `approvePatch()` 完成。Workbench 状态通过 `readWorkbenchState()` 读取模型、存储、memory、plans、MCP、skills 和最近 runs。

关键结论：TUI 应继续保持 thin UI。Agent run、审批、patch、checks、memory、MCP、replay 都不应搬到 TUI 内部。

## 2. 当前布局结构

当前 `apps/ego-cli/src/tui.tsx` 是一个约 900 行的单文件组件，内部同时承担：

- command registry
- key handling
- Agent stream 执行
- workbench 状态刷新
- conversation rendering
- right rail status
- diff/checks/plan/debug 渲染
- input bar
- helper 函数和测试导出

布局固定为：

```text
Header
ConversationStream + RightRail(width=38)
InputBar
```

问题是右侧固定栏长期占用宽度，小屏时压缩主对话区；状态信息默认过多，界面更像 dashboard，而不是对话式 Agent。

## 3. 当前 Input Handling 问题

当前输入框只是 `input` 字符串加 `<Text>` 展示，存在以下缺口：

- 没有真实光标位置模型。
- 不支持左右移动、Home/End、Ctrl+A、Ctrl+E。
- 不支持 Ctrl+U、Ctrl+K 等 prompt editor 快捷键。
- Up/Down 默认用于滚动对话，不能浏览输入历史。
- busy 时直接阻止输入，不能预编辑下一条草稿。
- 多行输入缺少稳定方案。
- CJK/IME 下按 JS string length 截断，容易造成视觉错位。
- 输入框和 palette 共用一行文本拼接，视觉上容易被历史输出污染。

## 4. 当前 Command Palette 问题

当前 slash command 已有 `CommandManifest` 雏形，但 UI 仍是 input 上方一行文本。缺口包括：

- 不是 overlay。
- 只支持 prefix match，不支持 fuzzy filter。
- Tab 可循环，但 ArrowUp/ArrowDown 未用于 palette 选择。
- Esc 直接退出程序，而不是先关闭 palette/overlay。
- 命令未显示 shortcut、requires active run、requires permission、available 状态。
- `/` 会通过 `resolvePaletteInput()` 执行第一项，不符合 “打开 palette 后等待用户确认” 的习惯。
- `/allow` 没有展开权限候选。
- `/plan approve` 和 `/patch approve` 在没有 active run 时没有灰置/不可用提示。

## 5. 当前 History / Replay 问题

当前 `/sessions` 展示的是进程内 `runSessions`，不是持久化历史。`/replay <runId>` 需要用户知道完整 runId。Workbench 能读 `recentRuns`，storage 也有 `listRuns()` 和 Hermes events，但 TUI 没有把它们做成可浏览的历史面板。

缺口：

- 没有 `/history` 持久化历史浏览器。
- 没有用序号 replay/switch。
- replay 打开后没有明确 read-only replay mode。
- 新消息和历史 replay 的模式边界不清晰。
- `runSessions` 只能作为当前进程缓存，不能替代 SQLite/Hermes 历史。

## 6. 当前 CJK / Markdown 渲染问题

当前 `truncate()` 使用 JS `value.length` 和 `slice()`，会把中文、全角符号、emoji、ANSI 样式和长路径当作等宽字符处理。Markdown 渲染也只是按行输出，assistant 长回复只取前 8 行。

缺口：

- 没有 display width 计算。
- 没有 CJK-safe wrap/truncate。
- 没有 ANSI-safe 处理。
- 没有 Markdown heading、bullet、code fence 的基础展示。
- 长消息不能在 conversation view 中稳定滚动查看。

## 7. 与 Claude Code / Codex 体验的差距

当前差距主要在产品形态，而不是 Agent 内核：

- 首屏不是 welcome + prompt，而是带右栏的监控面板。
- 输入不是稳定 prompt editor。
- slash command 不是可交互 overlay。
- 对话区默认混入过多工具/证据日志。
- 历史 run 不可浏览。
- Plan/Diff/Checks/Debug 是右栏详情，不是可聚焦 overlay/mode。
- 小终端没有合理降级。
- 中文显示不稳定，影响主要用户语言体验。

## 8. 本轮改造方案

本轮采用 “Terminal UX Productization Sprint”：

1. 先拆分 `apps/ego-cli/src/tui.tsx`，新增 `apps/ego-cli/src/tui/` 模块目录。
2. 旧 `tui.tsx` 保留为 thin re-export，避免破坏现有 import。
3. 新 TUI 采用 conversation-first 布局，默认不显示右栏。
4. 无 active conversation 时显示 Claude Code 风格 welcome screen。
5. 底部固定 PromptInput，维护 cursor、history、draft、multiline。
6. Slash command 以 overlay 展示，支持 fuzzy filter、Tab/Arrow 选择、Enter 执行、Esc 关闭。
7. 新增 HistoryBrowser，从 SQLite/Workbench recentRuns 读取最近 run，并支持 `/history`、`/replay 1`、`/switch 1`。
8. Plan/Diff/Checks/Debug 改为 overlay/mode，不再挤在右栏。
9. 新增 CJK display width、wrap、truncate helpers，替换 UI 中的 `slice()` 截断。
10. 补 TUI 单元测试，覆盖 command palette、prompt input、history、CJK、layout、event rendering。

不会做的事：

- 不新增攻击、扫描、漏洞利用能力。
- 不改变 Agent Harness 的安全审批边界。
- 不把模型工具循环、patch apply、checks 逻辑搬进 TUI。

## 9. 验收标准

本轮完成后应满足：

- `pnpm dev` 启动后，如果没有 active conversation，显示 welcome screen、模型、权限、workspace、tips 和底部 prompt。
- 输入普通自然语言后切换到 conversation view。
- 输入框始终固定在底部，并支持左右移动、Home/End、Ctrl+A、Ctrl+E、Ctrl+U、Ctrl+K、Backspace/Delete、Ctrl+J 多行、Up/Down 输入历史。
- 输入 `/` 打开 overlay command palette，不直接执行第一条命令。
- Palette 支持 fuzzy filter、Tab/Arrow 选择、Enter 执行、Esc 关闭。
- `/history` 展示最近持久化 runs，`/replay 1` 可以按序号打开历史。
- 默认 conversation 只展示用户、assistant、plan/patch/check/final summary，tool/evidence/debug 默认折叠。
- `/debug` 才展示 payload/debug 详情。
- 中文、emoji、Markdown bullet、Windows 路径、长 runId 不出现半字符截断和明显错位。
- width < 100 时不显示右栏，状态压缩到底部 status line。
- Plan/Patch 审批流程不变，未审批不写文件。
- 验证命令通过：`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm test`、`pnpm smoke`、`pnpm eval:smoke`。
