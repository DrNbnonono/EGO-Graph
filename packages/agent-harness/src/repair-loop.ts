export const maxRepairAttempts = 2;

export function canAttemptRepair(repairAttempts: number): boolean {
  return repairAttempts < maxRepairAttempts;
}
