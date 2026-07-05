import type { PermissionLevel, TerminalIntent } from "./session.js";
import { classifyTerminalIntent } from "./session.js";

export type PlannerRiskLevel = "low" | "medium" | "high";

export type PlannerDecision = {
  intent: TerminalIntent;
  needsTools: boolean;
  riskLevel: PlannerRiskLevel;
  requiredPermission: PermissionLevel;
  userVisibleSummary: string;
  plan: string[];
  stopCondition: string;
};

export function routeTerminalMessage(message: string): PlannerDecision {
  const intent = classifyTerminalIntent(message);
  if (intent === "code_change") {
    return {
      intent,
      needsTools: true,
      riskLevel: "medium",
      requiredPermission: "workspace-write",
      userVisibleSummary: "该请求需要先生成计划并等待批准，然后才能生成 diff。",
      plan: ["理解修改范围", "生成可审批计划", "批准后生成 diff"],
      stopCondition: "等待用户批准计划或拒绝计划。",
    };
  }
  if (intent === "security_task") {
    return {
      intent,
      needsTools: true,
      riskLevel: "high",
      requiredPermission: "security-active",
      userVisibleSummary: "安全任务必须先确认授权范围和风险级别。",
      plan: ["确认授权 scope", "评估风险", "只在批准边界内执行工具"],
      stopCondition: "授权范围缺失时停止。",
    };
  }
  if (intent === "project_analysis") {
    return {
      intent,
      needsTools: true,
      riskLevel: "low",
      requiredPermission: "read-only",
      userVisibleSummary: "该请求会读取项目上下文并给出自然语言总结。",
      plan: ["读取项目结构", "提取关键上下文", "总结结论"],
      stopCondition: "完成项目结构总结。",
    };
  }
  return {
    intent,
    needsTools: false,
    riskLevel: "low",
    requiredPermission: "read-only",
    userVisibleSummary: "普通聊天直接由 assistant 回复，不进入 plan。",
    plan: [],
    stopCondition: "assistant.message 已返回。",
  };
}
