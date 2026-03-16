const counters = new Map<string, number>();

export function nextId(prefix: string): string {
  const current = counters.get(prefix) ?? 0;
  const next = current + 1;
  counters.set(prefix, next);
  const randomPart = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now()}-${next}-${randomPart}`;
}
