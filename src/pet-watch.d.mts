import type { MonitorNotice, MonitorSignal } from "./pet-monitor.mjs";
export const petQuietDurationMs: number;
export type NotificationDecision = { outcome: "none" | "sent" | "suppressed"; notice: MonitorNotice | null };
export function notificationDecision(previous: MonitorSignal | null, current: MonitorSignal, options: { enabled: boolean; permission: NotificationPermission; quietUntil?: number; now?: number }): NotificationDecision;
export function watchModeCopy(options: { supported: boolean; blocked: boolean; enabled: boolean; permissionSurface?: "browser" | "windows"; quietUntil?: number; now?: number }): { label: string; detail: string; state: "unsupported" | "blocked" | "off" | "quiet" | "active" };
export function readQuietUntil(storage: Pick<Storage, "getItem">, now?: number): number;
export function writeQuietUntil(storage: Pick<Storage, "setItem" | "removeItem">, value: number): boolean;
