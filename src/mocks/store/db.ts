import { buildSeedState, type MockSeedState } from "../data/seed";
import { deepClone } from "../utils/clone";
import type { DocumentValidationStatus, DocumentType } from "../../types";

export type InfographicsPollState = {
  attempts: number;
  readyAfter: number;
  startedAt: string;
  updatedAt: string;
};

export type DocumentValidationMockState = {
  documentId: string;
  projectId?: string | null;
  type?: DocumentType | null;
  finalStatus: Exclude<DocumentValidationStatus["status"], "pending">;
  summary?: string | null;
  errors: string[];
  warnings: string[];
  forwardedToReader: boolean;
  pendingChecksRemaining: number;
  validatedAt?: string | null;
  updatedAt: string;
  cleanupApplied: boolean;
};

export type MockDbState = MockSeedState & {
  infographicsPollByOrderAndYear: Record<string, InfographicsPollState>;
  documentValidationById: Record<string, DocumentValidationMockState>;
};

function createInitialState(): MockDbState {
  const seed = deepClone(buildSeedState());
  return {
    ...seed,
    infographicsPollByOrderAndYear: {},
    documentValidationById: {},
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
