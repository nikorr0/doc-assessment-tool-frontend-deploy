import type { TaskRecord } from "../../types";

/** Пары: единица в приказе → единица в акте (мягкое предупреждение). */
export const UNITS_WARNING_PAIRS = [
  { order: "2 документа", act: "1 документ", similarity: 72 },
  { order: "30 проб", act: "10 проб", similarity: 68 },
  { order: "4 мероприятия", act: "2 мероприятия", similarity: 70 },
  { order: "12 публикаций", act: "8 публикаций", similarity: 74 },
  { order: "6 докладов", act: "4 доклада", similarity: 71 },
  { order: "20 часов", act: "15 часов", similarity: 76 },
  { order: "5 отчётов", act: "3 отчёта", similarity: 69 },
  { order: "100 показателей", act: "85 показателей", similarity: 73 },
] as const;

const NORMAL_UNITS = [
  "публикация",
  "доклад",
  "мероприятие",
  "исследование",
  "1 отчёт",
  "15 часов",
] as const;

export type MockTaskUnitsFields = Pick<
  TaskRecord,
  "units" | "actUnits" | "unitsWarning" | "unitsBlocked" | "unitsSimilarityPercent"
>;

/** Каждая 3-я задача — мягкое предупреждение; каждая 15-я — жёсткая блокировка. */
export function resolveMockTaskUnits(taskIndex: number): MockTaskUnitsFields {
  const pair = UNITS_WARNING_PAIRS[taskIndex % UNITS_WARNING_PAIRS.length];

  if (taskIndex > 0 && taskIndex % 15 === 0) {
    return {
      units: pair.order,
      actUnits: "иная единица измерения",
      unitsWarning: true,
      unitsBlocked: true,
      unitsSimilarityPercent: 18,
    };
  }

  if (taskIndex % 3 === 0) {
    return {
      units: pair.order,
      actUnits: pair.act,
      unitsWarning: true,
      unitsBlocked: false,
      unitsSimilarityPercent: pair.similarity,
    };
  }

  const normal = NORMAL_UNITS[taskIndex % NORMAL_UNITS.length];
  return {
    units: normal,
    actUnits: normal,
    unitsWarning: false,
    unitsBlocked: false,
    unitsSimilarityPercent: null,
  };
}
