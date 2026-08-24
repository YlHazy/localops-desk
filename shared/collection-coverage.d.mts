export type CollectionPlanState = "offline" | "combined" | "http" | "ssh-only" | "ssh-disabled" | "missing";

export interface CollectionPlan {
  state: CollectionPlanState;
  canCollect: boolean;
}

export interface CollectionCoverage {
  total: number;
  collectible: number;
  blocked: number;
  complete: number;
  partial: number;
  counts: Record<CollectionPlanState, number>;
}

export function hostCollectionPlan(mode: "safe-simulated" | "ssh-enabled", host: unknown, options?: { practiceMode?: boolean }): CollectionPlan;
export function collectionCoverage(mode: "safe-simulated" | "ssh-enabled", hosts?: unknown[], options?: { practiceMode?: boolean }): CollectionCoverage;
