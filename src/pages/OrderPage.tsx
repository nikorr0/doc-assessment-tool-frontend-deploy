import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  deleteAct,
  deleteTemplate,
  generateTemplate,
  getDocumentValidation,
  getOrder,
  getOrderRaw,
  getProject,
  listActs,
  listGroupTasks,
  listGroups,
  listTaskStatusHistory,
  listTemplates,
  undoTaskStatus,
  updateTaskStatus,
  updateTaskProfessionalChecked,
  uploadAct,
} from "../api/projects";
import { getApiErrorMessage } from "../utils/error";
import { toValidationIssues } from "../utils/validationIssues";
import ValidationIssuesModal from "../components/ValidationIssuesModal";
import { StatusBar, StatusBarDot } from "../components/StatusBar";
import { TaskReportPanelRow, TaskTextWithReportToggle } from "../components/TaskReportToggle";
import type {
  DocumentRecord,
  DocumentValidationStatus,
  GroupRecord,
  OrderRawResponse,
  Project,
  TemplateRecord,
  TaskRecord,
  TaskStatusHistoryRecord,
  ValidationIssue,
} from "../types";

function statusHistoryCardClassFromNewStatus(newStatus?: string | null): string {
  const normalized = (newStatus ?? "").trim().toLowerCase();
  const base = "status-history-card";
  if (normalized.startsWith("выполн")) {
    return `${base} status-history-card--done`;
  }
  if (normalized.startsWith("не") || normalized.includes("не выполн")) {
    return `${base} status-history-card--not-done`;
  }
  if (normalized.includes("работ")) {
    return `${base} status-history-card--progress`;
  }
  return `${base} status-history-card--other`;
}

type LoadState = "idle" | "loading" | "error";

type ValidationBanner = {
  tone: "info" | "success" | "warning" | "error";
  text: string;
};

type ValidationModal = {
  tone: "warning" | "error";
  title: string;
  issues: ValidationIssue[];
  exportFileNamePrefix: string;
};

