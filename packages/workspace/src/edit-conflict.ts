export type EditConflict = {
  path: string;
  operation: string;
  reason: string;
};

export class EditConflictError extends Error {
  readonly conflicts: EditConflict[];

  constructor(conflicts: EditConflict[]) {
    super(conflicts.map((conflict) => `${conflict.path}: ${conflict.reason}`).join("; "));
    this.name = "EditConflictError";
    this.conflicts = conflicts;
  }
}

export function assertNoEditConflicts(conflicts: EditConflict[]): void {
  if (conflicts.length > 0) {
    throw new EditConflictError(conflicts);
  }
}
