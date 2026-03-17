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
import type {
  DocumentRecord,
  DocumentValidationStatus,
  GroupRecord,
  Project,
  TemplateRecord,
  TaskRecord,
} from "../types";

type LoadState = "idle" | "loading" | "error";

type ValidationBanner = {
  tone: "info" | "success" | "warning" | "error";
  text: string;
};

type ValidationModal = {
  tone: "warning" | "error";
  title: string;
  issues: string[];
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
  const [tasksState, setTasksState] = useState<LoadState>("idle");
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updatingTaskProfessionalCheckedId, setUpdatingTaskProfessionalCheckedId] = useState<number | null>(null);
  const [actToDelete, setActToDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const templatePollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const templatePollInFlightRef = useRef(false);
  const tasksPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksPollInFlightRef = useRef(false);

  const TEMPLATE_POLL_INTERVAL_MS = 4000;
  const TEMPLATE_POLL_MAX_ATTEMPTS = 20;
  const TASKS_POLL_INTERVAL_MS = 4000;
  const TASKS_POLL_MAX_ATTEMPTS = 20;
  const VALIDATION_POLL_INTERVAL_MS = 1500;
  const VALIDATION_POLL_MAX_ATTEMPTS = 40;

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

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tasks.filter(task => {
      const byStatus =
        statusFilter === "all" || getStatusFilterKey(task.status) === statusFilter;
      const bySearch =
        query.length === 0 ||
        (task.fullName ?? "").toLowerCase().includes(query) ||
        (task.taskText ?? "").toLowerCase().includes(query);
      return byStatus && bySearch;
    });
  }, [tasks, statusFilter, searchQuery, getStatusFilterKey]);

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
        const current = await getDocumentValidation(documentId);
        latest = current;
        if (current.status !== "pending") {
          return current;
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
        const issues =
          validation.errors.length > 0
            ? validation.errors
            : [validation.summary || "Документ не прошел валидацию."];
        setValidationModal({
          tone: "error",
          title: "Акт не прошел валидацию",
          issues,
        });
        setValidationBanner({ tone: "error", text: "Акт отклонен валидатором." });
        setActs((prev) => prev.filter((act) => act.documentId !== record.documentId));
        return;
      }

      if (validation.status === "warning") {
        const issues =
          validation.warnings.length > 0
            ? validation.warnings
            : [validation.summary || "В акте есть предупреждения."];
        setValidationModal({
          tone: "warning",
          title: "Акт загружен с предупреждениями",
          issues,
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
      <Link to={`/projects/${projectId}`} className="back-link">
        ← Назад к проекту
      </Link>
      <h1 className="page-title">Приказ "{order?.fileName}"</h1>
      <p className="subtitle">Проект "{project?.name}"</p>
      <div style={{ marginBottom: 16 }}>
        <Link to={`/projects/${projectId}/${orderId}/tasks`} className="info-button">
          Все задачи приказа
        </Link>
      </div>

      <div className="card">
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

      <div className="card">
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
                      <td>{quarter}-й</td>
                      <td>
                        {act ? (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>{act.fileName}</span>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>
                              Обновлен{" "}
                              {act.uploadedAt
                                ? new Date(act.uploadedAt).toLocaleString("ru-RU")
                                : "—"}
                            </span>
                            {act.fileRef && (
                              <a 
                                href={act.fileRef} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="download-button"
                                style={{ margin: "auto", marginTop: "7px" }}
                              >
                                Скачать
                              </a>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>Не загружен</span>
                        )}
                      </td>
                      <td>
                        {template ? (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>{template.fileName}</span>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>
                              Обновлен{" "}
                              {template.createdAt
                                ? new Date(template.createdAt).toLocaleString("ru-RU")
                                : "—"}
                            </span>
                            {template.fileRef && (
                              <a 
                                href={template.fileRef} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="download-button"
                                style={{ margin: "auto", marginTop: "7px" }}
                              >
                                Скачать
                              </a>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>Не сформирован</span>
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
        <div className="card">
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
                {filteredTasks.map(task => {
                  const statusMeta = getTaskStatusMeta(task.status);
                  const professionalCheckedMeta = getTaskProfessionalCheckedMeta(
                    task.isProfessionalChecked
                  );
                  const isUpdating = updatingTaskId === task.taskId;
                  const isUpdatingProfessionalChecked =
                    updatingTaskProfessionalCheckedId === task.taskId;
                  return (
                    <tr key={task.taskId}>
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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Акты</h3>
          <button type="button" className="secondary" onClick={refreshActs} disabled={actsState === "loading"}>
            Обновить
          </button>
        </div>
        {actsState === "loading" && <div>Загрузка актов...</div>}
        {actsState === "error" && <div style={{ color: "crimson" }}>{error}</div>}
        {actsState === "idle" && acts.length === 0 && <div className="empty-state">Акты еще не загружены.</div>}

        {acts.length > 0 && (
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
              {acts.map(act => (
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
                        <a
                          href={act.fileRef}
                          target="_blank"
                          rel="noreferrer"
                          className="download-button"
                        >
                          Скачать
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
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="modal-overlay" onClick={() => setValidationModal(null)}>
          <div
            className={`modal-content validation-modal validation-modal--${validationModal.tone}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{validationModal.title}</h3>
            <ul className="validation-issues-list">
              {validationModal.issues.map((issue, index) => (
                <li key={`${index}-${issue}`}>{issue}</li>
              ))}
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => setValidationModal(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

