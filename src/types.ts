import type { CollectionCoverage } from "../shared/collection-coverage.mjs";

export type Status = "healthy" | "warning" | "critical" | "unknown";

export interface HostState {
  id: string;
  name: string;
  environment: string;
  role: string;
  sshAlias: string;
  healthUrl: string;
  composeProject: string;
  tags: string[];
  isOfflineDemo: boolean;
  status: Status;
  lastCheckedAt: string | null;
  durationMs: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  httpStatus: string;
  httpLatencyMs: number | null;
  sshStatus: string;
  dockerStatus: string;
  summary: string;
  evidence: string[];
}

export interface HostConfigInput {
  id?: string;
  name: string;
  environment: string;
  role: string;
  sshAlias: string;
  healthUrl: string;
  composeProject: string;
  tags: string[];
}

export interface DashboardStatus {
  generatedAt: string;
  observedAt: string | null;
  staleAfterMs: number;
  mode: "safe-simulated" | "ssh-enabled";
  practiceMode: boolean;
  counts: Record<Status, number>;
  hosts: HostState[];
}

export interface CheckRun {
  id: number;
  kind: string;
  trigger: string;
  hostScope: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  overallStatus: Status;
  summary: string;
}

export interface SchedulerState {
  enabled: boolean;
  lightIntervalMinutes: number;
  retentionDays: number;
  consecutiveFailures: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastOutcome: "never" | "succeeded" | "recovered" | "maintenance-warning" | "failed" | "deferred" | "stopped-no-evidence";
  lastEventAt: string | null;
  lastMessage: string;
  lastErrorCode: string | null;
  lastDurationMs: number | null;
  lastCheckedHosts: number;
  lastSkippedHosts: number;
  coverage: CollectionCoverage;
}

export interface StartupState {
  supported: boolean;
  enabled: boolean;
  status: "unsupported" | "not-installed" | "managed" | "conflict";
  ready: boolean;
  blockers: string[];
  message: string;
}

export interface RetentionResult {
  retentionDays: number;
  cutoff: string;
  deletedRuns: number;
  deletedHostChecks: number;
  deletedOrphanHostChecks: number;
  vacuumed: boolean;
  sizeBytes: number;
}

export interface DryRunAction {
  actionKey: string;
  riskTier: "read-only" | "low" | "medium" | "high";
  title: string;
  executionState: "read-only-ready" | "blocked-template";
  copyAllowed: boolean;
  safetyBoundary: string;
  commands: string[];
  verification: string[];
  blockedReason?: string;
}
