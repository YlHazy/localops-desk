export type DeskSyncState = "idle" | "syncing" | "current" | "offline";

export interface DeskSyncCopy {
  label: string;
  detail: string;
}

export interface SchedulerDraft {
  enabled: boolean;
  lightIntervalMinutes: number;
  retentionDays: number;
}

export interface DeskSnapshot {
  status: import("./types").DashboardStatus;
  checks: import("./types").CheckRun[];
  report: string;
  scheduler: import("./types").SchedulerState;
  startup: import("./types").StartupState;
}

export interface CollectionModeCopy {
  label: string;
  detail: string;
  compact: string;
}

export type DeskReadRequest = <T>(path: string) => Promise<T>;

export function deskSyncCopy(state: DeskSyncState, lastSyncedAt: number | null, now?: number): DeskSyncCopy;
export function fetchDeskSnapshot(request: DeskReadRequest): Promise<DeskSnapshot>;
export function fetchPetSnapshot(request: DeskReadRequest): Promise<import("./types").DashboardStatus>;
export function collectionModeCopy(dashboard: import("./types").DashboardStatus): CollectionModeCopy;
export function trustworthyDashboard(dashboard: import("./types").DashboardStatus, now?: number): import("./types").DashboardStatus;
export function schedulerDraftAfterSync(currentDraft: SchedulerDraft, scheduler: import("./types").SchedulerState, preserveDraft: boolean): SchedulerDraft;
