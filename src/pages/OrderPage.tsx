import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  deleteAct,
  generateTemplate,
  getDocumentValidation,
  getOrder,
  getProject,
  listActs,
  listGroupTasks,
  listGroups,
  listTemplates,
  updateTaskStatus,
  updateTaskProfessionalChecked,
  uploadAct,
} from "../api/projects";
import { getApiErrorMessage } from "../utils/error";
import { toValidationIssues } from "../utils/validationIssues";
import ValidationIssuesModal from "../components/ValidationIssuesModal";
import type {
  DocumentRecord,
  DocumentValidationStatus,
  GroupRecord,
  Project,
  TemplateRecord,
  TaskRecord,
  ValidationIssue,
} from "../types";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function OrderPage() {
  const { projectId, orderId } = useParams<{ projectId: string; orderId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [order, setOrder] = useState<DocumentRecord | null>(null);
  const [acts, setActs] = useState<DocumentRecord[]>([]);
  const [orderState, setOrderState] = useState<LoadState>("loading");
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
  const [allGroupTasks, setAllGroupTasks] = useState<TaskRecord[]>([]);
  const [tasksState, setTasksState] = useState<LoadState>("idle");
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updatingTaskProfessionalCheckedId, setUpdatingTaskProfessionalCheckedId] = useState<number | null>(null);
  const [actToDelete, setActToDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [tasksCurrentPage, setTasksCurrentPage] = useState<number>(1);
  const [tasksPageSize, setTasksPageSize] = useState<number>(5);
  const [tasksDeadlineSort, setTasksDeadlineSort] = useState<"none" | "asc" | "desc">("none");
  const [tasksQuarterFilter, setTasksQuarterFilter] = useState<string>("all");
  const [tasksGroupFilter, setTasksGroupFilter] = useState<string>("all");
  const [actsCollapsed, setActsCollapsed] = useState<boolean>(false);
  const [actsGroupFilter, setActsGroupFilter] = useState<string>("all");
  const [actsQuarterFilter, setActsQuarterFilter] = useState<string>("all");
  const [actsSortField, setActsSortField] = useState<"fileName" | "quarterYear" | "uploadedAt">("uploadedAt");
  const [actsSortDir, setActsSortDir] = useState<"asc" | "desc">("desc");
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
      if (!projectId || !orderId || groups.length === 0) {
        setTasks([]);
        setAllGroupTasks([]);
        setTasksError(null);
        setTasksState("idle");
        return [];
      }
      if (!options?.silent) {
        setTasksState("loading");
      }
      setTasksError(null);
      try {
        const allResponses = await Promise.all(
          groups.map(group => listGroupTasks(projectId, orderId, group.groupId))
        );
        const all = allResponses.flatMap(r => r.tasks);
        setAllGroupTasks(all);
        const selected = selectedGroupId
          ? all.filter(t => t.groupId === selectedGroupId)
          : all;
        setTasks(selected);
        setTasksState("idle");
        return selected;
      } catch (err) {
        console.error(err);
        setTasksState("error");
        setTasksError("Не удалось загрузить задачи группы");
        return [];
      }
    },
    [projectId, orderId, groups, selectedGroupId]
  );

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

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


  const handleTaskStatusChange = useCallback(
    async (taskId: number, newStatus: string) => {
      if (!projectId || !orderId) return;
      setUpdatingTaskId(taskId);
      try {
        await updateTaskStatus(projectId, orderId, taskId, newStatus);
        setTasks(prev =>
          prev.map(task => (task.taskId === taskId ? { ...task, status: newStatus } : task))
        );
        setAllGroupTasks(prev =>
          prev.map(task => (task.taskId === taskId ? { ...task, status: newStatus } : task))
        );
      } catch (err: unknown) {
        console.error(err);
        setTasksError(getApiErrorMessage(err, "Ошибка обновления статуса"));
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
        setAllGroupTasks(prev =>
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

  const filteredActs = useMemo(() => {
    let result = acts.filter(act => {
      const byGroup = actsGroupFilter === "all" || act.groupId === actsGroupFilter;
      const byQuarter = actsQuarterFilter === "all" || String(act.quarterYear) === actsQuarterFilter;
      return byGroup && byQuarter;
    });
    result = [...result].sort((a, b) => {
      let valA: string | number = "";
      let valB: string | number = "";
      if (actsSortField === "fileName") {
        valA = a.fileName ?? "";
        valB = b.fileName ?? "";
      } else if (actsSortField === "quarterYear") {
        valA = a.quarterYear ?? 0;
        valB = b.quarterYear ?? 0;
      } else {
        valA = a.uploadedAt ?? "";
        valB = b.uploadedAt ?? "";
      }
      if (valA < valB) return actsSortDir === "asc" ? -1 : 1;
      if (valA > valB) return actsSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [acts, actsGroupFilter, actsQuarterFilter, actsSortField, actsSortDir]);

  const getQuarterKey = useCallback((deadline?: string | null): string => {
    if (!deadline) return "none";
    const d = new Date(deadline);
    if (isNaN(d.getTime())) return "none";
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  }, []);

  const availableTaskQuarters = useMemo(() => {
    const set = new Set<string>();
    allGroupTasks.forEach(t => {
      const q = getQuarterKey(t.deadline);
      if (q !== "none") set.add(q);
    });
    return Array.from(set).sort();
  }, [allGroupTasks, getQuarterKey]);

  const filteredGroupTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let result = allGroupTasks.filter(task => {
      const byStatus = statusFilter === "all" || getStatusFilterKey(task.status) === statusFilter;
      const bySearch =
        query.length === 0 ||
        (task.fullName ?? "").toLowerCase().includes(query) ||
        (task.taskText ?? "").toLowerCase().includes(query);
      const byQuarter = tasksQuarterFilter === "all" || getQuarterKey(task.deadline) === tasksQuarterFilter;
      const byGroup = tasksGroupFilter === "all" || task.groupId === tasksGroupFilter;
      return byStatus && bySearch && byQuarter && byGroup;
    });
    if (tasksDeadlineSort !== "none") {
      result = [...result].sort((a, b) => {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return tasksDeadlineSort === "asc" ? da - db : db - da;
      });
    }
    return result;
  }, [allGroupTasks, statusFilter, searchQuery, tasksQuarterFilter, tasksDeadlineSort, tasksGroupFilter, getStatusFilterKey, getQuarterKey]);

  useEffect(() => {
    setTasksCurrentPage(1);
  }, [filteredGroupTasks]);

  const tasksTotalPages = Math.max(1, Math.ceil(filteredGroupTasks.length / tasksPageSize));

  const paginatedGroupTasks = useMemo(
    () => filteredGroupTasks.slice((tasksCurrentPage - 1) * tasksPageSize, tasksCurrentPage * tasksPageSize),
    [filteredGroupTasks, tasksCurrentPage, tasksPageSize]
  );

  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    const sectionIds = ["order-info", "acts-quarters", "tasks-group", "acts-list"];

    const onScroll = () => {
      const navHeight = 60;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= navHeight + 8) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [groupsState]);

  if (!projectId || !orderId) {
    return (
      <div className="card" id="order-info">
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
      <Link to={`/projects/${projectId}`} className="back-link">
        ← Назад к проекту
      </Link>
      <h1 className="page-title">Приказ "{order?.fileName}"</h1>
       <div style={{
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
      }}>

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

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
          <Link
            to={`/projects/${projectId}/${orderId}/tasks`}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
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
             ["acts-quarters", "Акты по кварталам"],
             ["tasks-group", "Задачи группы"],
             ["acts-list", "Список актов"],
          ] as const).map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                background: activeSection === id ? "#dbeafe" : "transparent",
                color: activeSection === id ? "#1d4ed8" : "#475569",
                fontWeight: activeSection === id ? 600 : 400,
                fontSize: 14,
                textDecoration: "none",
                border: activeSection === id ? "1px solid #bfdbfe" : "1px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {label}
            </a>
          ))}
         </div>
       </div>

      <div className="card" id="order-info">
        <h3 style={{ marginTop: 0 }}>Информация о приказе</h3>
        {orderState === "loading" && <div>Загрузка приказа...</div>}
        {orderState === "error" && <div style={{ color: "crimson" }}>{error}</div>}
        {order && (
          <div className="order-meta">
            <div>
              <span>Файл</span>
              {order.fileName}
            </div>
            <div>
              <span>Статус</span>
              <span className="status-badge">{order.status}</span>
            </div>
            <div>
              <span>Загружено</span>
              {order.uploadedAt ? new Date(order.uploadedAt).toLocaleString("ru-RU") : "—"}
            </div>
          </div>
        )}
      </div>

      <div className="card" id="acts-quarters">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Акты по кварталам</h3>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              refreshActs();
              refreshTemplates();
            }}
            disabled={actsState === "loading" || templatesState === "loading"}
          >
            Обновить
          </button>
        </div>
        {groupsState === "loading" && <div>Загрузка групп...</div>}
        {groupsState === "error" && <div style={{ color: "crimson" }}>{groupsError}</div>}
        {groupsState === "idle" && groups.length === 0 && (
          <div className="empty-state">
            Группы еще не обнаружены. Дождитесь завершения обработки приказа.
          </div>
        )}
        {groupsState === "idle" && groups.length > 0 && (
          <>
            <label className="form-field order-group-selector">
              <span className="form-field-label">Группа</span>
              <select
                className="form-control group-name-selector"
                value={selectedGroupId ?? ""}
                onChange={event => {
                  setUploadError(null);
                  const value = event.target.value;
                  setSelectedGroupId(value || null);
                  setTasksGroupFilter(value || "all");
                }}
              >
                {!selectedGroupId && (
                  <option value="" disabled>
                    Выберите группу
                  </option>
                )}
                {groups.map(group => (
                  <option key={group.groupId} value={group.groupId}>
                    {group.groupName || group.groupId}
                  </option>
                ))}
              </select>
            </label>

            {templatesState === "loading" && <div>Загрузка шаблонов...</div>}
            {templatesState === "error" && templateError && (
              <div style={{ color: "crimson" }}>{templateError}</div>
            )}
            <table className="acts-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Квартал</th>
                  <th>Акт</th>
                  <th>Шаблон</th>
                  <th style={{ width: 220 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4].map(quarter => {
                  const act = acts.find(
                    item => item.groupId === selectedGroupId && item.quarterYear === quarter
                  );
                  const template = templates.find(
                    item => item.groupId === selectedGroupId && item.quarterYear === quarter
                  );
                  return (
                    <tr key={quarter}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{quarter}-й квартал</td>
                      <td>
                        {act ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ minWidth: 0, textAlign: "center" }}>
                              <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {act.fileName}
                              </div>
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                {act.uploadedAt ? new Date(act.uploadedAt).toLocaleString("ru-RU") : "—"}
                              </div>
                            </div>
                            {act.fileRef && (
                              <a 
                                href={act.fileRef} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="download-button" 
                                style={{ flexShrink: 0, padding: "6px 10px", fontSize: 16, marginLeft: 15 }} title="Скачать акт">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                  <polyline points="17 21 17 13 7 13 7 21"/>
                                  <polyline points="7 3 7 8 15 8"/>
                                </svg>
                              </a>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 13 }}>Не загружен</span>
                        )}
                      </td>
                      <td>
                        {template ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ minWidth: 0, textAlign: "center" }}>
                              <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {template.fileName}
                              </div>
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                {template.createdAt ? new Date(template.createdAt).toLocaleString("ru-RU") : "—"}
                              </div>
                            </div>
                            {template.fileRef && (
                              <a 
                                href={template.fileRef} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="download-button" 
                                style={{ flexShrink: 0, padding: "6px 10px", fontSize: 16, marginLeft: 15 }} title="Скачать шаблон">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                  <polyline points="17 21 17 13 7 13 7 21"/>
                                  <polyline points="7 3 7 8 15 8"/>
                                </svg>
                              </a>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 13 }}>Не сформирован</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleQuarterUpload(quarter)}
                            disabled={
                              !selectedGroupId ||
                              groupsState !== "idle" ||
                              uploadingQuarter === quarter
                            }
                          >
                            {uploadingQuarter === quarter ? "Загрузка..." : "Загрузить акт"}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => handleTemplateGenerate(quarter)}
                            disabled={
                              !selectedGroupId ||
                              templatesState === "loading" ||
                              generatingQuarter === quarter
                            }
                          >
                            {generatingQuarter === quarter ? "Формируем..." : "Сформировать шаблон"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
      </div>

      {groupsState === "idle" && groups.length > 0 && (
              <div className="card" id="tasks-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>Задачи группы</h3>
                  <button type="button" className="secondary" onClick={() => refreshTasks()} disabled={tasksState === "loading"}>
                    Обновить
                  </button>
                </div>
                <div className="tasks-filters">
                  <label className="form-field">
                    <span className="form-field-label">Группа</span>
                    <select className="form-control" value={tasksGroupFilter} onChange={e => setTasksGroupFilter(e.target.value)}>
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
                    <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                      <option value="all">Все статусы</option>
                      <option value="not_completed">Не выполнено</option>
                      <option value="in_progress">В работе</option>
                      <option value="completed">Выполнено</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span className="form-field-label">Квартал</span>
                    <select className="form-control" value={tasksQuarterFilter} onChange={e => setTasksQuarterFilter(e.target.value)}>
                      <option value="all">Все кварталы</option>
                      {availableTaskQuarters.map(q => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span className="form-field-label">Срок выполнения</span>
                    <select className="form-control" value={tasksDeadlineSort} onChange={e => setTasksDeadlineSort(e.target.value as "none" | "asc" | "desc")}>
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
                </div>

                {tasksState === "loading" && <div>Загрузка задач...</div>}
                {tasksState === "error" && <div style={{ color: "crimson" }}>{tasksError ?? "Ошибка загрузки задач"}</div>}
                {tasksState === "idle" && tasks.length === 0 && (
                  <div className="empty-state">Задачи для этой группы пока не обнаружены.</div>
                )}
                {tasksState === "idle" && tasks.length > 0 && filteredGroupTasks.length === 0 && (
                  <div className="empty-state">По заданным фильтрам ничего не найдено.</div>
                )}
                {tasksState === "idle" && filteredGroupTasks.length > 0 && (
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
                        {paginatedGroupTasks.map(task => {
                          const statusMeta = getTaskStatusMeta(task.status);
                          const professionalCheckedMeta = getTaskProfessionalCheckedMeta(task.isProfessionalChecked);
                          const isUpdating = updatingTaskId === task.taskId;
                          const isUpdatingProfessionalChecked = updatingTaskProfessionalCheckedId === task.taskId;
                          return (
                            <tr key={task.taskId}>
                              <td>{task.fullName || "—"}</td>
                              <td>{task.taskText || "—"}</td>
                              <td>{task.units || "—"}</td>
                              <td>{formatDeadline(task.deadline)}</td>
                              <td>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                  <div>
                                    <select
                                      value={task.status || "Не выполнено"}
                                      onChange={e => handleTaskStatusChange(task.taskId, e.target.value)}
                                      disabled={isUpdating || !selectedGroupId}
                                      style={{
                                        padding: "4px 8px", borderRadius: 6, fontWeight: 600, fontSize: 13,
                                        backgroundColor: statusMeta.background, color: statusMeta.color,
                                        border: `1px solid ${statusMeta.color}`,
                                        cursor: isUpdating ? "wait" : "pointer", minWidth: 140,
                                      }}
                                    >
                                      <option value="Не выполнено">Не выполнено</option>
                                      <option value="В работе">В работе</option>
                                      <option value="Выполнено">Выполнено</option>
                                    </select>
                                    {isUpdating && <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>Сохранение...</span>}
                                  </div>
                                  <div>
                                    <button
                                      type="button"
                                      onClick={() => handleTaskProfessionalCheckedChange(task.taskId, !task.isProfessionalChecked)}
                                      disabled={isUpdatingProfessionalChecked || !selectedGroupId}
                                      style={{
                                        padding: "4px 8px", borderRadius: 6, fontWeight: 600, fontSize: 13,
                                        backgroundColor: professionalCheckedMeta.background,
                                        color: professionalCheckedMeta.color,
                                        border: `1px solid ${professionalCheckedMeta.borderColor}`,
                                        cursor: isUpdatingProfessionalChecked ? "wait" : "pointer", minWidth: 140,
                                      }}
                                    >
                                      {task.isProfessionalChecked ? "Проверено" : "Не проверено"}
                                    </button>
                                    {isUpdatingProfessionalChecked && <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>Сохранение...</span>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Пагинация */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        Записей на странице:
                        <select
                          className="form-control"
                          style={{ width: "auto", padding: "2px 6px" }}
                          value={tasksPageSize}
                          onChange={e => { setTasksPageSize(Number(e.target.value)); setTasksCurrentPage(1); }}
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                        </select>
                      </label>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={tasksCurrentPage === 1} onClick={() => setTasksCurrentPage(1)}>«</button>
                        <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={tasksCurrentPage === 1} onClick={() => setTasksCurrentPage(p => Math.max(1, p - 1))}>‹</button>
                        <span style={{ fontSize: 13, minWidth: 80, textAlign: "center" }}>Стр. {tasksCurrentPage} из {tasksTotalPages}</span>
                        <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={tasksCurrentPage === tasksTotalPages} onClick={() => setTasksCurrentPage(p => Math.min(tasksTotalPages, p + 1))}>›</button>
                        <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={tasksCurrentPage === tasksTotalPages} onClick={() => setTasksCurrentPage(tasksTotalPages)}>»</button>
                      </div>
                      <span style={{ fontSize: 12, color: "#64748b" }}>
                        Показано {(tasksCurrentPage - 1) * tasksPageSize + 1}–{Math.min(tasksCurrentPage * tasksPageSize, filteredGroupTasks.length)} из {filteredGroupTasks.length}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

      <div className="card" id="acts-list">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: actsCollapsed ? 0 : 12 }}>
          <button
            type="button"
            className="secondary"
            style={{ fontWeight: 700, fontSize: 15, background: "none", padding: "0 4px", color: "#0f172a" }}
            onClick={() => setActsCollapsed(v => !v)}
          >
            {actsCollapsed ? "▶" : "▼"} Акты {acts.length > 0 && `(${acts.length})`}
          </button>
          <button type="button" className="secondary" onClick={refreshActs} disabled={actsState === "loading"}>
            Обновить
          </button>
        </div>

        {!actsCollapsed && (
          <>
            {actsState === "loading" && <div>Загрузка актов...</div>}
            {actsState === "error" && <div style={{ color: "crimson" }}>{error}</div>}
            {actsState === "idle" && acts.length === 0 && <div className="empty-state">Акты еще не загружены.</div>}

            {acts.length > 0 && (
              <>
                {/* Фильтры и сортировка */}
                <div className="tasks-filters" style={{ marginBottom: 12 }}>
                  <label className="form-field">
                    <span className="form-field-label">Группа</span>
                    <select
                      className="form-control"
                      value={actsGroupFilter}
                      onChange={e => setActsGroupFilter(e.target.value)}
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
                    <span className="form-field-label">Квартал</span>
                    <select
                      className="form-control"
                      value={actsQuarterFilter}
                      onChange={e => setActsQuarterFilter(e.target.value)}
                    >
                      <option value="all">Все кварталы</option>
                      <option value="1">1-й</option>
                      <option value="2">2-й</option>
                      <option value="3">3-й</option>
                      <option value="4">4-й</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span className="form-field-label">Сортировка</span>
                    <select
                      className="form-control"
                      value={`${actsSortField}:${actsSortDir}`}
                      onChange={e => {
                        const [field, dir] = e.target.value.split(":") as [typeof actsSortField, typeof actsSortDir];
                        setActsSortField(field);
                        setActsSortDir(dir);
                      }}
                    >
                      <option value="uploadedAt:desc">Дата загрузки ↓</option>
                      <option value="uploadedAt:asc">Дата загрузки ↑</option>
                      <option value="quarterYear:asc">Квартал ↑</option>
                      <option value="quarterYear:desc">Квартал ↓</option>
                      <option value="fileName:asc">Имя файла А→Я</option>
                      <option value="fileName:desc">Имя файла Я→А</option>
                    </select>
                  </label>
                </div>

                {filteredActs.length === 0 && (
                  <div className="empty-state">По заданным фильтрам ничего не найдено.</div>
                )}

                {filteredActs.length > 0 && (
                  <table className="acts-table">
                    <thead>
                      <tr>
                        <th>Файл</th>
                        <th>Группа</th>
                        <th>Квартал</th>
                        <th>Статус</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActs.map(act => (
                        <tr key={act.documentId}>
                          <td>
                            <div>{act.fileName}</div>
                            {act.uploadedAt && (
                              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                Загружено: {new Date(act.uploadedAt).toLocaleString("ru-RU")}
                              </div>
                            )}
                          </td>
                          <td>{resolveGroupName(act.groupId)}</td>
                          <td>{act.quarterYear ?? "—"}</td>
                          <td><span className="status-badge">{act.status}</span></td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                              {act.fileRef ? (
                                <a href={act.fileRef} target="_blank" rel="noreferrer" className="download-button" style={{ padding: "6px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                    <polyline points="17 21 17 13 7 13 7 21"/>
                                    <polyline points="7 3 7 8 15 8"/>
                                  </svg>
                                </a>
                              ) : (
                                <span style={{ color: "#94a3b8" }}>—</span>
                              )}
                            <button
                              type="button"
                              className="delete-order-button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActToDelete(act);
                              }}
                              aria-label="Удалить акт"
                              style={{ padding: "6px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            >

                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6"/>
                                <path d="M14 11v6"/>
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                              </svg>
                            </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </>
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

      {validationModal && (
        <ValidationIssuesModal
          tone={validationModal.tone}
          title={validationModal.title}
          issues={validationModal.issues}
          exportFileNamePrefix={validationModal.exportFileNamePrefix}
          onClose={() => setValidationModal(null)}
        />
      )}
    </div>
  );
}

