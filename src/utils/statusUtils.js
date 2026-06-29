export const LOCKED_STATUSES = ['Pending MID', 'Active', 'Active (Existing)'];

export function isLocked(mid) {
  return LOCKED_STATUSES.includes(mid?.applicationStepStatus);
}

export function isImported(mid) {
  return mid?.isExistingAccount === true;
}