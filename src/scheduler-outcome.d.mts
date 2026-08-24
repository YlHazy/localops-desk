import type { SchedulerState, Status } from "./types";

export interface SchedulerOutcomeCopy {
  tone: Status;
  label: string;
  title: string;
  detail: string;
  action: "none" | "run-now" | "configure-hosts";
}

export function schedulerOutcomeCopy(scheduler: SchedulerState | null | undefined): SchedulerOutcomeCopy;