function getDocumentStatusLabel(status?: string | null): string {
  const normalized = (status ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    pending: "Ожидает проверки",
    processing: "В обработке",
    ready: "Готово",
    success: "Готово",
    warning: "С предупреждениями",
    validation_warning: "С предупреждениями",
    error: "Ошибка",
    failed: "Ошибка",
    uploaded: "Загружен",
    completed: "Завершен",
    done: "Завершен",
    stored: "Сохранен",
    processed: "Обработан",
  };
  return labels[normalized] ?? (status?.trim() || "—");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function OrderPage() {
  const { projectId, orderId } = useParams<{ projectId: string; orderId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [order, setOrder] = useState<DocumentRecord | null>(null);
  const [acts, setActs] = useState<DocumentRecord[]>([]);
  const [orderState, setOrderState] = useState<LoadState>("loading");
  const [orderRawState, setOrderRawState] = useState<LoadState>("loading");
  const [orderRaw, setOrderRaw] = useState<OrderRawResponse | null>(null);
  const [actsState, setActsState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [groupsState, setGroupsState] = useState<LoadState>("loading");
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [uploadingQuarter, setUploadingQuarter] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationBanner, setValidationBanner] = useState<ValidationBanner | null>(null);
  const [validationModal, setValidationModal] = useState<ValidationModal | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [templatesState, setTemplatesState] = useState<LoadState>("loading");
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateInfo, setTemplateInfo] = useState<string | null>(null);
  const [generatingQuarter, setGeneratingQuarter] = useState<number | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [tasksState, setTasksState] = useState<LoadState>("idle");
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updatingTaskProfessionalCheckedId, setUpdatingTaskProfessionalCheckedId] = useState<number | null>(null);
  const [bulkUpdatingProfessionalChecked, setBulkUpdatingProfessionalChecked] = useState(false);
  const [expandedReportTaskId, setExpandedReportTaskId] = useState<number | null>(null);
  const [statusHistory, setStatusHistory] = useState<TaskStatusHistoryRecord[]>([]);
  const [statusHistoryState, setStatusHistoryState] = useState<LoadState>("idle");
  const [statusHistoryError, setStatusHistoryError] = useState<string | null>(null);
  const [undoTargetByHistoryId, setUndoTargetByHistoryId] = useState<Record<string, string>>({});
  const [undoInProgressHistoryId, setUndoInProgressHistoryId] = useState<string | null>(null);
  const [isPerformanceDrawerOpen, setIsPerformanceDrawerOpen] = useState(false);
  const [actToDelete, setActToDelete] = useState<DocumentRecord | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<TemplateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [tasksDeadlineSort, setTasksDeadlineSort] = useState<"none" | "asc" | "desc">("none");
  const [tasksQuarterFilter, setTasksQuarterFilter] = useState<string>("all");
  const [tasksCurrentPage, setTasksCurrentPage] = useState<number>(1);
  const [tasksPageSize, setTasksPageSize] = useState<number>(5);
  const [actsBlockTab, setActsBlockTab] = useState<"by-group" | "all">("by-group");
  const [allActsPage, setAllActsPage] = useState<number>(1);
  const [allActsPageSize, setAllActsPageSize] = useState<number>(5);
  const [allActsGroupFilter, setAllActsGroupFilter] = useState<string>("all");
  const [allActsQuarterFilter, setAllActsQuarterFilter] = useState<string>("all");
  const [allActsSort, setAllActsSort] = useState<"date-desc" | "date-asc" | "name-asc" | "name-desc">("date-desc");
  const [activeSection, setActiveSection] = useState<string>("order-info");
  const templatePollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const templatePollInFlightRef = useRef(false);
  const tasksPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksPollInFlightRef = useRef(false);

  const TEMPLATE_POLL_INTERVAL_MS = 4000;
  const TEMPLATE_POLL_MAX_ATTEMPTS = 20;
  const TASKS_POLL_INTERVAL_MS = 4000;
  const TASKS_POLL_MAX_ATTEMPTS = 20;
  const VALIDATION_POLL_INTERVAL_MS = 1500;
  const VALIDATION_POLL_MAX_ATTEMPTS = 50;

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
    setOrderState("loading");
    getOrder(projectId, orderId)
      .then(data => {
        setOrder(data);
        setOrderState("idle");
      })
      .catch(err => {
        console.error(err);
        setOrderState("error");
        setError("Не удалось загрузить приказ");
      });
  }, [projectId, orderId]);

  useEffect(() => {
    if (!projectId || !orderId) return;
    setOrderRawState("loading");
    getOrderRaw(projectId, orderId)
      .then(data => {
        setOrderRaw(data);
        setOrderRawState("idle");
      })
      .catch(err => {
        console.error(err);
        setOrderRaw(null);
        setOrderRawState("error");
      });
  }, [projectId, orderId]);

  const performanceTable = useMemo(() => {
    if (!orderRaw?.raw || !Array.isArray(orderRaw.raw)) {
      return null;
    }
    const rawEntry = orderRaw.raw.find(item => item.type === "performance_table");
    if (!rawEntry || !Array.isArray(rawEntry.data)) {
      return null;
    }
    return rawEntry;
  }, [orderRaw]);

  const performanceColumns = useMemo(() => {
    const rows = performanceTable?.data ?? [];
    const columns: string[] = [];
    rows.forEach(row => {
      Object.keys(row).forEach(key => {
        if (!columns.includes(key)) {
          columns.push(key);
        }
      });
    });
    return columns;
  }, [performanceTable]);

  const hasPerformanceData =
    Boolean(performanceTable) &&
    (performanceTable?.row_count ?? 0) > 0 &&
    performanceColumns.length > 0;

  useEffect(() => {
    if (!hasPerformanceData) {
      setIsPerformanceDrawerOpen(false);
    }
  }, [hasPerformanceData]);

  const refreshActs = useCallback(() => {
    if (!projectId || !orderId) return;
    setActsState("loading");
    listActs(projectId, orderId)
      .then(data => {
        setActs(data);
        setActsState("idle");
      })
      .catch(err => {
        console.error(err);
        setActsState("error");
        setError("Не удалось загрузить акты");
      });
  }, [projectId, orderId]);

  useEffect(() => {
    refreshActs();
  }, [refreshActs]);

  const refreshTemplates = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectId || !orderId) return [];
      if (!options?.silent) {
        setTemplatesState("loading");
      }
      setTemplateError(null);
      try {
        const data = await listTemplates(projectId, orderId);
        setTemplates(data);
        setTemplatesState("idle");
        return data;
      } catch (err) {
        console.error(err);
        setTemplatesState("error");
        setTemplateError("Не удалось загрузить шаблоны");
        return [];
      }
    },
    [projectId, orderId]
  );

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  const stopTemplatePolling = useCallback(() => {
    if (templatePollIntervalRef.current) {
      clearInterval(templatePollIntervalRef.current);
      templatePollIntervalRef.current = null;
    }
  }, []);

  const startTemplatePolling = useCallback(
    (quarter: number) => {
      if (!projectId || !orderId || !selectedGroupId) return;
      const existingTemplate = templates.find(
        item => item.groupId === selectedGroupId && item.quarterYear === quarter
      );
      const baselineSignature = existingTemplate
        ? `${existingTemplate.createdAt ?? ""}|${existingTemplate.fileRef ?? ""}|${existingTemplate.fileName ?? ""}`
        : null;
      stopTemplatePolling();
      templatePollInFlightRef.current = false;
      let attempts = 0;

      const pollOnce = async () => {
        if (templatePollInFlightRef.current) return;
        templatePollInFlightRef.current = true;
        try {
          const data = await refreshTemplates({ silent: true });
          const found = data.find(
            item => item.groupId === selectedGroupId && item.quarterYear === quarter
          );
          if (found) {
            const currentSignature = `${found.createdAt ?? ""}|${found.fileRef ?? ""}|${found.fileName ?? ""}`;
            if (baselineSignature && currentSignature === baselineSignature) {
              return;
            }
            stopTemplatePolling();
            setTemplateInfo("Шаблон сформирован");
            return;
          }
          attempts += 1;
          if (attempts >= TEMPLATE_POLL_MAX_ATTEMPTS) {
            stopTemplatePolling();
            setTemplateInfo("Формирование шаблона занимает больше обычного. Обновите позже.");
          }
        } finally {
          templatePollInFlightRef.current = false;
        }
      };

      pollOnce();
      templatePollIntervalRef.current = setInterval(pollOnce, TEMPLATE_POLL_INTERVAL_MS);
    },
    [projectId, orderId, selectedGroupId, templates, refreshTemplates, stopTemplatePolling]
  );

  useEffect(() => {
    stopTemplatePolling();
    return () => stopTemplatePolling();
  }, [stopTemplatePolling, selectedGroupId, projectId, orderId]);

  useEffect(() => {
    if (!projectId || !orderId) return;
    setGroupsState("loading");
    setGroupsError(null);
    listGroups(projectId, orderId)
      .then(data => {
        setGroups(data);
        setGroupsState("idle");
        setSelectedGroupId(prev => {
          if (prev && data.some(group => group.groupId === prev)) {
            return prev;
          }
          return data[0]?.groupId ?? null;
        });
      })
      .catch(err => {
        console.error(err);
        setGroupsState("error");
        setGroupsError("Не удалось загрузить группы");
      });
  }, [projectId, orderId]);

  const refreshTasks = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectId || !orderId || !selectedGroupId) {
        setTasks([]);
        setTasksError(null);
        setTasksState("idle");
        return [];
      }
      if (!options?.silent) {
        setTasksState("loading");
      }
      setTasksError(null);
      try {
        const data = await listGroupTasks(projectId, orderId, selectedGroupId);
        setTasks(data.tasks);
        setTasksState("idle");
        return data.tasks;
      } catch (err) {
        console.error(err);
        setTasksState("error");
        setTasksError("Не удалось загрузить задачи группы");
        return [];
      }
    },
    [projectId, orderId, selectedGroupId]
  );

  const refreshStatusHistory = useCallback(async () => {
    if (!projectId || !orderId) {
      setStatusHistory([]);
      setStatusHistoryState("idle");
      setStatusHistoryError(null);
      return;
    }
    setStatusHistoryState("loading");
    setStatusHistoryError(null);
    try {
      const data = await listTaskStatusHistory(projectId, orderId);
      setStatusHistory(data);
      setStatusHistoryState("idle");
    } catch (err) {
      console.error(err);
      setStatusHistoryState("error");
      setStatusHistoryError(getApiErrorMessage(err, "Не удалось загрузить историю статусов"));
    }
  }, [projectId, orderId]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    refreshStatusHistory();
  }, [refreshStatusHistory]);

  const stopTasksPolling = useCallback(() => {
    if (tasksPollIntervalRef.current) {
      clearInterval(tasksPollIntervalRef.current);
      tasksPollIntervalRef.current = null;
    }
  }, []);

  const startTasksPolling = useCallback(() => {
    if (!projectId || !orderId || !selectedGroupId) return;
    stopTasksPolling();
    tasksPollInFlightRef.current = false;
    let attempts = 0;

    const pollOnce = async () => {
      if (tasksPollInFlightRef.current) return;
      tasksPollInFlightRef.current = true;
      try {
        await refreshTasks({ silent: true });
        attempts += 1;
        if (attempts >= TASKS_POLL_MAX_ATTEMPTS) {
          stopTasksPolling();
        }
      } finally {
        tasksPollInFlightRef.current = false;
      }
    };

    pollOnce();
    tasksPollIntervalRef.current = setInterval(pollOnce, TASKS_POLL_INTERVAL_MS);
  }, [projectId, orderId, selectedGroupId, refreshTasks, stopTasksPolling]);

  useEffect(() => {
    stopTasksPolling();
    return () => stopTasksPolling();
  }, [stopTasksPolling, selectedGroupId, projectId, orderId]);

  const resolveGroupName = useCallback(
    (groupId?: string | null) => {
      if (!groupId) {
        return "—";
      }
      const found = groups.find(group => group.groupId === groupId);
      return found?.groupName || "—";
    },
    [groups]
  );

  const getTaskStatusMeta = useCallback((status?: string | null) => {
    const base = status?.trim();
    const normalized = base?.toLowerCase();
    const defaults = {
      background: "#fee2e2",
      color: "#b91c1c",
      label: "Не выполнено",
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
        label: "Выполнено",
      };
    }
    if (normalized.includes("работ")) {
      return {
        background: "#ffedd5",
        color: "#c2410c",
        label: "В работе",
      };
    }
    return {
      background: "#e2e8f0",
      color: "#334155",
      label: base || defaults.label,
    };
  }, []);

  const getTaskProfessionalCheckedMeta = useCallback((isChecked?: boolean) => {
    if (isChecked) {
      return {
        background: "#7c3aed",
        color: "#ffffff",
        borderColor: "#7c3aed",
        label: "Проверено",
      };
    }
    return {
      background: "#ffffff",
      color: "#7c3aed",
      borderColor: "#7c3aed",
      label: "Не проверено",
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

  const formatFileName = useCallback((name?: string | null, maxLen = 22): string => {
    if (!name) return "—";
    const withoutExt = name.replace(/\.docx$/i, "");
    if (withoutExt.length <= maxLen) return withoutExt;
    return withoutExt.slice(0, maxLen) + "…";
  }, []);

  const resolveTaskDeadline = useCallback((task: TaskRecord): string | null => {
    return task.deadline ?? task.actDeadlineDate ?? null;
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

  const availableTaskQuarters = useMemo(() => {
    const quarters = new Set<string>();
    tasks.forEach(task => {
      const quarter = getQuarterKey(resolveTaskDeadline(task));
      if (quarter !== "none") {
        quarters.add(quarter);
      }
    });
    return Array.from(quarters).sort();
  }, [tasks, getQuarterKey, resolveTaskDeadline]);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let result = tasks.filter(task => {
      const byStatus =
        statusFilter === "all" || getStatusFilterKey(task.status) === statusFilter;
      const bySearch =
        query.length === 0 ||
        (task.fullName ?? "").toLowerCase().includes(query) ||
        (task.taskText ?? "").toLowerCase().includes(query);
      const byQuarter =
        tasksQuarterFilter === "all" || getQuarterKey(resolveTaskDeadline(task)) === tasksQuarterFilter;
      return byStatus && bySearch && byQuarter;
    });

    if (tasksDeadlineSort !== "none") {
      result = [...result].sort((a, b) => {
        const ad = resolveTaskDeadline(a);
        const bd = resolveTaskDeadline(b);
        const da = parseTaskDate(ad)?.getTime() ?? Infinity;
        const db = parseTaskDate(bd)?.getTime() ?? Infinity;
        return tasksDeadlineSort === "asc" ? da - db : db - da;
      });
    }

    return result;
  }, [tasks, statusFilter, searchQuery, tasksQuarterFilter, tasksDeadlineSort, getStatusFilterKey, getQuarterKey, resolveTaskDeadline, parseTaskDate]);

  const completedTasks = useMemo(
    () => tasks.filter(task => getStatusFilterKey(task.status) === "completed"),
    [tasks, getStatusFilterKey]
  );

  const completedTasksAllChecked = useMemo(
    () => completedTasks.length > 0 && completedTasks.every(task => Boolean(task.isProfessionalChecked)),
    [completedTasks]
  );

  const completedTasksToggleTargetChecked = !completedTasksAllChecked;

  const tasksTotalPages = Math.max(1, Math.ceil(filteredTasks.length / tasksPageSize));

  const paginatedTasks = useMemo(
    () => filteredTasks.slice((tasksCurrentPage - 1) * tasksPageSize, tasksCurrentPage * tasksPageSize),
    [filteredTasks, tasksCurrentPage, tasksPageSize]
  );

  useEffect(() => {
    setTasksCurrentPage(1);
  }, [statusFilter, searchQuery, tasksQuarterFilter, tasksDeadlineSort, tasksPageSize, selectedGroupId]);

  useEffect(() => {
    if (tasksCurrentPage > tasksTotalPages) {
      setTasksCurrentPage(tasksTotalPages);
    }
  }, [tasksCurrentPage, tasksTotalPages]);

  const filteredStatusHistory = useMemo(() => {
    if (!selectedGroupId) {
      return statusHistory;
    }
    return statusHistory.filter(record => (record.groupId ?? "") === selectedGroupId);
  }, [statusHistory, selectedGroupId]);

  const filteredAllActs = useMemo(() => {
    let result = acts.filter(act => {
      const byGroup = allActsGroupFilter === "all" || act.groupId === allActsGroupFilter;
      const byQuarter = allActsQuarterFilter === "all" || String(act.quarterYear) === allActsQuarterFilter;
      return byGroup && byQuarter;
    });

    result = [...result].sort((a, b) => {
      if (allActsSort === "date-desc") {
        return new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime();
      }
      if (allActsSort === "date-asc") {
        return new Date(a.uploadedAt ?? 0).getTime() - new Date(b.uploadedAt ?? 0).getTime();
      }
      if (allActsSort === "name-asc") {
        return (a.fileName ?? "").localeCompare(b.fileName ?? "", "ru");
      }
      if (allActsSort === "name-desc") {
        return (b.fileName ?? "").localeCompare(a.fileName ?? "", "ru");
      }
      return 0;
    });

    return result;
  }, [acts, allActsGroupFilter, allActsQuarterFilter, allActsSort]);

  const allActsTotalPages = Math.max(1, Math.ceil(filteredAllActs.length / allActsPageSize));

  const paginatedAllActs = useMemo(
    () => filteredAllActs.slice((allActsPage - 1) * allActsPageSize, allActsPage * allActsPageSize),
    [filteredAllActs, allActsPage, allActsPageSize]
  );

  // Сброс страницы при смене фильтров
  useEffect(() => {
    setAllActsPage(1);
  }, [allActsGroupFilter, allActsQuarterFilter, allActsSort, allActsPageSize]);

  useEffect(() => {
    if (allActsPage > allActsTotalPages) setAllActsPage(allActsTotalPages);
  }, [allActsPage, allActsTotalPages]);

  /** Метрики для нижней строки состояния: выбранная группа. */
  const orderPageStatusBar = useMemo(() => {
    if (!selectedGroupId) {
      return {
        hasGroup: false,
        acts: 0,
        templates: 0,
        tasksTotal: 0,
        notCompleted: 0,
        inProgress: 0,
        completed: 0,
        other: 0,
      };
    }
    const actsForGroup = acts.filter(a => a.groupId === selectedGroupId).length;
    const templatesForGroup = templates.filter(t => t.groupId === selectedGroupId).length;
    let notCompleted = 0;
    let inProgress = 0;
    let completed = 0;
    let other = 0;
    tasks.forEach(task => {
      const key = getStatusFilterKey(task.status);
      if (key === "not_completed") {
        notCompleted += 1;
      } else if (key === "in_progress") {
        inProgress += 1;
      } else if (key === "completed") {
        completed += 1;
      } else {
        other += 1;
      }
    });
    return {
      hasGroup: true,
      acts: actsForGroup,
      templates: templatesForGroup,
      tasksTotal: tasks.length,
      notCompleted,
      inProgress,
      completed,
      other,
    };
  }, [selectedGroupId, acts, templates, tasks, getStatusFilterKey]);

  useEffect(() => {
    const sectionIds = [
      "order-info",
      "acts-quarters",
      "tasks-group",
      "status-history",
    ];

    const onScroll = () => {
      const navOffset = 76;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= navOffset) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [groupsState, tasksState, statusHistoryState, actsState, orderRawState]);

  const handleTaskStatusChange = useCallback(
    async (taskId: number, newStatus: string) => {
      if (!projectId || !orderId) return;
      setUpdatingTaskId(taskId);
      try {
        await updateTaskStatus(projectId, orderId, taskId, newStatus);
        setTasks(prev =>
          prev.map(task => (task.taskId === taskId ? { ...task, status: newStatus } : task))
        );
        await refreshStatusHistory();
      } catch (err: unknown) {
        console.error(err);
        setTasksError(getApiErrorMessage(err, "Ошибка обновления статуса"));
      } finally {
        setUpdatingTaskId(null);
      }
    },
    [projectId, orderId, refreshStatusHistory]
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
        setTasksError(getApiErrorMessage(err, "Ошибка обновления проверки задачи"));
      } finally {
        setUpdatingTaskProfessionalCheckedId(null);
      }
    },
    [projectId, orderId]
  );

  const handleCompletedTasksProfessionalCheckedToggle = useCallback(async () => {
    if (!projectId || !orderId || bulkUpdatingProfessionalChecked) return;
    if (completedTasks.length === 0) return;

    const nextChecked = completedTasksToggleTargetChecked;
    setBulkUpdatingProfessionalChecked(true);
    setTasksError(null);

    try {
      const updateResults = await Promise.allSettled(
        completedTasks.map(task =>
          updateTaskProfessionalChecked(projectId, orderId, task.taskId, nextChecked)
        )
      );

      const updatedTaskIds = new Set<number>();
      let failedUpdates = 0;
      updateResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          updatedTaskIds.add(completedTasks[index].taskId);
          return;
        }
        failedUpdates += 1;
      });

      if (updatedTaskIds.size > 0) {
        setTasks(prev =>
          prev.map(task =>
            updatedTaskIds.has(task.taskId)
              ? { ...task, isProfessionalChecked: nextChecked }
              : task
          )
        );
      }

      if (failedUpdates > 0) {
        setTasksError(
          failedUpdates === completedTasks.length
            ? "Не удалось обновить отметку проверки для выполненных задач"
            : `Обновлено ${updatedTaskIds.size} из ${completedTasks.length} выполненных задач`
        );
      }
    } catch (err: unknown) {
      console.error(err);
      setTasksError(getApiErrorMessage(err, "Ошибка массового обновления проверки задач"));
    } finally {
      setBulkUpdatingProfessionalChecked(false);
    }
  }, [
    projectId,
    orderId,
    bulkUpdatingProfessionalChecked,
    completedTasks,
    completedTasksToggleTargetChecked,
  ]);

  const formatHistoryTime = useCallback((value?: string | null) => {
    if (!value) {
      return "—";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString("ru-RU");
  }, []);

  const handleUndoFromHistory = useCallback(
    async (record: TaskStatusHistoryRecord) => {
      if (!projectId || !orderId) return;
      const targetStatus = undoTargetByHistoryId[record.id] ?? "Не выполнено";
      setUndoInProgressHistoryId(record.id);
      try {
        await undoTaskStatus(projectId, orderId, record.taskId, targetStatus);
        await Promise.all([refreshTasks({ silent: true }), refreshStatusHistory()]);
      } catch (err) {
        console.error(err);
        setStatusHistoryError(getApiErrorMessage(err, "Ошибка отката статуса"));
      } finally {
        setUndoInProgressHistoryId(null);
      }
    },
    [projectId, orderId, undoTargetByHistoryId, refreshTasks, refreshStatusHistory]
  );

  function requestDocxFile(): Promise<File | null> {
    if (typeof window === "undefined") {
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      input.style.display = "none";
      input.onchange = () => {
        const file = input.files?.[0] ?? null;
        resolve(file);
        input.remove();
      };
      document.body.appendChild(input);
      input.click();
    });
  }

  const waitForValidation = useCallback(
    async (documentId: string): Promise<DocumentValidationStatus> => {
      let latest: DocumentValidationStatus | null = null;
      for (let attempt = 0; attempt < VALIDATION_POLL_MAX_ATTEMPTS; attempt += 1) {
        latest = await getDocumentValidation(documentId);
        if (latest.status !== "pending") {
          return latest;
        }
        await sleep(VALIDATION_POLL_INTERVAL_MS);
      }
      if (latest) {
        return latest;
      }
      return getDocumentValidation(documentId);
    },
    [VALIDATION_POLL_INTERVAL_MS, VALIDATION_POLL_MAX_ATTEMPTS]
  );

  const handleValidationOutcome = useCallback(
    (record: DocumentRecord, validation: DocumentValidationStatus) => {
      if (validation.status === "error") {
        const issues = toValidationIssues(validation);
        setValidationModal({
          tone: "error",
          title: "Акт не прошел валидацию",
          issues,
          exportFileNamePrefix: "Результат_валидации_акта",
        });
        setValidationBanner({ tone: "error", text: "Акт отклонен валидатором." });
        setActs((prev) => prev.filter((act) => act.documentId !== record.documentId));
        return;
      }

      if (validation.status === "warning") {
        const issues = toValidationIssues(validation);
        setValidationModal({
          tone: "warning",
          title: "Акт загружен с предупреждениями",
          issues,
          exportFileNamePrefix: "Результат_валидации_акта",
        });
        setValidationBanner({
          tone: "warning",
          text: "Проверка завершена с предупреждениями. Акт передан в обработку.",
        });
        startTasksPolling();
        return;
      }

      if (validation.status === "success") {
        setValidationBanner({
          tone: "success",
          text: "Ошибок не найдено. Акт передан в обработку.",
        });
        startTasksPolling();
        return;
      }

      setValidationBanner({
        tone: "info",
        text: "Проверка акта выполняется дольше обычного. Документ остается в обработке.",
      });
    },
    [startTasksPolling]
  );

  const handleQuarterUpload = useCallback(
    async (quarter: number) => {
      if (!projectId || !orderId) return;
      if (!selectedGroupId) {
        setUploadError("Сначала выберите группу");
        return;
      }
      setUploadError(null);
      setTemplateInfo(null);
      setValidationBanner(null);
      const file = await requestDocxFile();
      if (!file) {
        return;
      }
      if (!file.name.toLowerCase().endsWith(".docx")) {
        setUploadError("Допустимы только файлы .docx");
        return;
      }
      setUploadingQuarter(quarter);
      try {
        const record = await uploadAct(projectId, orderId, file, selectedGroupId, quarter);
        setActs(prev => {
          const filtered = prev.filter(
            act => !(act.groupId === record.groupId && act.quarterYear === record.quarterYear)
          );
          return [record, ...filtered];
        });
        setValidationBanner({ tone: "info", text: "Проверяем документ..." });
        void waitForValidation(record.documentId)
          .then((validation) => handleValidationOutcome(record, validation))
          .catch((validationError: unknown) => {
            console.error(validationError);
            setValidationBanner({
              tone: "warning",
              text: "Акт загружен, но не удалось получить результат валидации.",
            });
          });
      } catch (err: unknown) {
        console.error(err);
        setUploadError(getApiErrorMessage(err, "Ошибка загрузки акта"));
      } finally {
        setUploadingQuarter(null);
      }
    },
    [projectId, orderId, selectedGroupId, waitForValidation, handleValidationOutcome]
  );

  const handleTemplateGenerate = useCallback(
    async (quarter: number) => {
      if (!projectId || !orderId) return;
      if (!selectedGroupId) {
        setTemplateError("Сначала выберите группу");
        return;
      }
      setTemplateError(null);
      setTemplateInfo(null);
      setGeneratingQuarter(quarter);
      try {
        await generateTemplate(projectId, orderId, selectedGroupId, quarter);
        setTemplateInfo("Шаблон поставлен в очередь на формирование");
        startTemplatePolling(quarter);
      } catch (err: unknown) {
        console.error(err);
        setTemplateError(getApiErrorMessage(err, "Ошибка формирования шаблона"));
      } finally {
        setGeneratingQuarter(null);
      }
    },
    [projectId, orderId, selectedGroupId, startTemplatePolling]
  );

  const handleDeleteAct = useCallback(async () => {
    if (!actToDelete || !projectId || !orderId) return;
    setDeleting(true);
    try {
      await deleteAct(projectId, orderId, actToDelete.documentId);
      setActs(prev => prev.filter(act => act.documentId !== actToDelete.documentId));
      setActToDelete(null);
    } catch (err: unknown) {
      console.error(err);
      alert(getApiErrorMessage(err, "Не удалось удалить акт"));
    } finally {
      setDeleting(false);
    }
  }, [actToDelete, projectId, orderId]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!templateToDelete || !projectId || !orderId) return;
    setDeletingTemplate(true);
    try {
      await deleteTemplate(projectId, orderId, templateToDelete.id);
      setTemplates(prev => prev.filter(template => template.id !== templateToDelete.id));
      setTemplateToDelete(null);
      setTemplateInfo("Шаблон удален");
      setTemplateError(null);
    } catch (err: unknown) {
      console.error(err);
      alert(getApiErrorMessage(err, "Не удалось удалить шаблон"));
    } finally {
      setDeletingTemplate(false);
    }
  }, [templateToDelete, projectId, orderId]);

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

  const completedTasksToggleMeta = getTaskProfessionalCheckedMeta(completedTasksToggleTargetChecked);

  const completedTasksBulkTitle = (() => {
    const expl =
      "Массово меняет отметку «Проверено» / «Не проверено» только у задач со статусом «Выполнено» в выбранной группе. Остальные задачи не затрагивает.";
    if (!selectedGroupId) {
      return `${expl} Сначала выберите группу.`;
    }
    if (tasksState === "loading") {
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

  return (
    <div className="order-page">
      <Link to={`/projects/${projectId}`} className="back-link">
        ← Назад к проекту
      </Link>
      <h1 className="page-title">Приказ "{order?.fileName}"</h1>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#edf1f7",
          padding: "10px 16px",
          marginBottom: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", lineHeight: 1.2 }}>
            {project?.name}
          </span>
          {project?.createdAt && (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Год: {new Date(project.createdAt).getFullYear()}
            </span>
          )}
        </div>
        <Link
          to={`/projects/${projectId}/${orderId}/tasks`}
          style={{
            padding: "7px 16px",
            borderRadius: 8,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            textDecoration: "none",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
        >
          Все задачи приказа ↗
        </Link>
        <div style={{ width: 1, height: 24, background: "#cbd5e1", margin: "0 4px", flexShrink: 0 }} />
        {([
          ["order-info", "Информация"],
          ["acts-quarters", "Акты"],
          ["tasks-group", "Задачи группы"],
          ["status-history", "История статусов"],
        ] as const).map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: activeSection === id ? "#dbeafe" : "transparent",
              color: activeSection === id ? "#1d4ed8" : "#475569",
              fontWeight: activeSection === id ? 700 : 600,
              fontSize: 16,
              textDecoration: "none",
              border: activeSection === id ? "1px solid #bfdbfe" : "1px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {label}
          </a>
        ))}
      </div>

      <div className="card" id="order-info">
        <h3 style={{ marginTop: 0 }}>Информация о приказе</h3>
        {orderState === "loading" && <div>Загрузка приказа...</div>}
        {orderState === "error" && <div style={{ color: "crimson" }}>{error}</div>}
        {order && (
          <div className="order-info-table-wrap">
            <table className="order-info-table">
              <thead>
                <tr>
                  <th>Файл</th>
                  <th>Статус</th>
                  <th>Дата загрузки</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="order-info-file-cell">
                      <div className="order-info-file-name">{order.fileName}</div>
                    </div>
                  </td>
                  <td>
                    <span className="status-badge">{getDocumentStatusLabel(order.status)}</span>
                  </td>
                  <td>{order.uploadedAt ? new Date(order.uploadedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" id="acts-quarters">
        {/* Шапка с вкладками и кнопкой обновить */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, borderBottom: "2px solid #e2e8f0", paddingBottom: 0 }}>
          <div style={{ display: "flex", gap: 0 }}>
            {(["by-group", "all"] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActsBlockTab(tab)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: actsBlockTab === tab ? "2px solid #2563eb" : "2px solid transparent",
                  color: actsBlockTab === tab ? "#2563eb" : "#64748b",
                  fontWeight: actsBlockTab === tab ? 700 : 400,
                  fontSize: 15,
                  padding: "0 20px 14px",
                  cursor: "pointer",
                  borderRadius: 0,
                  marginBottom: -2,
                  transition: "all 0.15s",
                }}
              >
                {tab === "by-group" ? "Акты по группе" : "Все акты"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => { refreshActs(); refreshTemplates(); }}
            disabled={actsState === "loading" || templatesState === "loading"}
            style={{ marginBottom: 14 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Обновить
          </button>
        </div>

        {/* ===== ВКЛАДКА 1: Акты по группе ===== */}
        {actsBlockTab === "by-group" && (
          <>
            {groupsState === "loading" && <div>Загрузка групп...</div>}
            {groupsState === "error" && <div style={{ color: "crimson" }}>{groupsError}</div>}
            {groupsState === "idle" && groups.length === 0 && (
              <div className="empty-state">Группы еще не обнаружены. Дождитесь завершения обработки приказа.</div>
            )}
            {groupsState === "idle" && groups.length > 0 && (
              <>
                <label className="form-field order-group-selector" style={{ marginBottom: 24 }}>
                  <span className="form-field-label">Группа</span>
                  <select
                    className="form-control group-name-selector"
                    value={selectedGroupId ?? ""}
                    onChange={event => {
                      setUploadError(null);
                      setSelectedGroupId(event.target.value || null);
                    }}
                  >
                    {!selectedGroupId && <option value="" disabled>Выберите группу</option>}
                    {groups.map(group => (
                      <option key={group.groupId} value={group.groupId}>
                        {group.groupName || group.groupId}
                      </option>
                    ))}
                  </select>
                </label>

                {templatesState === "loading" && <div>Загрузка шаблонов...</div>}

                {/* Таймлайн */}
                <div style={{ display: "flex", alignItems: "stretch", justifyContent: "space-between", position: "relative", marginBottom: 24 }}>
                  {/* Линия таймлайна */}
                  <div style={{
                    position: "absolute",
                    top: 18,
                    left: "12.5%",
                    right: "12.5%",
                    height: 2,
                    background: "#dbeafe",
                    zIndex: 0,
                  }} />
                  {[1, 2, 3, 4].map(quarter => {
                    const act = acts.find(item => item.groupId === selectedGroupId && item.quarterYear === quarter);
                    const template = templates.find(item => item.groupId === selectedGroupId && item.quarterYear === quarter);
                    const hasBoth = Boolean(act) && Boolean(template);
                    const hasOne = Boolean(act) || Boolean(template);

                    const dotColor = hasBoth ? "#16a34a" : hasOne ? "#f59e0b" : "#cbd5e1";
                    const dotBg = hasBoth ? "#dcfce7" : hasOne ? "#fef9c3" : "#f1f5f9";

                    const statusLabel = hasBoth ? "Готово" : act ? "Есть акт" : template ? "Есть шаблон" : "Нет данных";
                    const statusColor = hasBoth ? "#16a34a" : hasOne ? "#d97706" : "#94a3b8";
                    const statusBg = hasBoth ? "#dcfce7" : hasOne ? "#fef9c3" : "#f1f5f9";
                    const cardBorder = hasBoth ? "#bbf7d0" : hasOne ? "#fde68a" : "#e2e8f0";
                    const cardBg = hasBoth ? "#f0fdf4" : hasOne ? "#fffbeb" : "#fafafa";

                    return (
                      <div key={quarter} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1, minWidth: 0 }}>
                        {/* Точка таймлайна */}
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: dotBg,
                          border: `2px solid ${dotColor}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 8,
                          flexShrink: 0,
                        }}>
                          {hasBoth ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dotColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : null}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 10 }}>{quarter}-й квартал</span>

                        {/* Карточка квартала */}
                        <div style={{
                          width: "calc(100% - 12px)",
                          flex: 1,
                          border: `1px solid ${cardBorder}`,
                          borderRadius: 12,
                          background: cardBg,
                          padding: "12px 12px 10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 0,
                        }}>
                          {/* Статус-бейдж */}
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "3px 12px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 600,
                              background: statusBg,
                              color: statusColor,
                              border: `1px solid ${cardBorder}`,
                            }}>
                              {statusLabel}
                            </span>
                          </div>

                          {/* Акт */}
                          <div style={{ marginBottom: 10, minHeight: 95}}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Акт</div>
                            {act ? (
                              <>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                  </svg>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={act.fileName?.replace(/\.docx$/i, "")}>
                                    {formatFileName(act.fileName)}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                                  {act.uploadedAt ? new Date(act.uploadedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  {act.fileRef ? (
                                    <a href={act.fileRef} target="_blank" rel="noreferrer" title="Скачать акт" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#16a34a", textDecoration: "none" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    </a>
                                  ) : null}
                                  <button type="button" title="Удалить акт" onClick={e => { e.preventDefault(); e.stopPropagation(); setActToDelete(act); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#ef4444", padding: 0 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M9 6V4h6v2"/></svg>
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div style={{ color: "#94a3b8", fontSize: 13 }}>—<br/><span style={{ fontSize: 11 }}>Не загружен</span></div>
                            )}
                          </div>

                          {/* Разделитель */}
                          <div style={{ borderTop: "1px solid #e2e8f0", margin: "4px 0 10px" }} />

                          {/* Шаблон */}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Шаблон</div>
                            {template ? (
                              <>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                  </svg>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={template.fileName?.replace(/\.docx$/i, "")}>
                                    {formatFileName(template.fileName)}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                                  {template.createdAt ? new Date(template.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  {template.fileRef ? (
                                    <a href={template.fileRef} target="_blank" rel="noreferrer" title="Скачать шаблон" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#16a34a", textDecoration: "none" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    </a>
                                  ) : null}
                                  <button type="button" title="Удалить шаблон" onClick={e => { e.preventDefault(); e.stopPropagation(); setTemplateToDelete(template); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#ef4444", padding: 0 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M9 6V4h6v2"/></svg>
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div style={{ color: "#94a3b8", fontSize: 13 }}>—<br/><span style={{ fontSize: 11 }}>Не сформирован</span></div>
                            )}
                          </div>

                          {/* Кнопки действий — всегда активны */}
                          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleQuarterUpload(quarter)}
                              disabled={!selectedGroupId || uploadingQuarter === quarter}
                              style={{ fontSize: 13, padding: "8px 10px" }}
                            >
                              {uploadingQuarter === quarter ? "Загрузка..." : "Загрузить акт"}
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => handleTemplateGenerate(quarter)}
                              disabled={!selectedGroupId || generatingQuarter === quarter}
                              style={{ fontSize: 13, padding: "8px 10px" }}
                            >
                              {generatingQuarter === quarter ? "Формируем..." : "Сформировать шаблон"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {uploadError && <div style={{ color: "crimson", marginTop: 8 }}>{uploadError}</div>}
                {validationBanner && (
                  <div className={`validation-banner validation-banner--${validationBanner.tone}`}>
                    {validationBanner.text}
                  </div>
                )}
                {templateError && <div style={{ color: "crimson", marginTop: 8 }}>{templateError}</div>}
                {templateInfo && <div style={{ color: "#16a34a", marginTop: 8 }}>{templateInfo}</div>}
              </>
            )}
          </>
        )}

        {/* ===== ВКЛАДКА 2: Все акты ===== */}
        {actsBlockTab === "all" && (
          <>
            {/* Фильтры */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
              <label className="form-field" style={{ minWidth: 180 }}>
                <span className="form-field-label">Группа</span>
                <select className="form-control" value={allActsGroupFilter} onChange={e => setAllActsGroupFilter(e.target.value)}>
                  <option value="all">Все группы</option>
                  {groups.map(g => (
                    <option key={g.groupId} value={g.groupId}>{g.groupName || g.groupId}</option>
                  ))}
                </select>
              </label>
              <label className="form-field" style={{ minWidth: 160 }}>
                <span className="form-field-label">Квартал</span>
                <select className="form-control" value={allActsQuarterFilter} onChange={e => setAllActsQuarterFilter(e.target.value)}>
                  <option value="all">Все кварталы</option>
                  <option value="1">1-й квартал</option>
                  <option value="2">2-й квартал</option>
                  <option value="3">3-й квартал</option>
                  <option value="4">4-й квартал</option>
                </select>
              </label>
              <label className="form-field" style={{ minWidth: 200 }}>
                <span className="form-field-label">Сортировка</span>
                <select className="form-control" value={allActsSort} onChange={e => setAllActsSort(e.target.value as typeof allActsSort)}>
                  <option value="date-desc">Дата загрузки (новые)</option>
                  <option value="date-asc">Дата загрузки (старые)</option>
                  <option value="name-asc">По алфавиту (А→Я)</option>
                  <option value="name-desc">По алфавиту (Я→А)</option>
                </select>
              </label>
            </div>

            {actsState === "loading" && <div>Загрузка актов...</div>}
            {actsState === "error" && <div style={{ color: "crimson" }}>{error}</div>}
            {actsState === "idle" && acts.length === 0 && (
              <div className="empty-state">Акты еще не загружены.</div>
            )}
            {actsState === "idle" && acts.length > 0 && filteredAllActs.length === 0 && (
              <div className="empty-state">По заданным фильтрам ничего не найдено.</div>
            )}

            {actsState === "idle" && filteredAllActs.length > 0 && (
              <>
                <table className="acts-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", paddingLeft: 8 }}>Файл</th>
                      <th>Группа</th>
                      <th>Квартал</th>
                      <th>Дата загрузки</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAllActs.map(act => (
                      <tr key={act.documentId}>
                        <td style={{ textAlign: "left", paddingLeft: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <span style={{ fontWeight: 500, fontSize: 14 }} title={act.fileName ?? ""}>
                              {formatFileName(act.fileName, 30)}
                            </span>
                          </div>
                        </td>
                        <td>{resolveGroupName(act.groupId)}</td>
                        <td>{act.quarterYear ?? "—"}</td>
                        <td>{act.uploadedAt ? new Date(act.uploadedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                            {act.fileRef ? (
                              <a href={act.fileRef} target="_blank" rel="noreferrer" title="Скачать акт" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#16a34a", textDecoration: "none" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              </a>
                            ) : <span style={{ color: "#94a3b8" }}>—</span>}
                            <button type="button" title="Удалить акт" onClick={e => { e.preventDefault(); e.stopPropagation(); setActToDelete(act); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#ef4444", padding: 0 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Пагинация вкладки "Все акты" */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    Записей на странице:
                    <select
                      className="form-control"
                      style={{ width: "auto", padding: "2px 6px" }}
                      value={allActsPageSize}
                      onChange={e => setAllActsPageSize(Number(e.target.value))}
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                    </select>
                  </label>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={allActsPage === 1} onClick={() => { setAllActsPage(1); document.getElementById("acts-quarters")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>«</button>
                    <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={allActsPage === 1} onClick={() => { setAllActsPage(p => Math.max(1, p - 1)); document.getElementById("acts-quarters")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>‹</button>
                    <span style={{ fontSize: 13, minWidth: 80, textAlign: "center" }}>Стр. {allActsPage} из {allActsTotalPages}</span>
                    <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={allActsPage === allActsTotalPages} onClick={() => { setAllActsPage(p => Math.min(allActsTotalPages, p + 1)); document.getElementById("acts-quarters")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>›</button>
                    <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={allActsPage === allActsTotalPages} onClick={() => { setAllActsPage(allActsTotalPages); document.getElementById("acts-quarters")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>»</button>
                  </div>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    Показано {(allActsPage - 1) * allActsPageSize + 1}–{Math.min(allActsPage * allActsPageSize, filteredAllActs.length)} из {filteredAllActs.length}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {groupsState === "idle" && groups.length > 0 && (
        <div className="card" id="tasks-group">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Задачи группы</h3>
            <button
              type="button"
              className="secondary"
              onClick={() => refreshTasks()}
              disabled={tasksState === "loading"}
            >
              Обновить
            </button>
          </div>
          <div className="tasks-filters">
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
            <label className="form-field">
              <span className="form-field-label">Квартал</span>
              <select
                className="form-control"
                value={tasksQuarterFilter}
                onChange={e => setTasksQuarterFilter(e.target.value)}
              >
                <option value="all">Все кварталы</option>
                {availableTaskQuarters.map(quarter => (
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
                value={tasksDeadlineSort}
                onChange={e => setTasksDeadlineSort(e.target.value as "none" | "asc" | "desc")}
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
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск по ФИО или задаче"
              />
            </label>
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
                title={completedTasksBulkTitle}
              >
                <button
                  type="button"
                  onClick={handleCompletedTasksProfessionalCheckedToggle}
                  disabled={
                    bulkUpdatingProfessionalChecked ||
                    tasksState !== "idle" ||
                    !selectedGroupId ||
                    completedTasks.length === 0
                  }
                  aria-label={completedTasksBulkTitle}
                  title={completedTasksBulkTitle}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    backgroundColor: completedTasksToggleMeta.background,
                    color: completedTasksToggleMeta.color,
                    border: `1px solid ${completedTasksToggleMeta.borderColor}`,
                    cursor:
                      bulkUpdatingProfessionalChecked ||
                      tasksState !== "idle" ||
                      !selectedGroupId ||
                      completedTasks.length === 0
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      bulkUpdatingProfessionalChecked ||
                      tasksState !== "idle" ||
                      !selectedGroupId ||
                      completedTasks.length === 0
                        ? 0.6
                        : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {bulkUpdatingProfessionalChecked
                    ? "Сохранение..."
                    : completedTasksToggleTargetChecked
                      ? "Сменить статус на Проверено"
                      : "Сменить статус на Не проверено"}
                </button>
              </div>
            </div>
          </div>
          {tasksState === "loading" && <div>Загрузка задач...</div>}
          {tasksState === "error" && (
            <div style={{ color: "crimson" }}>{tasksError ?? "Ошибка загрузки задач"}</div>
          )}
          {tasksState === "idle" && tasks.length === 0 && (
            <div className="empty-state">Задачи для этой группы пока не обнаружены.</div>
          )}
          {tasksState === "idle" && tasks.length > 0 && filteredTasks.length === 0 && (
            <div className="empty-state">По заданным фильтрам ничего не найдено.</div>
          )}
          {tasksState === "idle" && filteredTasks.length > 0 && (
            <>
              <table className="acts-table">
                <thead>
                  <tr>
                    <th>ФИО</th>
                    <th>Задача</th>
                    <th>Ед. измерения</th>
                    <th>Срок выполнения</th>
                    <th style={{ width: 220 }}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTasks.map(task => {
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
                    const isReportExpanded = expandedReportTaskId === task.taskId;
                    return (
                      <Fragment key={task.taskId}>
                        <tr>
                          <td>{task.fullName || "—"}</td>
                          <td>
                            <TaskTextWithReportToggle
                              taskText={task.taskText}
                              reportText={task.taskReport}
                              annotationText={task.actTaskAnnotation}
                              expanded={isReportExpanded}
                              onToggle={() =>
                                setExpandedReportTaskId(prev =>
                                  prev === task.taskId ? null : task.taskId
                                )
                              }
                            />
                          </td>
                          <td>{task.units || "—"}</td>
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
                                  onChange={e => handleTaskStatusChange(task.taskId, e.target.value)}
                                  disabled={isUpdating || !selectedGroupId}
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
                                  disabled={isUpdatingProfessionalChecked || !selectedGroupId}
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
                            colSpan={5}
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
                    value={tasksPageSize}
                    onChange={e => setTasksPageSize(Number(e.target.value))}
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
                    disabled={tasksCurrentPage === 1}
                    onClick={() => setTasksCurrentPage(1)}
                  >
                    «
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: "4px 10px", fontSize: 13 }}
                    disabled={tasksCurrentPage === 1}
                    onClick={() => setTasksCurrentPage(p => Math.max(1, p - 1))}
                  >
                    ‹
                  </button>
                  <span style={{ fontSize: 13, minWidth: 80, textAlign: "center" }}>
                    Стр. {tasksCurrentPage} из {tasksTotalPages}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: "4px 10px", fontSize: 13 }}
                    disabled={tasksCurrentPage === tasksTotalPages}
                    onClick={() => setTasksCurrentPage(p => Math.min(tasksTotalPages, p + 1))}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: "4px 10px", fontSize: 13 }}
                    disabled={tasksCurrentPage === tasksTotalPages}
                    onClick={() => setTasksCurrentPage(tasksTotalPages)}
                  >
                    »
                  </button>
                </div>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  Показано {(tasksCurrentPage - 1) * tasksPageSize + 1}
                  –{Math.min(tasksCurrentPage * tasksPageSize, filteredTasks.length)} из {filteredTasks.length}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card" id="status-history">
        <div className="card-header-row">
          <div>
            <h3 style={{ margin: 0 }}>История изменения статусов задач</h3>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => refreshStatusHistory()}
            disabled={statusHistoryState === "loading"}
          >
            Обновить
          </button>
        </div>
        {statusHistoryState === "loading" && <div>Загрузка истории...</div>}
        {statusHistoryState === "error" && (
          <div style={{ color: "crimson" }}>{statusHistoryError ?? "Ошибка загрузки истории"}</div>
        )}
        {statusHistoryState === "idle" && filteredStatusHistory.length === 0 && (
          <div className="empty-state">История изменений пока пуста.</div>
        )}
        {statusHistoryState === "idle" && filteredStatusHistory.length > 0 && (
          <div className="status-history-panel">
            {filteredStatusHistory.map(record => {
              const targetStatus = undoTargetByHistoryId[record.id] ?? "Не выполнено";
              const undoBusy = undoInProgressHistoryId === record.id;
              const oldMeta = getTaskStatusMeta(record.oldStatus);
              const newMeta = getTaskStatusMeta(record.newStatus);
              const sourceAuto = record.source === "auto";
              return (
                <article key={record.id} className={statusHistoryCardClassFromNewStatus(record.newStatus)}>
                  <div className="status-history-card__top">
                    <div>
                      <p className="status-history-card__time">
                        {formatHistoryTime(record.changedAt)}
                        <span>Задача № {record.taskId}</span>
                      </p>
                    </div>
                    <span
                      className={
                        sourceAuto
                          ? "status-history-source-badge status-history-source-badge--auto"
                          : "status-history-source-badge"
                      }
                      title={sourceAuto ? "Изменено при обработке акта" : "Изменено в интерфейсе"}
                    >
                      {sourceAuto ? "Авто" : "Вручную"}
                    </span>
                  </div>

                  <div className="status-history-transition">
                    <span
                      className="status-history-pill"
                      style={{
                        background: oldMeta.background,
                        color: oldMeta.color,
                        border: `1px solid ${oldMeta.color}`,
                      }}
                    >
                      {record.oldStatus || "—"}
                    </span>
                    <span className="status-history-arrow" aria-hidden>
                      →
                    </span>
                    <span
                      className="status-history-pill"
                      style={{
                        background: newMeta.background,
                        color: newMeta.color,
                        border: `1px solid ${newMeta.color}`,
                      }}
                    >
                      {record.newStatus || "—"}
                    </span>
                  </div>

                  <dl className="status-history-dl">
                    <div>
                      <dt>ФИО</dt>
                      <dd>{record.fullName || "—"}</dd>
                    </div>
                    <div>
                      <dt>Группа</dt>
                      <dd>{resolveGroupName(record.groupId || undefined)}</dd>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <dt>Задача</dt>
                      <dd>{record.taskText || "—"}</dd>
                    </div>
                  </dl>

                  <div className="status-history-card__change">
                    <div className="status-history-card__change-controls">
                      <select
                        className="form-control"
                        aria-label="Целевой статус задачи"
                        value={targetStatus}
                        onChange={e =>
                          setUndoTargetByHistoryId(prev => ({
                            ...prev,
                            [record.id]: e.target.value,
                          }))
                        }
                        disabled={undoBusy}
                      >
                        <option value="Не выполнено">Не выполнено</option>
                        <option value="В работе">В работе</option>
                        <option value="Выполнено">Выполнено</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleUndoFromHistory(record)}
                        disabled={undoBusy}
                        title={`Установить статус "${targetStatus}" для этой задачи`}
                      >
                        {undoBusy ? "Применение..." : `Изменить на "${targetStatus}"`}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {actToDelete && (
        <div className="modal-overlay" onClick={() => setActToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение удаления</h3>
            <p>Вы уверены, что хотите удалить акт <strong>{actToDelete.fileName}</strong>?</p>
            <p style={{ fontSize: 14, color: "#94a3b8" }}>Это действие нельзя отменить.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button
                type="button"
                className="delete-confirm-button"
                onClick={handleDeleteAct}
                disabled={deleting}
              >
                {deleting ? "Удаление..." : "Удалить"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setActToDelete(null)}
                disabled={deleting}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {templateToDelete && (
        <div className="modal-overlay" onClick={() => setTemplateToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение удаления</h3>
            <p>Вы уверены, что хотите удалить шаблон <strong>{templateToDelete.fileName}</strong>?</p>
            <p style={{ fontSize: 14, color: "#94a3b8" }}>Это действие нельзя отменить.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button
                type="button"
                className="delete-confirm-button"
                onClick={handleDeleteTemplate}
                disabled={deletingTemplate}
              >
                {deletingTemplate ? "Удаление..." : "Удалить"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setTemplateToDelete(null)}
                disabled={deletingTemplate}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {validationModal && (
        <ValidationIssuesModal
          tone={validationModal.tone}
          title={validationModal.title}
          issues={validationModal.issues}
          exportFileNamePrefix={validationModal.exportFileNamePrefix}
          onClose={() => setValidationModal(null)}
        />
      )}

      {orderState === "idle" && order && (
        <StatusBar multiline>
          {!orderPageStatusBar.hasGroup ? (
            <span>Выберите группу — сводка по актам, шаблонам и задачам для неё.</span>
          ) : (
            <>
              <span>
                Акты: <strong>{orderPageStatusBar.acts}</strong>
              </span>
              <StatusBarDot />
              <span>
                Шаблоны: <strong>{orderPageStatusBar.templates}</strong>
              </span>
              <StatusBarDot />
              <span>
                Задач всего: <strong>{orderPageStatusBar.tasksTotal}</strong>
              </span>
              <StatusBarDot />
              <span style={{ color: "#64748b" }}>
                Не выполнено: <strong>{orderPageStatusBar.notCompleted}</strong>
              </span>
              <StatusBarDot />
              <span style={{ color: "#a1781e" }}>
                В работе: <strong>{orderPageStatusBar.inProgress}</strong>
              </span>
              <StatusBarDot />
              <span style={{ color: "#288d4f" }}>
                Выполнено: <strong>{orderPageStatusBar.completed}</strong>
              </span>
              {orderPageStatusBar.other > 0 && (
                <>
                  <StatusBarDot />
                  <span style={{ color: "#4f46e5" }}>
                    Другое: <strong>{orderPageStatusBar.other}</strong>
                  </span>
                </>
              )}
            </>
          )}
        </StatusBar>
      )}

      <div
        id="performance-section"
        className={`order-performance-drawer ${isPerformanceDrawerOpen ? "order-performance-drawer--open" : ""}`}
      >
        <div className="order-performance-drawer-rail">
          <button
            type="button"
            className="order-performance-drawer-toggle"
            onClick={() => setIsPerformanceDrawerOpen(prev => !prev)}
            disabled={!hasPerformanceData}
            title={
              hasPerformanceData
                ? isPerformanceDrawerOpen
                  ? "Скрыть показатели эффективности"
                  : "Показать показатели эффективности"
                : "Таблица показателей эффективности не найдена"
            }
            aria-label={
              hasPerformanceData
                ? isPerformanceDrawerOpen
                  ? "Скрыть показатели эффективности"
                  : "Показать показатели эффективности"
                : "Таблица показателей эффективности не найдена"
            }
          >
            <svg
              className={`order-performance-drawer-chevron ${isPerformanceDrawerOpen ? "order-performance-drawer-chevron--open" : ""}`}
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M14 7l-5 5 5 5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <aside className="order-performance-drawer-panel">
          <div className="order-performance-drawer-header">
            <h3>Показатели эффективности</h3>
            <span>{performanceTable?.row_count ?? 0} строк</span>
          </div>
          {orderRawState === "loading" && <p>Загрузка таблицы...</p>}
          {orderRawState === "error" && (
            <p className="order-performance-drawer-error">
              Не удалось загрузить таблицу показателей.
            </p>
          )}
          {orderRawState === "idle" && !hasPerformanceData && (
            <p>Таблица показателей эффективности не найдена.</p>
          )}
          {orderRawState === "idle" && hasPerformanceData && (
            <div className="order-performance-drawer-table-wrap">
              <table className="order-performance-drawer-table">
                <thead>
                  <tr>
                    {performanceColumns.map(column => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(performanceTable?.data ?? []).map((row, index) => (
                    <tr key={index}>
                      {performanceColumns.map(column => (
                        <td key={`${index}-${column}`}>{row[column] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </aside>
        </div>
      </div>
    </div>
  );
}

