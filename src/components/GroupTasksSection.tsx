import { Fragment, useCallback, useState, type CSSProperties } from "react";
import type { GroupRecord, TaskRecord } from "../types";
import { TaskReportPanelRow, TaskReportToggleButton } from "./TaskReportToggle";

function WarningTriangleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

type LoadState = "idle" | "loading" | "error";

type TaskStatusMeta = {
  background: string;
  color: string;
};

type TaskProfessionalCheckedMeta = {
  background: string;
  color: string;
  borderColor: string;
};

type BulkProfessionalCheckedControl = {
  title: string;
  busy: boolean;
  disabled: boolean;
  targetChecked: boolean;
  onToggle: () => void;
  meta: TaskProfessionalCheckedMeta;
};

type BulkStatusControl = {
  title: string;
  busy: boolean;
  disabled: boolean;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  onApply: (statusOverride?: string) => void;
  meta: TaskStatusMeta;
};

export type GroupTasksSectionTask = TaskRecord & {
  groupName?: string | null;
};

type GroupTasksSectionProps = {
  title: string;
  tasksState: LoadState;
  tasksError: string | null;
  tasks: GroupTasksSectionTask[];
  filteredTasks: GroupTasksSectionTask[];
  paginatedTasks: GroupTasksSectionTask[];
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onCurrentPageChange: (page: number | ((prev: number) => number)) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  quarterFilter: string;
  quarterOptions: string[];
  onQuarterFilterChange: (value: string) => void;
  formatQuarterLabel: (quarter: string) => string;
  deadlineSort: "none" | "asc" | "desc";
  onDeadlineSortChange: (value: "none" | "asc" | "desc") => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  getTaskStatusMeta: (status?: string | null) => TaskStatusMeta;
  getTaskProfessionalCheckedMeta: (checked?: boolean) => TaskProfessionalCheckedMeta;
  updatingTaskId: number | null;
  updatingTaskProfessionalCheckedId: number | null;
  onTaskStatusChange: (taskId: number, newStatus: string) => void;
  onTaskProfessionalCheckedChange: (taskId: number, isProfessionalChecked: boolean) => void;
  resolveTaskDeadline: (task: GroupTasksSectionTask) => string | null;
  formatDeadline: (value?: string | null) => string;
  getRowKey: (task: GroupTasksSectionTask) => string;
  showGroupFilter?: boolean;
  groupFilter?: string;
  onGroupFilterChange?: (value: string) => void;
  groups?: GroupRecord[];
  includeGroupColumn?: boolean;
  resolveGroupLabel?: (task: GroupTasksSectionTask) => string;
  bulkStatusControl?: BulkStatusControl;
  bulkProfessionalCheckedControl?: BulkProfessionalCheckedControl;
  noTasksMessage?: string;
  noFilteredMessage?: string;
  disableTaskActions?: boolean;
  id?: string;
};

function formatHistoryCell(value?: string | null): string {
  const normalized = (value ?? "").trim();
  return normalized || "—";
}

function isSoftUnitsWarning(unitsWarning?: boolean, unitsBlocked?: boolean): boolean {
  return Boolean(unitsWarning) && !Boolean(unitsBlocked);
}

const bulkActionControlStyle: CSSProperties = {
  padding: "8px",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 13,
  lineHeight: 1.2,
  boxSizing: "border-box",
  minHeight: 36,
  whiteSpace: "nowrap",
};

const narrowIconColumnStyle: CSSProperties = {
  width: 36,
  minWidth: 36,
  maxWidth: 40,
  padding: "8px 4px",
  verticalAlign: "middle",
};

