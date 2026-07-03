export type EvidenceKind = "fact" | "hypothesis" | "artifact" | "human_hint" | "decision_trace";

export type EvidenceBoardItem = {
  id: string;
  kind: EvidenceKind;
  summary: string;
  source: string;
  confidence: number;
  raw: Record<string, unknown>;
};

export type EvidenceBoard = {
  items: EvidenceBoardItem[];
};

export function createEvidenceBoard(items: EvidenceBoardItem[] = []): EvidenceBoard {
  return {items: dedupeEvidence(items)};
}

export function addEvidenceItem(board: EvidenceBoard, item: EvidenceBoardItem): EvidenceBoard {
  return createEvidenceBoard([...board.items, item]);
}

export function evidenceItemFromFinding(input: {
  summary: string;
  source: string;
  raw: Record<string, unknown>;
  kind?: EvidenceKind;
  confidence?: number;
}): EvidenceBoardItem {
  return {
    id: createEvidenceId(input.kind ?? "fact", input.source, input.summary),
    kind: input.kind ?? "fact",
    summary: input.summary,
    source: input.source,
    confidence: input.confidence ?? 0.8,
    raw: input.raw,
  };
}

function dedupeEvidence(items: EvidenceBoardItem[]): EvidenceBoardItem[] {
  const seen = new Set<string>();
  const deduped: EvidenceBoardItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

function createEvidenceId(kind: EvidenceKind, source: string, summary: string): string {
  return Buffer.from(`${kind}:${source}:${summary}`).toString("base64url").slice(0, 24);
}
