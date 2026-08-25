const supportedOperations = new Set(["check", "diagnosis", "scheduler", "retention", "action", "host-save", "host-delete"]);

export function operationUiState(pendingOperation) {
  if (pendingOperation != null && !supportedOperations.has(pendingOperation)) {
    throw new Error(`Unsupported pending operation: ${pendingOperation}`);
  }
  return {
    busy: pendingOperation != null,
    checking: pendingOperation === "check",
    diagnosing: pendingOperation === "diagnosis",
    savingScheduler: pendingOperation === "scheduler",
    retaining: pendingOperation === "retention",
    preparingAction: pendingOperation === "action",
    savingHost: pendingOperation === "host-save",
    deletingHost: pendingOperation === "host-delete"
  };
}
