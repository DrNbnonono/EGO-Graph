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

/**
 * A minimal view of a patch operation that the cross-operation detector
 * needs. Decoupled from the full PatchOperation union so this helper can live
 * in the conflict module without importing patch-engine (avoids a cycle).
 */
export type CrossConflictOperation = {
  type: string;
  path: string;
  newPath?: string;
};

/**
 * Detect conflicts that only emerge when looking at the operation list as a
 * whole, not one operation at a time:
 *
 *  - Two operations editing the same path (risk: clobbering / order-dependent
 *    results). Multiple replace_text hits against the same file are tolerated
 *    because they are a legitimate way to make several distinct edits.
 *  - A delete_file targeting a path that another operation edits or creates.
 *  - A rename/move whose newPath collides with a path another operation
 *    writes to.
 *
 * Returns conflicts in the same EditConflict shape so they flow through the
 * existing preview/conflict pipeline without special-casing.
 */
export function detectCrossOperationConflicts(
  operations: CrossConflictOperation[],
): EditConflict[] {
  const conflicts: EditConflict[] = [];

  // Localized edits mutate part of a file and compose safely when applied in
  // order. Whole-file operations replace/create/delete the entire file and
  // conflict with each other or with localized edits on the same path.
  const isLocalized = (type: string): boolean =>
    type === "replace_text" ||
    type === "delete_text" ||
    type === "insert_after" ||
    type === "insert_before";

  // Group by the path each operation ultimately writes to. rename/move key
  // on their target newPath; everything else keys on the source path.
  const byPath = new Map<string, CrossConflictOperation[]>();
  for (const operation of operations) {
    const key = operation.type === "rename_file" || operation.type === "move_file"
      ? operation.newPath ?? operation.path
      : operation.path;
    const bucket = byPath.get(key);
    if (bucket) {
      bucket.push(operation);
    } else {
      byPath.set(key, [operation]);
    }
  }

  for (const [path, bucket] of byPath) {
    if (bucket.length <= 1) {
      continue;
    }
    const wholeFileOps = bucket.filter((op) => !isLocalized(op.type));
    // Two or more whole-file ops on the same path clobber each other.
    if (wholeFileOps.length >= 2) {
      conflicts.push({
        path,
        operation: wholeFileOps.map((op) => op.type).join("+"),
        reason: `Multiple whole-file operations target the same path (${wholeFileOps.length}); merge them.`,
      });
      continue;
    }
    // A single whole-file op combined with localized edits on the same path:
    // the whole-file write would overwrite the localized edits' results.
    if (wholeFileOps.length === 1 && bucket.some((op) => isLocalized(op.type))) {
      conflicts.push({
        path,
        operation: bucket.map((op) => op.type).join("+"),
        reason: "A whole-file operation conflicts with localized edits on the same path.",
      });
    }
    // Pure localized edits (insert/replace_text/delete_text) compose safely.
  }

  // delete_file vs edits/creates of the same path.
  const deletedPaths = new Set(
    operations.filter((op) => op.type === "delete_file").map((op) => op.path),
  );
  for (const operation of operations) {
    if (operation.type === "delete_file") {
      continue;
    }
    if (deletedPaths.has(operation.path)) {
      conflicts.push({
        path: operation.path,
        operation: operation.type,
        reason: "Path is both edited and deleted in the same patch.",
      });
    }
  }

  // rename/move target collision with another write.
  const writtenPaths = new Set(operations.map((op) => op.path));
  for (const operation of operations) {
    if ((operation.type === "rename_file" || operation.type === "move_file") && operation.newPath) {
      if (writtenPaths.has(operation.newPath) && operation.newPath !== operation.path) {
        conflicts.push({
          path: operation.newPath,
          operation: operation.type,
          reason: "Rename/move target collides with another operation's path.",
        });
      }
    }
  }

  return conflicts;
}
