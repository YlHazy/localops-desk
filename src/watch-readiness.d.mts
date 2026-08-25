import type { CollectionCoverage } from "../shared/collection-coverage.mjs";

export type WatchReadinessItem = {
  key: "evidence" | "rhythm" | "attention";
  label: string;
  ready: boolean;
  tone: "ready" | "attention" | "blocked" | "waiting" | "preview";
  detail: string;
  actionLabel: string;
};

export function watchReadiness(options: {
  coverage: CollectionCoverage;
  schedulerEnabled: boolean;
  desktopRuntime: boolean;
  notificationsEnabled: boolean;
  notificationsCalibrated: boolean;
}): {
  readyCount: number;
  total: number;
  complete: boolean;
  headline: string;
  detail: string;
  items: WatchReadinessItem[];
};
