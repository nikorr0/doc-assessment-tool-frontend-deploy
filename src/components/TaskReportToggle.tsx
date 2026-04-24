import type { CSSProperties } from "react";

const INFO_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  borderRadius: "50%",
  width: 22,
  height: 22,
  padding: 0,
  color: "#475569",
  background: "#f8fafc",
  cursor: "pointer",
};

const PANEL_INNER_STYLE: CSSProperties = {
  padding: "8px 12px",
  borderLeft: "3px solid #6366f1",
  color: "#1e293b",
  fontSize: 13,
};

function InfoCircleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

type TaskTextWithReportToggleProps = {
  taskText?: string | null;
  reportText?: string | null;
  annotationText?: string | null;
  expanded: boolean;
  onToggle: () => void;
};

/** Текст задачи и круглая кнопка с иконкой info, если есть непустой отчет */
export function TaskTextWithReportToggle({
  taskText,
  reportText,
  annotationText,
  expanded,
  onToggle,
}: TaskTextWithReportToggleProps) {
  const trimmedReport = (reportText ?? "").trim();
  const trimmedAnnotation = (annotationText ?? "").trim();
  const hasContent = trimmedReport.length > 0 || trimmedAnnotation.length > 0;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span>{taskText || "—"}</span>
      {hasContent && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Скрыть отчёт по задаче" : "Показать отчёт по задаче"}
          aria-expanded={expanded}
          title={expanded ? "Скрыть отчёт" : "Показать отчёт"}
          style={INFO_BUTTON_STYLE}
        >
          <InfoCircleIcon />
        </button>
      )}
    </div>
  );
}

type TaskReportPanelRowProps = {
  reportText?: string | null;
  annotationText?: string | null;
  colSpan: number;
};

/** Вторая строка таблицы с данными отчета и пояснения из акта */
export function TaskReportPanelRow({
  reportText,
  annotationText,
  colSpan,
}: TaskReportPanelRowProps) {
  const rows = [
    { label: "Отчет", value: (reportText ?? "").trim() },
    { label: "Пояснение", value: (annotationText ?? "").trim() },
  ].filter(row => row.value.length > 0);

  return (
    <tr>
      <td colSpan={colSpan} style={{ background: "#f8fafc" }}>
        <div style={PANEL_INNER_STYLE}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <td
                    style={{
                      width: 110,
                      fontWeight: 600,
                      color: "#334155",
                      verticalAlign: "top",
                    }}
                  >
                    {row.label}
                  </td>
                  <td style={{ whiteSpace: "pre-wrap", color: "#0f172a" }}>
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}
