function randomInt(min: number, max: number): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

export type MockScenario = "default" | "error-in-templates";

export function getMockScenario(): MockScenario {
  const raw = String(import.meta.env.VITE_MOCK_SCENARIO ?? "default")
    .trim()
    .toLowerCase();
  if (raw === "error-in-templates") {
    return "error-in-templates";
  }
  return "default";
}

export async function delay(minMs: number, maxMs: number): Promise<void> {
  const timeout = randomInt(minMs, maxMs);
  await new Promise(resolve => setTimeout(resolve, timeout));
}

export function withNetworkDelay(): Promise<void> {
  return delay(1, 50);
}