export default function GroupTasksSection({
  title,
  tasksState,
  tasksError,
  tasks,
  filteredTasks,
  paginatedTasks,
  currentPage,
  totalPages,
  pageSize,
  onCurrentPageChange,
  onPageSizeChange,
  onRefresh,
  refreshDisabled = false,
  statusFilter,
  onStatusFilterChange,
  quarterFilter,
  quarterOptions,
  onQuarterFilterChange,
  formatQuarterLabel,
  deadlineSort,
  onDeadlineSortChange,
  searchQuery,
  onSearchQueryChange,
  getTaskStatusMeta,
  getTaskProfessionalCheckedMeta,
  updatingTaskId,
  updatingTaskProfessionalCheckedId,
  onTaskStatusChange,
  onTaskProfessionalCheckedChange,
  resolveTaskDeadline,
  formatDeadline,
  getRowKey,
  showGroupFilter = false,
  groupFilter = "all",
  onGroupFilterChange,
  groups = [],
  includeGroupColumn = false,
  resolveGroupLabel,
  bulkStatusControl,
  bulkProfessionalCheckedControl,
  noTasksMessage = "Задачи для этой группы пока не обнаружены.",
  noFilteredMessage = "По заданным фильтрам ничего не найдено.",
  disableTaskActions = false,
  id,
}: GroupTasksSectionProps) {
  const [expandedReportRowKeys, setExpandedReportRowKeys] = useState<Set<string>>(
    () => new Set()
  );

  const toggleExpandedReportRowKey = useCallback((rowKey: string) => {
    setExpandedReportRowKeys(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  }, []);

  const shownFrom = filteredTasks.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const shownTo = Math.min(currentPage * pageSize, filteredTasks.length);
  const reportColSpan = includeGroupColumn ? 8 : 7;

  return (
    <div className="card" id={id}>
      <div className="card-header-row">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button
          type="button"
          className="secondary"
          onClick={onRefresh}
          disabled={refreshDisabled}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Обновить
        </button>
      </div>

      <div className="tasks-filters">
        {showGroupFilter && onGroupFilterChange && (
          <label className="form-field">
            <span className="form-field-label">Группа</span>
            <select
              className="form-control"
              value={groupFilter}
              onChange={e => onGroupFilterChange(e.target.value)}
            >
              <option value="all">Все группы</option>
              {groups.map(group => (
                <option key={group.groupId} value={group.groupId}>
                  {group.groupName || group.groupId}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-field">
          <span className="form-field-label">Статус</span>
          <select
            className="form-control"
            value={statusFilter}
            onChange={e => onStatusFilterChange(e.target.value)}
          >
            <option value="all">Все статусы</option>
            <option value="not_completed">Не выполнено</option>
            <option value="in_progress">В работе</option>
            <option value="completed">Выполнено</option>
          </select>
        </label>
        <label className="form-field">
          <span className="form-field-label">Квартал</span>
          <select
            className="form-control"
            value={quarterFilter}
            onChange={e => onQuarterFilterChange(e.target.value)}
          >
            <option value="all">Все кварталы</option>
            {quarterOptions.map(quarter => (
              <option key={quarter} value={quarter}>
                {formatQuarterLabel(quarter)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="form-field-label">Срок выполнения</span>
          <select
            className="form-control"
            value={deadlineSort}
            onChange={e => onDeadlineSortChange(e.target.value as "none" | "asc" | "desc")}
          >
            <option value="none">Без сортировки</option>
            <option value="asc">По возрастанию</option>
            <option value="desc">По убыванию</option>
          </select>
        </label>
        <label className="form-field form-field-search">
          <span className="form-field-label">Поиск</span>
          <input
            className="form-control"
            type="text"
            value={searchQuery}
            onChange={e => onSearchQueryChange(e.target.value)}
            placeholder="Поиск по ФИО или задаче"
          />
        </label>
        {bulkStatusControl && (
          <div
            className="form-field"
            style={{
              justifyContent: "flex-end",
              marginLeft: "auto",
              minWidth: 260,
              alignItems: "flex-end",
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}
              title={bulkStatusControl.title}
            >
              <select
                value={
                  bulkStatusControl.busy ? "__saving__" : bulkStatusControl.selectedStatus
                }
                onChange={e => {
                  const nextStatus = e.target.value;
                  bulkStatusControl.onStatusChange(nextStatus);
                  bulkStatusControl.onApply(nextStatus);
                }}
                disabled={bulkStatusControl.disabled || bulkStatusControl.busy}
                aria-label="Сменить статус всех задач"
                title={bulkStatusControl.title}
                style={{
                  ...bulkActionControlStyle,
                  backgroundColor: bulkStatusControl.meta.background,
                  color: bulkStatusControl.meta.color,
                  border: `1px solid ${bulkStatusControl.meta.color}`,
                  cursor: bulkStatusControl.busy ? "wait" : "pointer",
                  opacity: bulkStatusControl.disabled ? 0.6 : 1,
                  minWidth: 140,
                  maxWidth: 275,
                }}
              >
                {bulkStatusControl.busy ? (
                  <option value="__saving__">Сохранение...</option>
                ) : (
                  <>
                    <option value="Не выполнено">Сменить статус на «Не выполнено»</option>
                    <option value="В работе">Сменить статус на «В работе»</option>
                    <option value="Выполнено">Сменить статус на «Выполнено»</option>
                  </>
                )}
              </select>
            </div>
          </div>
        )}
        {bulkProfessionalCheckedControl && (
          <div
            className="form-field"
            style={{
              justifyContent: "flex-end",
              minWidth: 260,
              alignItems: "flex-end",
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}
              title={bulkProfessionalCheckedControl.title}
            >
              <button
                type="button"
                onClick={bulkProfessionalCheckedControl.onToggle}
                disabled={bulkProfessionalCheckedControl.disabled}
                aria-label={bulkProfessionalCheckedControl.title}
                title={bulkProfessionalCheckedControl.title}
                style={{
                  ...bulkActionControlStyle,
                  backgroundColor: bulkProfessionalCheckedControl.meta.background,
                  color: bulkProfessionalCheckedControl.meta.color,
                  border: `1px solid ${bulkProfessionalCheckedControl.meta.borderColor}`,
                  cursor: bulkProfessionalCheckedControl.busy
                    ? "wait"
                    : bulkProfessionalCheckedControl.disabled
                      ? "not-allowed"
                      : "pointer",
                  opacity: bulkProfessionalCheckedControl.disabled ? 0.6 : 1,
                }}
              >
                {bulkProfessionalCheckedControl.busy
                  ? "Сохранение..."
                  : bulkProfessionalCheckedControl.targetChecked
                    ? "Сменить статус на «Проверено»"
                    : "Сменить статус на «Не проверено»"}
              </button>
            </div>
          </div>
        )}
      </div>

      {tasksState === "loading" && <div>Загрузка задач...</div>}
      {tasksState === "error" && <div style={{ color: "crimson" }}>{tasksError ?? "Ошибка загрузки задач"}</div>}
      {tasksState === "idle" && tasks.length === 0 && (
        <div className="empty-state">{noTasksMessage}</div>
      )}
      {tasksState === "idle" && tasks.length > 0 && filteredTasks.length === 0 && (
        <div className="empty-state">{noFilteredMessage}</div>
      )}
      {tasksState === "idle" && filteredTasks.length > 0 && (
        <>
          <table className="acts-table">
            <thead>
              <tr>
                {includeGroupColumn && <th>Группа</th>}
                <th>ФИО</th>
                <th>Задача</th>
                <th style={narrowIconColumnStyle} aria-hidden />
                <th>Ед. измерения</th>
                <th style={narrowIconColumnStyle} aria-hidden />
                <th>Срок выполнения</th>
                <th style={{ width: 220 }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTasks.map(task => {
                const rowKey = getRowKey(task);
                const statusMeta = getTaskStatusMeta(task.status);
                const professionalCheckedMeta = getTaskProfessionalCheckedMeta(
                  task.isProfessionalChecked
                );
                const isUpdating = updatingTaskId === task.taskId;
                const isUpdatingProfessionalChecked =
                  updatingTaskProfessionalCheckedId === task.taskId;
                const reportText = (task.taskReport ?? "").trim();
                const annotationText = (task.actTaskAnnotation ?? "").trim();
                const hasReport = Boolean(reportText);
                const hasAnnotation = Boolean(annotationText);
                const isReportExpanded = expandedReportRowKeys.has(rowKey);
                const hasSoftWarning = isSoftUnitsWarning(task.unitsWarning, task.unitsBlocked);
                const unitsWarningHint = hasSoftWarning
                  ? `Единицы измерения частично отличаются. В акте: "${formatHistoryCell(
                      task.actUnits
                    )}"`
                  : "";
                return (
                  <Fragment key={rowKey}>
                    <tr>
                      {includeGroupColumn && <td>{resolveGroupLabel ? resolveGroupLabel(task) : "—"}</td>}
                      <td>{task.fullName || "—"}</td>
                      <td>{task.taskText || "—"}</td>
                      <td style={narrowIconColumnStyle}>
                        <TaskReportToggleButton
                          reportText={task.taskReport}
                          annotationText={task.actTaskAnnotation}
                          expanded={isReportExpanded}
                          onToggle={() => toggleExpandedReportRowKey(rowKey)}
                        />
                      </td>
                      <td>{task.units || "—"}</td>
                      <td style={narrowIconColumnStyle}>
                        {hasSoftWarning && (
                          <span className="task-units-warning" tabIndex={0}>
                            <WarningTriangleIcon />
                            <span className="task-units-warning__popup">{unitsWarningHint}</span>
                          </span>
                        )}
                      </td>
                      <td>{formatDeadline(resolveTaskDeadline(task))}</td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <div>
                            <select
                              value={task.status || "Не выполнено"}
                              onChange={e => onTaskStatusChange(task.taskId, e.target.value)}
                              disabled={isUpdating || disableTaskActions}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                fontWeight: 600,
                                fontSize: 13,
                                backgroundColor: statusMeta.background,
                                color: statusMeta.color,
                                border: `1px solid ${statusMeta.color}`,
                                cursor: isUpdating ? "wait" : "pointer",
                                minWidth: 140,
                              }}
                            >
                              <option value="Не выполнено">Не выполнено</option>
                              <option value="В работе">В работе</option>
                              <option value="Выполнено">Выполнено</option>
                            </select>
                            {isUpdating && (
                              <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>
                                Сохранение...
                              </span>
                            )}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                onTaskProfessionalCheckedChange(
                                  task.taskId,
                                  !task.isProfessionalChecked
                                )
                              }
                              disabled={isUpdatingProfessionalChecked || disableTaskActions}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                fontWeight: 600,
                                fontSize: 13,
                                backgroundColor: professionalCheckedMeta.background,
                                color: professionalCheckedMeta.color,
                                border: `1px solid ${professionalCheckedMeta.borderColor}`,
                                cursor: isUpdatingProfessionalChecked ? "wait" : "pointer",
                                minWidth: 140,
                              }}
                            >
                              {task.isProfessionalChecked ? "Проверено" : "Не проверено"}
                            </button>
                            {isUpdatingProfessionalChecked && (
                              <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>
                                Сохранение...
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {(hasReport || hasAnnotation) && isReportExpanded && (
                      <TaskReportPanelRow
                        reportText={reportText}
                        annotationText={annotationText}
                        colSpan={reportColSpan}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              Записей на странице:
              <select
                className="form-control"
                style={{ width: "auto", padding: "2px 6px" }}
                value={pageSize}
                onChange={e => onPageSizeChange(Number(e.target.value))}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                type="button"
                className="secondary"
                style={{ padding: "4px 10px", fontSize: 13 }}
                disabled={currentPage === 1}
                onClick={() => onCurrentPageChange(1)}
              >
                «
              </button>
              <button
                type="button"
                className="secondary"
                style={{ padding: "4px 10px", fontSize: 13 }}
                disabled={currentPage === 1}
                onClick={() => onCurrentPageChange(prev => Math.max(1, prev - 1))}
              >
                ‹
              </button>
              <span style={{ fontSize: 13, minWidth: 80, textAlign: "center" }}>
                Стр. {currentPage} из {totalPages}
              </span>
              <button
                type="button"
                className="secondary"
                style={{ padding: "4px 10px", fontSize: 13 }}
                disabled={currentPage === totalPages}
                onClick={() => onCurrentPageChange(prev => Math.min(totalPages, prev + 1))}
              >
                ›
              </button>
              <button
                type="button"
                className="secondary"
                style={{ padding: "4px 10px", fontSize: 13 }}
                disabled={currentPage === totalPages}
                onClick={() => onCurrentPageChange(totalPages)}
              >
                »
              </button>
            </div>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Показано {shownFrom}–{shownTo} из {filteredTasks.length}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
