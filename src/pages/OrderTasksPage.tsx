import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useParams } from "react-router-dom";
import {
  getOrder,
  getProject,
  listGroupTasks,
  listGroups,
  updateTaskProfessionalChecked,
  updateTaskStatus,
} from "../api/projects";
import { getApiErrorMessage } from "../utils/error";
import type { DocumentRecord, GroupRecord, Project, TaskRecord } from "../types";

type LoadState = "idle" | "loading" | "error";

type TaskWithGroup = TaskRecord & {
  groupName?: string | null;
};

export default function OrderTasksPage() {
  const { projectId, orderId } = useParams<{ projectId: string; orderId: string }>();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [order, setOrder] = useState<DocumentRecord | null>(null);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [tasks, setTasks] = useState<TaskWithGroup[]>([]);
  const [pageState, setPageState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updatingTaskProfessionalCheckedId, setUpdatingTaskProfessionalCheckedId] = useState<number | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    const queryFromUrl = (searchParams.get("search") ?? "").trim();
    const groupFromUrl = searchParams.get("group") ?? "";
    setSearchQuery(queryFromUrl);
    if (groupFromUrl) {
      setGroupFilter(groupFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId)
      .then(data => setProject(data))
      .catch(err => {
        console.error(err);
      });
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !orderId) return;
    getOrder(projectId, orderId)
      .then(data => setOrder(data))
      .catch(err => {
        console.error(err);
      });
  }, [projectId, orderId]);

  const refreshTasks = useCallback(async () => {
    if (!projectId || !orderId) return;
    setPageState("loading");
    setError(null);
    try {
      const groupsData = await listGroups(projectId, orderId);
      setGroups(groupsData);

      const allTaskResponses = await Promise.all(
        groupsData.map(async group => {
          const groupTasks = await listGroupTasks(projectId, orderId, group.groupId);
          return groupTasks.tasks.map(task => ({
            ...task,
            groupName: group.groupName ?? null,
          }));
        })
      );

      setTasks(allTaskResponses.flat());
      setPageState("idle");
    } catch (err) {
      console.error(err);
      setPageState("error");
      setError("Не удалось загрузить задачи приказа");
    }
  }, [projectId, orderId]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const getTaskStatusMeta = useCallback((status?: string | null) => {
    const base = status?.trim();
    const normalized = base?.toLowerCase();
    const defaults = {
      background: "#fee2e2",
      color: "#b91c1c",
    };
    if (!normalized) {
      return defaults;
    }
    if (normalized.startsWith("не") || normalized.includes("не выполн")) {
      return defaults;
    }
    if (normalized.startsWith("выполн")) {
      return {
        background: "#dcfce7",
        color: "#166534",
      };
    }
    if (normalized.includes("работ")) {
      return {
        background: "#ffedd5",
        color: "#c2410c",
      };
    }
    return {
      background: "#e2e8f0",
      color: "#334155",
    };
  }, []);

  const getTaskProfessionalCheckedMeta = useCallback((isChecked?: boolean) => {
    if (isChecked) {
      return {
        background: "#7c3aed",
        color: "#ffffff",
        borderColor: "#7c3aed",
      };
    }
    return {
      background: "#ffffff",
      color: "#7c3aed",
      borderColor: "#7c3aed",
    };
  }, []);

  const formatDeadline = useCallback((value?: string | null) => {
    if (!value) {
      return "—";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleDateString("ru-RU");
  }, []);

  const resolveGroupLabel = useCallback(
    (task: TaskWithGroup) => {
      const resolvedGroup =
        task.groupName ||
        groups.find(group => group.groupId === task.groupId)?.groupName ||
        (task.groupId ? `Группа ${task.groupId}` : null);
      return resolvedGroup || "—";
    },
    [groups]
  );

  const getStatusFilterKey = useCallback((status?: string | null) => {
    const normalized = status?.trim().toLowerCase() ?? "";
    if (!normalized || normalized.startsWith("не") || normalized.includes("не выполн")) {
      return "not_completed";
    }
    if (normalized.startsWith("выполн")) {
      return "completed";
    }
    if (normalized.includes("работ")) {
      return "in_progress";
    }
    return "other";
  }, []);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tasks.filter(task => {
      const byGroup = groupFilter === "all" || task.groupId === groupFilter;
      const byStatus =
        statusFilter === "all" || getStatusFilterKey(task.status) === statusFilter;
      const bySearch =
        query.length === 0 ||
        (task.fullName ?? "").toLowerCase().includes(query) ||
        (task.taskText ?? "").toLowerCase().includes(query);
      return byGroup && byStatus && bySearch;
    });
  }, [tasks, groupFilter, statusFilter, searchQuery, getStatusFilterKey]);

  const handleTaskStatusChange = useCallback(
    async (taskId: number, newStatus: string) => {
      if (!projectId || !orderId) return;
      setUpdatingTaskId(taskId);
      try {
        await updateTaskStatus(projectId, orderId, taskId, newStatus);
        setTasks(prev =>
          prev.map(task => (task.taskId === taskId ? { ...task, status: newStatus } : task))
        );
      } catch (err: unknown) {
        console.error(err);
        setError(getApiErrorMessage(err, "Ошибка обновления статуса"));
      } finally {
        setUpdatingTaskId(null);
      }
    },
    [projectId, orderId]
  );

  const handleTaskProfessionalCheckedChange = useCallback(
    async (taskId: number, isProfessionalChecked: boolean) => {
      if (!projectId || !orderId) return;
      setUpdatingTaskProfessionalCheckedId(taskId);
      try {
        await updateTaskProfessionalChecked(projectId, orderId, taskId, isProfessionalChecked);
        setTasks(prev =>
          prev.map(task =>
            task.taskId === taskId ? { ...task, isProfessionalChecked } : task
          )
        );
      } catch (err: unknown) {
        console.error(err);
        setError(getApiErrorMessage(err, "Ошибка обновления проверки задачи"));
      } finally {
        setUpdatingTaskProfessionalCheckedId(null);
      }
    },
    [projectId, orderId]
  );

  if (!projectId || !orderId) {
    return (
      <div className="card">
        <h2>Недостаточно данных</h2>
        <p>Неверный адрес страницы. Вернитесь к списку проектов.</p>
        <Link to="/projects" className="back-link">
          ← Все проекты
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/projects/${projectId}/${orderId}`} className="back-link">
        ← Назад к приказу
      </Link>
      <h1 className="page-title">Все задачи приказа "{order?.fileName}"</h1>
      <p className="subtitle">Проект "{project?.name}"</p>

      <div className="card">
        <div className="card-header-row">
          <h3 style={{ margin: 0 }}>Задачи приказа</h3>
          <button
            type="button"
            className="secondary"
            onClick={() => refreshTasks()}
            disabled={pageState === "loading"}
          >
            Обновить
          </button>
        </div>
        <div className="tasks-filters">
          <label className="form-field">
            <span className="form-field-label">Группа</span>
            <select
              className="form-control"
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
            >
              <option value="all">Все группы</option>
              {groups.map(group => (
                <option key={group.groupId} value={group.groupId}>
                  {group.groupName || group.groupId}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-field-label">Статус</span>
            <select
              className="form-control"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">Все статусы</option>
              <option value="not_completed">Не выполнено</option>
              <option value="in_progress">В работе</option>
              <option value="completed">Выполнено</option>
            </select>
          </label>
          <label className="form-field form-field-search">
            <span className="form-field-label">Поиск</span>
            <input
              className="form-control"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по ФИО или задаче"
            />
          </label>
        </div>

        {pageState === "loading" && <div>Загрузка задач...</div>}
        {pageState === "error" && <div style={{ color: "crimson" }}>{error ?? "Ошибка загрузки задач"}</div>}
        {pageState === "idle" && tasks.length === 0 && (
          <div className="empty-state">Задачи для этого приказа пока не обнаружены.</div>
        )}
        {pageState === "idle" && tasks.length > 0 && filteredTasks.length === 0 && (
          <div className="empty-state">По заданным фильтрам ничего не найдено.</div>
        )}
        {pageState === "idle" && filteredTasks.length > 0 && (
          <table className="acts-table">
            <thead>
              <tr>
                <th>Группа</th>
                <th>ФИО</th>
                <th>Задача</th>
                <th>Ед. измерения</th>
                <th>Срок выполнения</th>
                <th style={{ width: 220 }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const statusMeta = getTaskStatusMeta(task.status);
                const professionalCheckedMeta = getTaskProfessionalCheckedMeta(
                  task.isProfessionalChecked
                );
                const isUpdating = updatingTaskId === task.taskId;
                const isUpdatingProfessionalChecked =
                  updatingTaskProfessionalCheckedId === task.taskId;
                return (
                  <tr key={`${task.groupId}-${task.taskId}`}>
                    <td>{resolveGroupLabel(task)}</td>
                    <td>{task.fullName || "—"}</td>
                    <td>{task.taskText || "—"}</td>
                    <td>{task.units || "—"}</td>
                    <td>{formatDeadline(task.deadline)}</td>
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
                            onChange={e => handleTaskStatusChange(task.taskId, e.target.value)}
                            disabled={isUpdating}
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
                              handleTaskProfessionalCheckedChange(
                                task.taskId,
                                !task.isProfessionalChecked
                              )
                            }
                            disabled={isUpdatingProfessionalChecked}
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
