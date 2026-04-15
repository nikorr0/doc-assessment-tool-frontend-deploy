import type {
  DocumentValidationStatus,
  ValidationIssue,
  ValidationIssueLevel,
} from "../types";

const EMPTY_VALUE = "-";

function normalizeWhitespace(value: string): string {
  return value.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeIssueMessage(raw: string, level: ValidationIssueLevel): string {
  const normalized = normalizeWhitespace(raw);
  if (!normalized) {
    return level === "error"
      ? "Обнаружена ошибка в документе. Проверьте данные и повторите загрузку."
      : "Найдена неточность в документе. Проверьте данные перед использованием.";
  }

  const lower = normalized.toLowerCase();
  if (lower.includes("timeout")) {
    return "Проверка документа заняла больше времени, чем обычно. Попробуйте повторить действие чуть позже.";
  }
  if (
    lower.includes("traceback") ||
    lower.includes("exception") ||
    lower.includes("invalid json") ||
    lower.includes("json decode")
  ) {
    return "Во время обработки возникла внутренняя техническая ошибка. Обратитесь к администратору системы.";
  }

  return normalized;
}

function isContextContinuationChunk(text: string): boolean {
  return /^(Контекст строки:|ФИО:|Поручение:|Задача:|Срок:|Дата:|Ячейка)/i.test(text);
}

function isIssueStartChunk(text: string): boolean {
  return /^(Таблица\s+\d+|Группа\s+\d+|В документе|Документ|Не удалось|Отсутств|Найдены|Непредвиденная|Во время|Проверка)/i.test(text);
}

function mergeIssueChunks(values: string[] | undefined): string[] {
  const merged: string[] = [];
  for (const value of values ?? []) {
    const normalized = normalizeWhitespace(String(value ?? ""));
    if (!normalized) {
      continue;
    }
    if (merged.length === 0) {
      merged.push(normalized);
      continue;
    }

    const lastIndex = merged.length - 1;
    const lastValue = merged[lastIndex];
    const hasOpenRowContext = /контекст строки:/i.test(lastValue);

    if (isContextContinuationChunk(normalized) || (hasOpenRowContext && !isIssueStartChunk(normalized))) {
      merged[lastIndex] = `${lastValue}; ${normalized}`;
      continue;
    }

    merged.push(normalized);
  }
  return merged;
}

function stripTrailingPunctuation(value: string): string {
  return value.trim().replace(/[.;:\s]+$/g, "");
}

function extractContextToken(
  tokens: string[],
  pattern: RegExp,
): string | null {
  return tokens.find((token) => pattern.test(token)) ?? null;
}

function buildUnifiedMessage(
  description: string,
): string {
  const normalizedDescription = stripTrailingPunctuation(description);
  return normalizedDescription || "Обнаружена проблема в документе";
}

function parseIssueDetails(
  rawMessage: string,
  level: ValidationIssueLevel,
): Omit<ValidationIssue, "index" | "level"> {
  let message = normalizeIssueMessage(rawMessage, level);
  let position = EMPTY_VALUE;

  const positionMatch = message.match(
    /^(Таблица\s+\d+\s*,\s*строка\s+\d+|Таблица\s+\d+|Группа\s+\d+)\s*:\s*(.*)$/i,
  );
  if (positionMatch) {
    position = normalizeWhitespace(positionMatch[1]);
    message = normalizeWhitespace(positionMatch[2]);
  }

  let description = message;
  let contextRaw = "";
  const contextLabel = "контекст строки:";
  const contextIndex = message.toLowerCase().indexOf(contextLabel);
  if (contextIndex >= 0) {
    description = normalizeWhitespace(message.slice(0, contextIndex));
    contextRaw = normalizeWhitespace(message.slice(contextIndex + contextLabel.length));
  }

  const contextTokens = contextRaw
    ? contextRaw.split(/\s*;\s*/).map((token) => normalizeWhitespace(token)).filter(Boolean)
    : [];

  const fullNameToken = extractContextToken(contextTokens, /^ФИО\s*:/i);
  const taskToken = extractContextToken(contextTokens, /^(Поручение|Задача)\s*:/i);
  const deadlineToken = extractContextToken(contextTokens, /^(Срок|Дата)\s*:/i);
  const explicitCellToken = extractContextToken(contextTokens, /^Ячейка/i);

  const rowContextParts = [fullNameToken, taskToken].filter(
    (token): token is string => Boolean(token),
  );
  const rowContext = rowContextParts.length > 0 ? rowContextParts.join("; ") : EMPTY_VALUE;

  let errorCell = EMPTY_VALUE;
  if (explicitCellToken) {
    errorCell = explicitCellToken;
  } else {
    const descriptionLower = description.toLowerCase();
    if ((descriptionLower.includes("срок") || descriptionLower.includes("дат")) && deadlineToken) {
      errorCell = deadlineToken;
    } else if (descriptionLower.includes("фио") && fullNameToken) {
      errorCell = fullNameToken;
    } else if ((descriptionLower.includes("поруч") || descriptionLower.includes("задач")) && taskToken) {
      errorCell = taskToken;
    }
  }

  const unifiedMessage = buildUnifiedMessage(description);
  return {
    message: unifiedMessage,
    position,
    rowContext,
    errorCell,
  };
}

function appendIssues(
  issues: ValidationIssue[],
  values: string[] | undefined,
  level: ValidationIssueLevel,
): void {
  for (const value of mergeIssueChunks(values)) {
    const details = parseIssueDetails(String(value ?? ""), level);
    issues.push({
      index: issues.length + 1,
      level,
      ...details,
    });
  }
}

export function toValidationIssues(
  validation: DocumentValidationStatus,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  appendIssues(issues, validation.errors, "error");
  appendIssues(issues, validation.warnings, "warning");

  if (issues.length > 0) {
    return issues;
  }

  const summary = normalizeIssueMessage(String(validation.summary ?? ""), "warning");
  if ((validation.status === "error" || validation.status === "warning") && summary) {
    const details = parseIssueDetails(
      summary,
      validation.status === "error" ? "error" : "warning",
    );
    return [
      {
        index: 1,
        level: validation.status === "error" ? "error" : "warning",
        ...details,
      },
    ];
  }

  return [];
}

export function getValidationIssueLevelLabel(level: ValidationIssueLevel): string {
  return level === "error" ? "Ошибка" : "Предупреждение";
}

export function toValidationIssueRows(
  issues: ValidationIssue[],
): Array<{
  index: number;
  level: string;
  position: string;
  rowContext: string;
  errorCell: string;
  message: string;
}> {
  return issues.map((issue) => ({
    index: issue.index,
    level: getValidationIssueLevelLabel(issue.level),
    position: issue.position,
    rowContext: issue.rowContext,
    errorCell: issue.errorCell,
    message: issue.message,
  }));
}
