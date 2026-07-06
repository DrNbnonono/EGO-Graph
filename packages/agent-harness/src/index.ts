export { classifyTerminalIntent, createTerminalAgentSession } from "./session.js";
export type {
  AgentHarnessPhase,
  AgentRunEvent,
  AgentRunEventType,
  EvidenceGapStep,
  PermissionLevel,
  TerminalAgentRunState,
  TerminalAgentSession,
  TerminalAgentSessionOptions,
  TerminalIntent,
  TerminalToolCall,
} from "./session.js";
export {
  createToolCall,
  executeToolCall,
  type ExecuteToolCallInput,
  type ToolCallProtocol,
  type ToolExecutorEvent,
  type ToolExecutorResult,
} from "./tool-executor.js";
export {
  buildPermissionRecoveryHint,
  hasPermission as hasHarnessPermission,
  requiredPermissionForTool as requiredPermissionForHarnessTool,
} from "./safety-policy.js";
export {
  evaluatePermissionRules,
  permissionRulesForLevel,
  type PermissionDecision,
  type PermissionEffect,
  type PermissionReply,
  type PermissionRequest,
  type PermissionRule,
} from "./permission-rules.js";
export {
  createPermissionLifecycleState,
  enqueuePermissionRequest,
  expirePermissionRequests,
  replyToPermissionRequest,
  type PermissionGrantMode,
  type PermissionLifecycleEntry,
  type PermissionLifecycleState,
  type PermissionRequestStatus,
} from "./permissions/permission-lifecycle.js";
export {
  createHarnessEvent,
  debugPayload,
  type HarnessEvent,
  userVisibleEventMessage,
} from "./event-protocol.js";
export { agentHarnessPhases, isPendingRun, type RunState } from "./run-state.js";
export { buildHarnessContextPack, type HarnessContextPackInput } from "./context-pack-bridge.js";
export { routeTerminalMessage, type PlannerDecision, type PlannerRiskLevel } from "./planner.js";
export * from "./memory-bridge.js";
export * from "./mcp-bridge.js";
export { patchApprovalFlow, requiresPatchApproval } from "./patch-harness.js";
export {
  hydratePendingRunsFromStore,
  replayRunFromStore,
  type HydratedPendingRun,
} from "./persistence.js";
export { truncateCheckOutput, type HarnessCheckResult } from "./check-runner.js";
export { canAttemptRepair, maxRepairAttempts } from "./repair-loop.js";
export {
  localizeCheckFailure,
  renderFailureLocalizationForPrompt,
  type FailureLocalization,
} from "./failure-localization.js";
export {
  executeHarnessToolStep,
  summarizeHarnessTool,
  type ExecuteHarnessToolStepInput,
} from "./tool-flow.js";
export { createEditTool, type EditToolInput, type EditToolOutput } from "./edit-tool.js";
export {
  loadPersistedLoopPolicy,
  savePersistedLoopPolicy,
  policyConfigPath,
} from "./policy-config.js";
export {
  analyzeContextBudget,
  renderContextBudgetHint,
  type ContextBudgetDecision,
} from "./context/context-budget.js";
export {
  baselineHardnessScenarios,
  scoreHardnessTrace,
  type HardnessCapability,
  type HardnessLevel,
  type HardnessScenario,
  type HardnessScore,
} from "./hardness/hardness-suite.js";
export { runAgentLoop, type AgentLoopInput } from "./agent-loop.js";
export { mergeLoopPolicy, defaultLoopPolicy, type LoopPolicy } from "./loop-policy.js";
export { evaluateBudgetWarning, type BudgetWarning } from "./stop-condition.js";
export {
  createLoopState,
  type LoopState,
  type LoopIntent,
  type PlannerAction,
} from "./loop-state.js";
export {
  createInitialStrategyGraph,
  strategyGraphToPrompt,
  summarizeStrategyGraph,
  type StrategyDomain,
  type StrategyEvidenceGap,
  type StrategyGraph,
  type StrategyHypothesis,
  type StrategyRiskPosture,
  type StrategyStage,
  type StrategyToolSummary,
} from "./strategy/strategy-graph.js";
export { type SecurityScopeGate } from "./tool-executor.js";
