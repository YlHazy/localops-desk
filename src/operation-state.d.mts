export type PendingOperation = "check" | "diagnosis" | "scheduler" | "retention" | "action" | "action-prepare" | "action-execute" | "host-save" | "host-delete" | null;

export function operationUiState(pendingOperation: PendingOperation): {
  busy: boolean;
  checking: boolean;
  diagnosing: boolean;
  savingScheduler: boolean;
  retaining: boolean;
  preparingAction: boolean;
  preparingApproval: boolean;
  executingAction: boolean;
  savingHost: boolean;
  deletingHost: boolean;
};
