import type { DashboardStatus } from "./types";

export interface MonitorSignal {
  level: "healthy" | "unknown" | "warning" | "critical" | "offline";
  score: number;
  critical: number;
  warning: number;
  unknown: number;
}

export interface MonitorNotice {
  title: string;
  body: string;
}

export function monitorSignal(dashboard: DashboardStatus, offline?: boolean): MonitorSignal;
export function worseningNotice(previous: MonitorSignal | null, current: MonitorSignal): MonitorNotice | null;
