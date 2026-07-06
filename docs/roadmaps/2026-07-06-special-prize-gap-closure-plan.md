# EGO-Graph 特等奖能力补齐计划

目标不是复制 opencode，而是吸收其工程成熟度，服务于赛题的核心目标：
具备自主决策能力的通用网络安全智能体。最终闭环必须覆盖任务理解、威胁
感知、策略规划、工具协同、证据沉淀、可解释报告和安全可控的人机协同。

## 目录原则

- `packages/agent-harness/src/strategy/`：目标树、假设树、证据缺口、策略图。
- `packages/agent-harness/src/context/`：上下文预算、自动压缩、active context。
- `packages/agent-harness/src/hardness/`：复杂度场景、评分、CI eval 协议。
- `packages/agent-harness/src/permissions/`：权限请求生命周期、持久化授权策略。
- `packages/agent-harness/src/scheduler/`：多工具 DAG、并行、重试、失败恢复。
- `packages/tools/src/security/`：按场景拆分真实安全工具适配器。
- `packages/report/src/evidence/`：证据图谱、复现包、答辩报告。
- `apps/ego-cli/src/tui/`：只放 UI 组件，不塞 Agent 决策逻辑。

## P0：必须补齐，否则不能冲特等奖

1. 自主决策核心
   - 已开始：`strategy/strategy-graph.ts` 生成 StrategyGraph。
   - 待补：StrategyGraph 状态更新、假设支持/反驳、证据缺口关闭规则。
   - 验收：每个 run 都有 `strategy.graph.created`，高风险任务必须先关闭授权缺口。

2. 自动上下文与长任务韧性
   - 已开始：`context/context-budget.ts` 输出预算决策和 `context.budget.warning`。
   - 待补：自动 compaction、active context after compaction、模型 context limit 读取。
   - 验收：长会话自动保留 P0 证据缺口、工具结果、最终结论，不丢失关键上下文。

3. Hardness 评测
   - 已开始：`hardness/hardness-suite.ts` 定义 H2/H3/H4 基线场景和评分。
   - 待补：真实夹具、隐藏任务、噪声文件、工具失败、权限拒绝、对抗 prompt。
   - 验收：CI 可输出每个场景的 score、缺失能力和缺失事件。

4. 安全工具链深度
   - 待补目录：`packages/tools/src/security/{web,ir,pcap,reverse,vuln,report}/`。
   - Web：爬取、表单识别、headers、参数点、低风险 fixture 请求。
   - IR：日志解析、时间线、IOC 提取、异常进程/账户/网络连接。
   - PCAP：tshark/pyshark 适配、协议统计、可疑流、凭据痕迹。
   - Reverse：file/strings/hash/binwalk/ghidra headless 适配。
   - 验收：每类工具都有 schema、权限、沙箱、证据 mapper、单测。

5. 工具协同与失败恢复
   - 待补：`scheduler/` 支持 DAG、并行只读工具、重试、fallback、超时降级。
   - 验收：同一任务可并行收集上下文；工具失败会转入替代工具或说明残余风险。

6. 权限生命周期
   - 待补：pending permission queue、allow once、allow always、reject、TTL、资源绑定。
   - 验收：TUI/API/Web 看到同一权限队列；所有高风险工具均可审计。

7. 真实沙箱与网络边界
   - 待补：process/docker/nsjail 可用性检测、egress allowlist、secret redaction。
   - 验收：危险 shell/network 工具没有沙箱或 SecurityScope 时不能执行。

## P1：形成 opencode 级工程成熟度

1. Session/Event 模型
   - 按 message/part/tool/permission/status 拆分持久化结构。
   - 支持 abort、wait、history、replay、revert、fork、resume after crash。

2. 模型 Provider 体系
   - provider catalog、model context limit、profile fallback、成本/速率统计。
   - Web 与 TUI 共享 `.ego/config.json`，禁止各自维护配置分叉。

3. TUI 行为等价
   - prompt、dialog、sidebar、footer、permission footer、tool snapshots。
   - 默认折叠 thinking/tool details，支持 Ctrl+O 展开。

4. MCP/插件生态
   - OAuth、stdio/http 状态、工具 schema 版本、工具权限策略、插件包元数据。

5. 证据图谱与报告
   - 生成 evidence graph、decision trace、repro bundle、residual risk。
   - 报告必须能引用工具输出、文件、命令、时间戳和审批记录。

## P2：决赛展示与附加价值

1. 决赛场景包
   - Web 漏洞、代码审计、日志应急、PCAP、逆向辅助，每类 1-2 个高质量 demo。

2. 团队协作
   - 三人协同视角：任务看板、人工标注、审批记录、会话归档、复盘导出。

3. 产品化
   - doctor、自检、离线降级、安装脚本、演示脚本、答辩 dashboard。

4. 创新表达
   - 对外叙事聚焦：Evidence-Guided Orchestration Graph。
   - 评委应看到的不只是“会调用工具”，而是“有证据、有边界、有复盘的自主决策”。

## 执行顺序

1. P0-1/P0-2/P0-3：策略图、上下文、hardness 先成型。
2. P0-4/P0-5：安全工具包和调度器并行推进。
3. P0-6/P0-7：权限生命周期与沙箱落地。
4. P1：Session/provider/TUI/MCP/report 全部围绕 P0 数据结构重构。
5. P2：做决赛场景和答辩包装。

每一阶段合并前必须跑：

```bash
node node_modules/typescript/bin/tsc -b --pretty false
node node_modules/vitest/vitest.mjs run
```
