export type PendingOperation = "check" | "scheduler" | "retention" | "action" | "host-save" | "host-delete" | null;

export function operationUiState(pendingOperation: PendingOperation): {
  busy: boolean;
  checking: boolean;
  savingScheduler: boolean;
  retaining: boolean;
  preparingAction: boolean;
  savingHost: boolean;
  deletingHost: boolean;
};
