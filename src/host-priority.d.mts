import type { Status } from "./types";

export interface PrioritizableHost {
  id: string;
  name: string;
  status: Status;
}

export function prioritizeHosts<T extends PrioritizableHost>(hosts: readonly T[]): T[];
export function selectFocusHost<T extends PrioritizableHost>(prioritizedHosts: readonly T[], selectedHostId: string | null): T | null;
export function selectVisibleHost<T extends PrioritizableHost>(prioritizedHosts: readonly T[], selectedHostId: string | null, limit?: number): { visibleHosts: T[]; selectedHost: T | null };
export function retainFocusSelection<T extends Pick<PrioritizableHost, "id">>(hosts: readonly T[], selectedHostId: string | null): string | null;
export function manualFocusSelection<T extends Pick<PrioritizableHost, "id">>(prioritizedHosts: readonly T[], targetHostId: string | null): string | null;
