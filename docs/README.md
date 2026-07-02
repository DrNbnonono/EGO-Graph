# EGO-Graph 目录结构说明

> XH-202609 比赛项目 — 具备自主决策能力的通用网络安全智能体

## 设计思路

比赛要求智能体覆盖 **渗透测试 / 应急响应 / 漏洞挖掘 / 逆向分析** 四大场景，并具备
**自主任务理解 / 多场景决策执行 / 鲁棒可解释** 三大特性。

我们采用"**一套内核 + 场景 overlay**"的架构：通用决策引擎只做一次,
不同安全场景通过 `overlays/` 注入差异化的工具集、计划模板、评估器。
这样既保证工程复用(对应评分的"系统架构"分),又天然具备插件化扩展能力(对应"工具调用与协同")。

## 目录作用

```
EGO-Graph/
├── backend/                  # 核心实现 (Python)
│   ├── app/
│   │   ├── core/             # 配置、数据库、安全(API Key/审计日志)
│   │   ├── domain/           # 领域模型:任务规约、决策图、证据、策略、轨迹
│   │   ├── agent/            # 决策引擎 (ReAct/Plan-Execute 工作流)
│   │   │   └── nodes/        # 各阶段节点: 解析 → 规划 → 选工具 → 策略门 → 执行 → 观察 → 评估 → 报告
│   │   ├── tools/            # 工具层 (调用 nmap/sqlmap/ghidra/...)
│   │   │   └── parsers/      # 各工具输出解析器 (输出→结构化证据)
│   │   ├── overlays/         # 场景 overlay —— 差异化能力入口
│   │   │   ├── web_pentest/         渗透测试
│   │   │   ├── incident_response/   应急响应
│   │   │   ├── vulnerability_research/ 漏洞挖掘
│   │   │   └── reverse_engineering/ 逆向分析
│   │   ├── sandbox/          # Docker 沙箱 (隔离危险工具执行)
│   │   ├── storage/          # 持久化 (SQLite + 轨迹 JSONL)
│   │   ├── cli/              # 终端入口 (类似 Claude Code 的 TUI/CLI)
│   │   └── api/              # 预留 HTTP API (供后续 Web UI 调用)
│   └── tests/                # 单元 / 集成 / e2e 测试
│
├── scenarios/                # 场景示例与剧本 (供复现 / 人机协同赛)
│   ├── web_pentest/                 每个场景: 任务描述 + 期望决策链 + 复现脚本
│   ├── incident_response/
│   ├── vulnerability_research/
│   └── reverse_engineering/
│
├── datasets/                 # 评测与训练数据
│   ├── trajectories/         # 决策轨迹 (用于复现 + 评分回溯)
│   ├── evals/                # 人机协同赛题集
│   └── prompts/              # 提示词版本管理
│
├── docker/                   # 各场景沙箱镜像 (nmap/sqlmap/ghidra 工具链)
│
├── docs/                     # 设计 / 开发 / 测试 / 用户 文档
│
├── submit/                   # 比赛提交物
│   ├── slides/               # 答辩 PPT
│   ├── demo-video/           # 演示视频
│   └── declaration/          # 原创性与保密性声明函
│
├── scripts/                  # 一键部署、轨迹回放、评测脚本
└── .gitignore
```

## 一键骨架命令

```bash
# 创建后 (开发期常用)
cd backend && python -m app.cli run --scenario web_pentest --task "..."

# 回放历史决策链 (用于答辩中演示"可解释性")
python -m app.cli replay --trajectory-id xxx

# 跑评测
python -m app.cli eval --dataset datasets/evals/web_pentest.jsonl
```

## 待补充文件 (核心)

下阶段需填充的最关键文件:
- [ ] `backend/app/cli/main.py`                CLI 入口
- [ ] `backend/app/agent/graph.py`             决策图主流程
- [ ] `backend/app/agent/state.py`             智能体状态结构
- [ ] `backend/app/domain/task_spec.py`        任务规约(自然语言→结构化)
- [ ] `backend/app/domain/mission_graph.py`    决策图领域模型
- [ ] `backend/app/domain/trajectory.py`       决策轨迹(用于可解释性)
- [ ] `backend/app/overlays/web_pentest/playbook.yaml`  渗透测试场景剧本

每个场景 overlay 内统一包含 `playbook.yaml` / `tools.yaml` / `prompts.md` / `evaluators.py`。
