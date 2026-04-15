import { useMemo, useState } from "react";
import type { ValidationIssue } from "../types";
import { getValidationIssueLevelLabel } from "../utils/validationIssues";
import { exportValidationIssuesToExcel } from "../utils/validationIssuesExport";

type Props = {
  tone: "warning" | "error";
  title: string;
  issues: ValidationIssue[];
  exportFileNamePrefix?: string;
  onClose: () => void;
};

export default function ValidationIssuesModal({
  tone,
  title,
  issues,
  exportFileNamePrefix,
  onClose,
}: Props) {
  const [exporting, setExporting] = useState(false);
  const rows = useMemo(
    () =>
      issues.map((issue) => ({
        ...issue,
        levelLabel: getValidationIssueLevelLabel(issue.level),
      })),
    [issues],
  );

  async function handleExport() {
    setExporting(true);
    try {
      await exportValidationIssuesToExcel(issues, {
        fileNamePrefix: exportFileNamePrefix,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content validation-modal validation-modal--${tone}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{title}</h3>
        <ul className="validation-issues-list">
          {rows.map((issue) => (
            <li key={`${issue.index}-${issue.levelLabel}-${issue.message}`}>
              {issue.index}. {issue.levelLabel}: {issue.position !== "-" ? `${issue.position}: ` : ""}
              {issue.message}
              {issue.rowContext !== "-" ? ` | Контекст: ${issue.rowContext}` : ""}
              {issue.errorCell !== "-" ? ` | Ячейка с ошибкой: ${issue.errorCell}` : ""}
            </li>
          ))}
        </ul>
        <div className="validation-modal-actions">
          <button
            type="button"
            className="validation-action-button validation-action-button--excel"
            onClick={handleExport}
            disabled={exporting || issues.length === 0}
          >
            Экспорт в Excel
          </button>
          <button
            type="button"
            className="validation-action-button validation-action-button--close"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
