import type { PermissionLevel } from "../session.js";
import type { LoopIntent } from "../loop-state.js";

export type StrategyDomain =
  | "code_audit"
  | "web_pentest"
  | "incident_response"
  | "vulnerability_research"
  | "reverse_engineering"
  | "pcap_forensics"
  | "project_analysis"
  | "general";

export type StrategyRiskPosture = "read_only" | "local_active" | "network_active" | "blocked";

export type StrategyToolSummary = {
  name: string;
  description?: string;
  permissionScope?: string;
  riskLevel?: "low" | "medium" | "high";
  requiresApproval?: boolean;
  scenarios?: string[];
};

export type StrategyHypothesis = {
  id: string;
  title: string;
  status: "open" | "supported" | "rejected" | "blocked";
  confidence: number;
  requiredEvidence: string[];
};

export type StrategyEvidenceGap = {
  id: string;
  question: string;
  priority: "p0" | "p1" | "p2";
  candidateTools: string[];
  verification: string;
};

export type StrategyStage = {
  id: string;
  title: string;
  objective: string;
  candidateTools: string[];
  parallelizable: boolean;
  dependsOn: string[];
};

export type StrategyGraph = {
  id: string;
  runId: string;
  sessionId: string;
  goal: string;
  intent: LoopIntent;
  domain: StrategyDomain;
  createdAt: string;
  riskPosture: StrategyRiskPosture;
  assumptions: string[];
  hypotheses: StrategyHypothesis[];
  evidenceGaps: StrategyEvidenceGap[];
  stages: StrategyStage[];
  stopCriteria: string[];
  hardnessChecks: string[];
};

export function createInitialStrategyGraph(input: {
  runId: string;
  sessionId: string;
  message: string;
  intent: LoopIntent;
  permissionLevel: PermissionLevel;
  tools: StrategyToolSummary[];
  hasSecurityScope?: boolean;
  now?: string;
}): StrategyGraph {
  const domain = inferStrategyDomain(input.message, input.intent);
  const riskPosture = inferRiskPosture(input.permissionLevel, input.hasSecurityScope ?? false);
  const toolIndex = createToolIndex(input.tools);
  const stages = buildStages(domain, riskPosture, toolIndex);
  return {
    id: `strategy-${input.runId}`,
    runId: input.runId,
    sessionId: input.sessionId,
    goal: input.message,
    intent: input.intent,
    domain,
    createdAt: input.now ?? new Date().toISOString(),
    riskPosture,
    assumptions: buildAssumptions(input.intent, riskPosture),
    hypotheses: buildHypotheses(domain, riskPosture),
    evidenceGaps: buildEvidenceGaps(domain, riskPosture, toolIndex),
    stages,
    stopCriteria: buildStopCriteria(domain, riskPosture),
    hardnessChecks: buildHardnessChecks(domain),
  };
}

export function summarizeStrategyGraph(graph: StrategyGraph): string {
  const openGaps = graph.evidenceGaps
    .filter((gap) => gap.priority !== "p2")
    .map((gap) => `${gap.id}:${gap.question}`)
    .join(" | ");
  const stages = graph.stages.map((stage) => stage.title).join(" -> ");
  return [
    `StrategyGraph domain=${graph.domain} posture=${graph.riskPosture}`,
    `stages=${stages}`,
    `priorityEvidenceGaps=${openGaps || "none"}`,
    `stopCriteria=${graph.stopCriteria.join(" | ")}`,
  ].join("\n");
}

export function strategyGraphToPrompt(graph: StrategyGraph): string {
  return [
    "Use this auditable strategy graph as the mission scaffold.",
    summarizeStrategyGraph(graph),
    "Before answering, prefer closing P0 evidence gaps. Do not execute active security steps unless the risk posture allows them.",
  ].join("\n");
}

function inferStrategyDomain(message: string, intent: LoopIntent): StrategyDomain {
  const text = message.toLowerCase();
  if (/\b(pcap|wireshark|traffic|流量|数据包)\b/u.test(text)) return "pcap_forensics";
  if (/\b(reverse|binary|elf|pe|ida|ghidra|逆向|二进制)\b/u.test(text)) {
    return "reverse_engineering";
  }
  if (/\b(incident|forensic|log|日志|应急|入侵|溯源)\b/u.test(text)) {
    return "incident_response";
  }
  if (/\b(web|xss|sql|sqli|csrf|ssrf|rce|渗透|漏洞复现)\b/u.test(text)) {
    return "web_pentest";
  }
  if (/\b(cve|vulnerability|漏洞|poc|exploit|fuzz)\b/u.test(text)) {
    return "vulnerability_research";
  }
  if (/\b(audit|semgrep|依赖|代码审计|安全审计)\b/u.test(text)) return "code_audit";
  if (intent === "project_analysis" || intent === "code_change") return "project_analysis";
  return "general";
}

