import type { HostState, Status } from "../src/types";

export interface ResourceThreshold {
  label: string;
  warning: number;
  critical: number;
}

export const resourceThresholds: Readonly<Record<"cpuPercent" | "memoryPercent" | "diskPercent", Readonly<ResourceThreshold>>>;
export function httpSignalStatus(host: Partial<HostState>): Status;
export function sshSignalStatus(host: Partial<HostState>): Status;
export function runtimeSignalStatus(host: Partial<HostState>): Status;
export function resourceSignalStatus(host: Partial<HostState>): Status;
export function resourceSignalSummary(host: Partial<HostState>): string;
export function classifyCollectedStatus(httpStatus: Status, collected: Partial<HostState>): Status;
