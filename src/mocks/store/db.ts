import { buildSeedState, type MockSeedState } from "../data/seed";
import { deepClone } from "../utils/clone";

export type InfographicsPollState = {
  attempts: number;
  readyAfter: number;
  startedAt: string;
  updatedAt: string;
};

export type MockDbState = MockSeedState & {
  infographicsPollByOrderAndYear: Record<string, InfographicsPollState>;
};

function createInitialState(): MockDbState {
  const seed = deepClone(buildSeedState());
  return {
    ...seed,
    infographicsPollByOrderAndYear: {},
  };
}

let state: MockDbState = createInitialState();

export function getDb(): MockDbState {
  return state;
}

export function resetDb(): void {
  state = createInitialState();
}

export function getOrderYearKey(orderId: string, year: number): string {
  return `${orderId}::${year}`;
}