function inferRiskPosture(
  permissionLevel: PermissionLevel,
  hasSecurityScope: boolean,
): StrategyRiskPosture {
  if (permissionLevel === "read-only") return "read_only";
  if (permissionLevel === "workspace-write" || permissionLevel === "shell-readonly") {
    return "local_active";
  }
  if (permissionLevel === "network-low" || permissionLevel === "security-active") {
    return hasSecurityScope || permissionLevel === "network-low" ? "network_active" : "blocked";
  }
  return "read_only";
}

function createToolIndex(tools: StrategyToolSummary[]): Map<string, StrategyToolSummary> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function hasTool(index: Map<string, StrategyToolSummary>, name: string): string[] {
  return index.has(name) ? [name] : [];
}

function toolsMatching(index: Map<string, StrategyToolSummary>, pattern: RegExp): string[] {
  return [...index.keys()].filter((name) => pattern.test(name)).slice(0, 6);
}

function buildStages(
  domain: StrategyDomain,
  riskPosture: StrategyRiskPosture,
  tools: Map<string, StrategyToolSummary>,
): StrategyStage[] {
  const contextTools = [
    ...hasTool(tools, "workspace.list"),
    ...hasTool(tools, "workspace.grep"),
    ...hasTool(tools, "workspace.read"),
  ];
  const evidenceTools = [...hasTool(tools, "evidence.write")];
  const securityTools = toolsMatching(tools, /^(security|ctf|local_fixture|web|api_doc)\./u);
  const stages: StrategyStage[] = [
    {
      id: "scope",
      title: "Scope and constraints",
      objective: "Confirm target, authorization, success criteria, and safety boundaries.",
      candidateTools: contextTools,
      parallelizable: false,
      dependsOn: [],
    },
    {
      id: "evidence",
      title: "Evidence collection",
      objective: "Collect artifacts before making claims.",
      candidateTools: [...contextTools, ...securityTools].slice(0, 8),
      parallelizable: riskPosture !== "blocked",
      dependsOn: ["scope"],
    },
    {
      id: "verification",
      title:
        domain === "project_analysis" ? "Cross-check findings" : "Validate security hypotheses",
      objective: "Confirm or reject hypotheses with independent evidence.",
      candidateTools: [
        ...securityTools,
        ...hasTool(tools, "check.test"),
        ...hasTool(tools, "check.typecheck"),
      ],
      parallelizable: true,
      dependsOn: ["evidence"],
    },
    {
      id: "report",
      title: "Explainable report",
      objective: "Produce a reproducible conclusion with evidence references and residual risks.",
      candidateTools: evidenceTools,
      parallelizable: false,
      dependsOn: ["verification"],
    },
  ];
  if (riskPosture === "blocked") {
    stages.splice(1, 0, {
      id: "authorization",
      title: "Authorization required",
      objective: "Ask for SecurityScope before active security tooling.",
      candidateTools: [],
      parallelizable: false,
      dependsOn: ["scope"],
    });
  }
  return stages;
}

function buildAssumptions(intent: LoopIntent, riskPosture: StrategyRiskPosture): string[] {
  const assumptions = [
    "All user-visible claims must cite observations, evidence, or tool output.",
    "Prefer read-only collection before active changes or active security actions.",
  ];
  if (intent === "security_task") {
    assumptions.push(
      "Active security tooling is allowed only inside the configured SecurityScope.",
    );
  }
  if (riskPosture === "blocked") {
    assumptions.push("No active network/security action may run until authorization is explicit.");
  }
  return assumptions;
}

