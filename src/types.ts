export type Status = "healthy" | "warning" | "critical" | "unknown";

export interface HostState {
  id: string;
  name: string;
  environment: string;
  role: string;
  sshAlias: string;
  healthUrl: string;
  composeProject: string;
  status: Status;
  lastCheckedAt: string | null;
  durationMs: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  httpStatus: string;
  sshStatus: string;
  dockerStatus: string;
  summary: string;
  evidence: string[];
}

export interface DashboardStatus {
  generatedAt: string;
  mode: "safe-simulated" | "ssh-enabled";
  counts: Record<Status, number>;
  hosts: HostState[];
}

export interface CheckRun {
  id: number;
  kind: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  overallStatus: Status;
  summary: string;
}

export interface DryRunAction {
  actionKey: string;
  riskTier: "read-only" | "low" | "medium" | "high";
  title: string;
  commands: string[];
  verification: string[];
  blockedReason?: string;
}

