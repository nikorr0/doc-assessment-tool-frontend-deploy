import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getOrder,
  getProject,
  listGroupTasks,
  listGroups,
  updateTasksStatusBulk,
  updateTasksProfessionalCheckedBulk,
  updateTaskProfessionalChecked,
  updateTaskStatus,
} from "../api/projects";
import GroupTasksSection from "../components/GroupTasksSection";
import { getApiErrorMessage } from "../utils/error";
import type { DocumentRecord, GroupRecord, Project, TaskRecord } from "../types";

type LoadState = "idle" | "loading" | "error";

type TaskWithGroup = TaskRecord & {
  groupName?: string | null;
};

export default function OrderTasksPage() {
  const { projectId, orderId } = useParams<{ projectId: string; orderId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [order, setOrder] = useState<DocumentRecord | null>(null);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [tasks, setTasks] = useState<TaskWithGroup[]>([]);
  const [pageState, setPageState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updatingTaskProfessionalCheckedId, setUpdatingTaskProfessionalCheckedId] = useState<number | null>(null);
  const [bulkUpdatingStatus, setBulkUpdatingStatus] = useState(false);
  const [bulkUpdatingProfessionalChecked, setBulkUpdatingProfessionalChecked] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<string>("Выполнено");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [deadlineSort, setDeadlineSort] = useState<"none" | "asc" | "desc">("none");
  const [quarterFilter, setQuarterFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  useEffect(() => {
    const queryFromUrl = (searchParams.get("search") ?? "").trim();
    const groupFromUrl = (searchParams.get("group") ?? "").trim();
    const statusFromUrl = (searchParams.get("status") ?? "").trim().toLowerCase();
    const quarterFromUrl = (searchParams.get("quarter") ?? "").trim();
    const yearFromUrl = (searchParams.get("year") ?? "").trim();

    setSearchQuery(queryFromUrl);
    setGroupFilter(groupFromUrl || "all");

    if (["not_completed", "in_progress", "completed", "other"].includes(statusFromUrl)) {
      setStatusFilter(statusFromUrl);
    } else {
      setStatusFilter("all");
    }

    if (/^\d{4}-Q[1-4]$/.test(quarterFromUrl)) {
      setQuarterFilter(quarterFromUrl);
    } else {
      setQuarterFilter("all");
    }

    if (yearFromUrl) {
      const y = Number(yearFromUrl);
      setYearFilter(Number.isInteger(y) && y >= 1900 && y <= 3000 ? y : null);
    } else {
      setYearFilter(null);
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

  const parseTaskDate = useCallback((value?: string | null): Date | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const iso = new Date(trimmed);
    if (!Number.isNaN(iso.getTime())) {
      return iso;
    }

    const m = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const normalized = new Date(year, month - 1, day);
    if (
      Number.isNaN(normalized.getTime()) ||
      normalized.getFullYear() !== year ||
      normalized.getMonth() !== month - 1 ||
      normalized.getDate() !== day
    ) {
      return null;
    }
    return normalized;
  }, []);

  const resolveTaskDeadline = useCallback((task: TaskWithGroup): string | null => {
    return task.deadline ?? task.actDeadlineDate ?? null;
  }, []);

  const formatDeadline = useCallback((value?: string | null) => {
    if (!value) {
      return "—";
    }
    const parsed = parseTaskDate(value);
    if (!parsed) {
      return value;
    }
    return parsed.toLocaleDateString("ru-RU");
  }, [parseTaskDate]);

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

  const getQuarterKey = useCallback((deadline?: string | null): string => {
    if (!deadline) return "none";
    const date = parseTaskDate(deadline);
    if (!date) return "none";
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()}-Q${quarter}`;
  }, [parseTaskDate]);

  const formatQuarterLabel = useCallback((quarterKey: string): string => {
    const match = quarterKey.match(/^(\d{4})-Q([1-4])$/);
    if (!match) {
      return quarterKey;
    }
    const year = match[1];
    const quarter = match[2];
    return `${quarter}-й квартал ${year} года`;
  }, []);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let result = tasks.filter(task => {
      const byGroup = groupFilter === "all" || task.groupId === groupFilter;
      const byStatus =
        statusFilter === "all" || getStatusFilterKey(task.status) === statusFilter;
      const bySearch =
        query.length === 0 ||
        (task.fullName ?? "").toLowerCase().includes(query) ||
        (task.taskText ?? "").toLowerCase().includes(query);
      const deadlineResolved = resolveTaskDeadline(task);
      const byQuarter =
        quarterFilter === "all" || getQuarterKey(deadlineResolved) === quarterFilter;
      let byYear = true;
      if (quarterFilter === "all" && yearFilter !== null) {
        if (!deadlineResolved) {
          byYear = false;
        } else {
          const d = parseTaskDate(deadlineResolved);
          byYear = !!d && d.getFullYear() === yearFilter;
        }
      }
      return byGroup && byStatus && bySearch && byQuarter && byYear;
    });

    if (deadlineSort !== "none") {
      result = [...result].sort((a, b) => {
        const da = parseTaskDate(resolveTaskDeadline(a))?.getTime() ?? Infinity;
        const db = parseTaskDate(resolveTaskDeadline(b))?.getTime() ?? Infinity;
        return deadlineSort === "asc" ? da - db : db - da;
      });
    }

    return result;
  }, [
    tasks,
    groupFilter,
    statusFilter,
    searchQuery,
    quarterFilter,
    yearFilter,
    deadlineSort,
    getStatusFilterKey,
    getQuarterKey,
    resolveTaskDeadline,
    parseTaskDate,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredTasks]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));

  const paginatedTasks = useMemo(
    () => filteredTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredTasks, currentPage, pageSize]
  );

  const availableQuarters = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => {
      const q = getQuarterKey(resolveTaskDeadline(t));
      if (q !== "none") set.add(q);
    });
    return Array.from(set).sort();
  }, [tasks, getQuarterKey, resolveTaskDeadline]);

  const quarterSelectOptions = useMemo(() => {
    const set = new Set<string>(availableQuarters);
    if (quarterFilter !== "all") {
      set.add(quarterFilter);
    }
    return Array.from(set).sort();
  }, [availableQuarters, quarterFilter]);

  const bulkScopeTasks = filteredTasks;

  const completedTasks = useMemo(
    () => bulkScopeTasks.filter(task => getStatusFilterKey(task.status) === "completed"),
    [bulkScopeTasks, getStatusFilterKey]
  );

  const completedTasksAllChecked = useMemo(
    () => completedTasks.length > 0 && completedTasks.every(task => Boolean(task.isProfessionalChecked)),
    [completedTasks]
  );

  const completedTasksToggleTargetChecked = !completedTasksAllChecked;

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

  const handleCompletedTasksProfessionalCheckedToggle = useCallback(async () => {
    if (!projectId || !orderId) return;
    const taskIds = completedTasks.map(task => task.taskId);
    if (taskIds.length === 0) return;
    setBulkUpdatingProfessionalChecked(true);
    try {
      const result = await updateTasksProfessionalCheckedBulk(
        projectId,
        orderId,
        taskIds,
        completedTasksToggleTargetChecked
      );
      const updatedIds = new Set(
        (result.updated_task_ids?.length ? result.updated_task_ids : taskIds).map(id => Number(id))
      );
      setTasks(prev =>
        prev.map(task =>
          updatedIds.has(task.taskId)
            ? { ...task, isProfessionalChecked: completedTasksToggleTargetChecked }
            : task
        )
      );
    } catch (err: unknown) {
      console.error(err);
      setError(getApiErrorMessage(err, "Ошибка массового обновления проверки задач"));
    } finally {
      setBulkUpdatingProfessionalChecked(false);
    }
  }, [projectId, orderId, completedTasks, completedTasksToggleTargetChecked]);

  const handleBulkStatusApply = useCallback(async (statusOverride?: string) => {
    const targetStatus = statusOverride ?? bulkTargetStatus;
    if (!projectId || !orderId || bulkUpdatingStatus) return;
    const taskIds = bulkScopeTasks.map(task => task.taskId);
    if (taskIds.length === 0) return;
    setBulkUpdatingStatus(true);
    try {
      const result = await updateTasksStatusBulk(projectId, orderId, taskIds, targetStatus);
      const updatedIds = new Set(
        (result.updated_task_ids?.length ? result.updated_task_ids : taskIds).map(id => Number(id))
      );
      setTasks(prev =>
        prev.map(task =>
          updatedIds.has(task.taskId)
            ? { ...task, status: targetStatus }
            : task
        )
      );
      if (updatedIds.size !== taskIds.length) {
        setError(
          updatedIds.size === 0
            ? "Не удалось массово обновить статус задач"
            : `Обновлено ${updatedIds.size} из ${taskIds.length} задач`
        );
      }
    } catch (err: unknown) {
      console.error(err);
      setError(getApiErrorMessage(err, "Ошибка массового обновления статуса задач"));
    } finally {
      setBulkUpdatingStatus(false);
    }
  }, [projectId, orderId, bulkUpdatingStatus, bulkScopeTasks, bulkTargetStatus]);

  const bulkStatusMeta = getTaskStatusMeta(bulkTargetStatus);

  const bulkStatusTitle = (() => {
    const scopeText =
      groupFilter === "all"
        ? "по всем группам"
        : `в группе «${groups.find(group => group.groupId === groupFilter)?.groupName || groupFilter}»`;
    const expl = `Массово меняет статус у всех задач, попавших под текущие фильтры ${scopeText}.`;
    if (pageState === "loading") {
      return `${expl} Дождитесь загрузки списка задач.`;
    }
    if (bulkScopeTasks.length === 0) {
      return `${expl} Сейчас нет задач в текущем наборе фильтров.`;
    }
    if (bulkUpdatingStatus) {
      return expl;
    }
    return `${expl} Следующее нажатие: установить «${bulkTargetStatus}».`;
  })();

  const completedTasksToggleMeta = getTaskProfessionalCheckedMeta(completedTasksToggleTargetChecked);

  const completedTasksBulkTitle = (() => {
    const scopeText =
      groupFilter === "all"
        ? "по всем группам"
        : `в группе «${groups.find(group => group.groupId === groupFilter)?.groupName || groupFilter}»`;
    const expl =
      `Массово меняет отметку «Проверено» / «Не проверено» только у задач со статусом «Выполнено» ${scopeText}. Остальные задачи не затрагивает.`;
    if (pageState === "loading") {
      return `${expl} Дождитесь загрузки списка задач.`;
    }
    if (completedTasks.length === 0) {
      return `${expl} Сейчас нет задач со статусом «Выполнено».`;
    }
    if (bulkUpdatingProfessionalChecked) {
      return expl;
    }
    return completedTasksToggleTargetChecked
      ? `${expl} Следующее нажатие: для всех выполненных — «Проверено».`
      : `${expl} Следующее нажатие: для всех выполненных — «Не проверено».`;
  })();

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
      <button
        type="button"
        className="back-link"
        onClick={() => navigate(-1)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          font: "inherit",
          fontWeight: 500,
        }}
      >
        ← Назад
      </button>
      <h1 className="page-title">Все задачи приказа "{order?.fileName}"</h1>
      <p className="subtitle">Проект "{project?.name}"</p>

      <GroupTasksSection
        title="Задачи приказа"
        tasksState={pageState}
        tasksError={error}
        tasks={tasks}
        filteredTasks={filteredTasks}
        paginatedTasks={paginatedTasks}
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        onCurrentPageChange={setCurrentPage}
        onPageSizeChange={size => {
          setPageSize(size);
          setCurrentPage(1);
        }}
        onRefresh={() => refreshTasks()}
        refreshDisabled={pageState === "loading"}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        quarterFilter={quarterFilter}
        quarterOptions={quarterSelectOptions}
        onQuarterFilterChange={setQuarterFilter}
        formatQuarterLabel={formatQuarterLabel}
        deadlineSort={deadlineSort}
        onDeadlineSortChange={setDeadlineSort}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        getTaskStatusMeta={getTaskStatusMeta}
        getTaskProfessionalCheckedMeta={getTaskProfessionalCheckedMeta}
        updatingTaskId={updatingTaskId}
        updatingTaskProfessionalCheckedId={updatingTaskProfessionalCheckedId}
        onTaskStatusChange={handleTaskStatusChange}
        onTaskProfessionalCheckedChange={handleTaskProfessionalCheckedChange}
        resolveTaskDeadline={resolveTaskDeadline}
        formatDeadline={formatDeadline}
        getRowKey={task => `${task.groupId}-${task.taskId}`}
        showGroupFilter
        groupFilter={groupFilter}
        onGroupFilterChange={setGroupFilter}
        groups={groups}
        includeGroupColumn
        resolveGroupLabel={resolveGroupLabel}
        noTasksMessage="Задачи для этого приказа пока не обнаружены."
        bulkProfessionalCheckedControl={{
          title: completedTasksBulkTitle,
          busy: bulkUpdatingProfessionalChecked,
          disabled:
            bulkUpdatingProfessionalChecked || pageState !== "idle" || completedTasks.length === 0,
          targetChecked: completedTasksToggleTargetChecked,
          onToggle: handleCompletedTasksProfessionalCheckedToggle,
          meta: completedTasksToggleMeta,
        }}
        bulkStatusControl={{
          title: bulkStatusTitle,
          busy: bulkUpdatingStatus,
          disabled: bulkUpdatingStatus || pageState !== "idle" || bulkScopeTasks.length === 0,
          selectedStatus: bulkTargetStatus,
          onStatusChange: setBulkTargetStatus,
          onApply: handleBulkStatusApply,
          meta: bulkStatusMeta,
        }}
      />
    </div>
  );
}
