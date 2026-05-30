import type { OrganizationalRiskItem } from "../types";

type Props = {
  loading: boolean;
  error: string | null;
  risks: OrganizationalRiskItem[];
  levelFilter: "all" | "high" | "medium" | "low";
  onLevelFilterChange: (value: "all" | "high" | "medium" | "low") => void;
};

type RiskLevel = "high" | "medium" | "low";

const LEVEL_ORDER: RiskLevel[] = ["high", "medium", "low"];
const UNCHECKED_COMPLETED_RISK_MESSAGE = "Большинство выполненных задач не имеют профессиональной проверки.";

const LEVEL_LABELS: Record<RiskLevel, string> = {
  high: "Высокий риск",
  medium: "Средний риск",
  low: "Низкий риск",
};

function formatMetricValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  const text = String(value).trim();
  return text || "—";
}

export default function DashboardRisksTab({
  loading,
  error,
  risks,
  levelFilter,
  onLevelFilterChange,
}: Props) {
  if (loading) {
    return (
      <div className="card dashboard-risks-card">
        <h3 style={{ marginTop: 0 }}>Организационные риски</h3>
        <div>Загрузка рисков...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card dashboard-risks-card">
        <h3 style={{ marginTop: 0 }}>Организационные риски</h3>
        <div style={{ color: "crimson" }}>{error}</div>
      </div>
    );
  }

  const visibleRisks = levelFilter === "all" ? risks : risks.filter(risk => risk.level === levelFilter);
  const orderedRisks = [...visibleRisks].sort((left, right) => {
    const leftOrder = LEVEL_ORDER.indexOf(left.level as RiskLevel);
    const rightOrder = LEVEL_ORDER.indexOf(right.level as RiskLevel);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return (left.groupName || "").localeCompare(right.groupName || "", "ru");
  });
  return (
    <div className="dashboard-risks-panel">
      <div className="card dashboard-risks-card">
        <h3 style={{ marginTop: 0 }}>Организационные риски</h3>
        <div className="tasks-filters dashboard-risks-filters">
          <label className="form-field">
            <span className="form-field-label">Уровень риска</span>
            <select
              className="form-control"
              value={levelFilter}
              onChange={(event) =>
                onLevelFilterChange(event.target.value as "all" | "high" | "medium" | "low")
              }
            >
              <option value="all">Все риски</option>
              <option value="high">Высокий</option>
              <option value="medium">Средний</option>
              <option value="low">Низкий</option>
            </select>
          </label>
        </div>

        {visibleRisks.length === 0 ? (
          <div className="empty-state">
            {risks.length === 0
              ? "Риски по текущим фильтрам не найдены."
              : "По выбранному уровню рисков данных нет."}
          </div>
        ) : (
          <div className="dashboard-risks-list dashboard-risks-list--scroll">
            {orderedRisks.map((risk, index) => {
              const attributes: Array<{
                label: string;
                riskValue: string;
                actValue?: string;
                wide?: boolean;
              }> = [
                {
                  label: "Группа",
                  riskValue: risk.groupName || "—",
                  actValue: "—",
                },
                {
                  label: "Квартал",
                  riskValue: risk.quarter ? String(risk.quarter) : "—",
                  actValue: "—",
                },
              ];

              if (risk.taskText) {
                attributes.push({
                  label: "Задача",
                  riskValue: risk.taskText,
                  actValue: "—",
                  wide: true,
                });
              }
              if (risk.fullName) {
                attributes.push({
                  label: "Исполнитель",
                  riskValue: risk.fullName,
                  actValue: "—",
                });
              }
              if (risk.metrics && Object.keys(risk.metrics).length > 0) {
                const metricKeysToExclude = new Set<string>();
                if ((risk.message || "").trim() === UNCHECKED_COMPLETED_RISK_MESSAGE) {
                  metricKeysToExclude.add("completionRate");
                  metricKeysToExclude.add("uncheckedCompletedPercent");
                }
                Object.entries(risk.metrics)
                  .filter(([key]) => key !== "ratioToMedian")
                  .filter(([key]) => !metricKeysToExclude.has(key))
                  .forEach(([key, value]) => {
                    attributes.push({
                      label: key
                        .replace("completionRate", "Процент выполнения")
                        .replace("completed", "Выполнено")
                        .replace("total", "Всего задач")
                        .replace("daysToQuarterEnd", "Дней до конца квартала")
                        .replace("uncheckedCompletedPercent", "Не проверено, %")
                        .replace("uncheckedCompleted", "Не проверено")
                        .replace("personTasks", "Задач у исполнителя")
                        .replace("groupMedianTasks", "Медиана по группе"),
                      riskValue: formatMetricValue(value),
                      actValue: "—",
                    });
                  });
              }

              const hasActColumn = attributes.some((row) => {
                const value = (row.actValue ?? "").trim();
                return value !== "" && value !== "—";
              });

              return (
                <article
                  key={`${risk.type}-${risk.groupId ?? "nogroup"}-${risk.taskId ?? "notask"}-${index}`}
                  className={`dashboard-risk-item dashboard-risk-item--${risk.level}`}
                >
                  <div className="dashboard-risk-item-header">
                    <span className={`dashboard-risk-badge dashboard-risk-badge--${risk.level}`}>
                      {LEVEL_LABELS[risk.level as RiskLevel]}
                    </span>
                  </div>
                  <p className="dashboard-risk-message">{risk.message}</p>
                  <div className="status-history-card__table-wrap">
                    <table className={`status-history-table ${hasActColumn ? "dashboard-risk-table--with-act" : "dashboard-risk-table--no-act"}`}>
                      <thead>
                        <tr>
                          <th>Поле</th>
                          <th>Приказ</th>
                          {hasActColumn ? <th>Акт</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {attributes.map((row) => (
                          <tr key={`${risk.type}-${row.label}`} className={row.wide ? "dashboard-risk-row--wide" : undefined}>
                            <th scope="row">{row.label}</th>
                            <td>{row.riskValue}</td>
                            {hasActColumn ? <td>{row.actValue ?? "—"}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
