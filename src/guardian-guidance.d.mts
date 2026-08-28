import type { HostState } from "./types";

export interface HostGuidance {
  title: string;
  reason: string;
  detail: string;
  avoid: string;
}

export function hostGuidance(host: HostState, fresh?: boolean): HostGuidance;