function buildHypotheses(
  domain: StrategyDomain,
  riskPosture: StrategyRiskPosture,
): StrategyHypothesis[] {
  const common: StrategyHypothesis[] = [
    {
      id: "h1",
      title: "The task can be solved from local evidence and bounded tool output.",
      status: "open",
      confidence: 0.45,
      requiredEvidence: ["workspace context", "tool observations"],
    },
    {
      id: "h2",
      title: "The initial user request is underspecified and needs scope clarification.",
      status: riskPosture === "blocked" ? "supported" : "open",
      confidence: riskPosture === "blocked" ? 0.75 : 0.35,
      requiredEvidence: ["authorization", "target boundaries", "success criteria"],
    },
  ];
  const domainTitle: Record<StrategyDomain, string> = {
    code_audit: "A code or dependency weakness exists and can be localized.",
    web_pentest: "The target has an input, auth, or server-side weakness.",
    incident_response: "The logs/artifacts contain an attack timeline or compromise indicator.",
    vulnerability_research: "A vulnerability hypothesis can be reproduced or ruled out.",
    reverse_engineering: "Static strings/metadata reveal behavior before dynamic analysis.",
    pcap_forensics: "Traffic contains protocol, credential, or beaconing indicators.",
    project_analysis: "Repository structure and tests reveal the required implementation path.",
    general: "The task needs decomposition before tool execution.",
  };
  return [
    ...common,
    {
      id: "h3",
      title: domainTitle[domain],
      status: "open",
      confidence: 0.4,
      requiredEvidence: ["domain-specific artifacts", "independent verification"],
    },
  ];
}

function buildEvidenceGaps(
  domain: StrategyDomain,
  riskPosture: StrategyRiskPosture,
  tools: Map<string, StrategyToolSummary>,
): StrategyEvidenceGap[] {
  const gaps: StrategyEvidenceGap[] = [
    {
      id: "g1",
      question: "What exact target, constraints, and success criteria define the task?",
      priority: "p0",
      candidateTools: hasTool(tools, "workspace.read"),
      verification: "Confirm from user request, project files, or explicit SecurityScope.",
    },
    {
      id: "g2",
      question: "Which artifacts support or contradict the leading hypothesis?",
      priority: "p0",
      candidateTools: [
        ...hasTool(tools, "workspace.grep"),
        ...hasTool(tools, "workspace.read"),
        ...hasTool(tools, "evidence.write"),
      ],
      verification: "Every conclusion links to at least one observation or evidence record.",
    },
  ];
  if (riskPosture === "blocked") {
    gaps.push({
      id: "g3",
      question: "Is active security authorization present and within time/target boundaries?",
      priority: "p0",
      candidateTools: [],
      verification: "Require SecurityScope before network or intrusive tools.",
    });
  }
  const domainTools = toolsMatching(tools, domainToolPattern(domain));
  gaps.push({
    id: "g4",
    question: `Which ${domain.replace("_", " ")} checks should be run to avoid a shallow answer?`,
    priority: "p1",
    candidateTools: domainTools,
    verification: "Use at least two independent signals for high-impact findings.",
  });
  return gaps;
}

function buildStopCriteria(domain: StrategyDomain, riskPosture: StrategyRiskPosture): string[] {
  const criteria = [
    "Stop when P0 evidence gaps are answered or explicitly blocked.",
    "Stop before any action outside permission or SecurityScope.",
    "Report residual uncertainty instead of inventing unsupported conclusions.",
  ];
  if (riskPosture === "blocked") {
    criteria.unshift("Stop immediately after requesting missing active-security authorization.");
  }
  if (domain !== "general") {
    criteria.push("Include a reproducible verification path for domain-specific findings.");
  }
  return criteria;
}

function buildHardnessChecks(domain: StrategyDomain): string[] {
  const checks = [
    "Tool failure fallback is documented.",
    "Noisy or irrelevant artifacts are ignored unless evidence-linked.",
    "Long-context evidence is summarized without dropping P0 gaps.",
  ];
  if (domain === "web_pentest" || domain === "vulnerability_research") {
    checks.push("Exploitability is separated from impact and authorization.");
  }
  if (domain === "incident_response" || domain === "pcap_forensics") {
    checks.push("Timeline claims include timestamps or packet/log anchors.");
  }
  return checks;
}

function domainToolPattern(domain: StrategyDomain): RegExp {
  switch (domain) {
    case "web_pentest":
      return /^(web|api_doc|local_fixture|security)\./u;
    case "incident_response":
      return /^(workspace|ctf|security|evidence)\./u;
    case "reverse_engineering":
      return /^(ctf|workspace|security)\./u;
    case "pcap_forensics":
      return /^(ctf\.pcap|workspace|evidence)\./u;
    case "vulnerability_research":
    case "code_audit":
      return /^(security|workspace|check|evidence)\./u;
    case "project_analysis":
      return /^(workspace|check|lsp|evidence)\./u;
    case "general":
      return /^(workspace|evidence)\./u;
  }
}
