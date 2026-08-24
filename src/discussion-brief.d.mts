import type { DashboardStatus, HostState } from "./types";

export function discussionBrief(dashboard: DashboardStatus, host: HostState, now?: number): string;
export function codexDiscussionLink(brief: string): string;
export function httpSignalStatus(host: HostState): import("./types").Status;
export function sshSignalStatus(host: HostState): import("./types").Status;
export function runtimeSignalStatus(host: HostState): import("./types").Status;
export function resourceSignalStatus(host: HostState): import("./types").Status;
