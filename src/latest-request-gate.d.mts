export interface LatestRequestGate {
  begin(): number;
  isLatest(token: number): boolean;
  invalidate(): void;
}

export function createLatestRequestGate(): LatestRequestGate;
export function resolveLatestRequest<T>(
  gate: LatestRequestGate,
  token: number,
  request: Promise<T>
): Promise<{ current: true; value: T } | { current: false }>;
