import type { DashboardStatus, HostState } from "./types";

export type EvidenceReadinessState = "offline" | "combined" | "http" | "ssh-only" | "ssh-disabled" | "missing";

export interface EvidenceReadiness {
  state: EvidenceReadinessState;
  canCollect: boolean;
  label: string;
  detail: string;
  actionLabel: string;
}

export function evidenceReadiness(dashboard: DashboardStatus, host: HostState | null | undefined): EvidenceReadiness;
