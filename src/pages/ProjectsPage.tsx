import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createProject, listProjects, deleteProject, updateProject } from "../api/projects";
import { StatusBar, StatusBarDot } from "../components/StatusBar";
import type { Project, ProjectStatus } from "../types";

type LoadState = "idle" | "loading" | "error";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Планируется",
  in_progress: "В работе",
  completed: "Завершён",
};

const STATUS_CLASS: Record<ProjectStatus, string> = {
  planned: "status-badge status-badge--planned",
  in_progress: "status-badge status-badge--in-progress",
  completed: "status-badge status-badge--completed",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

interface CreateModalProps {
  onClose: () => void;
  onCreate: (project: Project) => void;
}

function CreateProjectModal({ onClose, onCreate }: CreateModalProps) {
  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState<ProjectStatus>("in_progress");
  const [tag, setTag] = useState("");
  const [comment, setComment] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = shortName.trim().length > 0 && fullName.trim().length > 0 && date.length > 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const createdAt = new Date(date + "T10:00:00.000Z").toISOString();
      const project = await createProject(shortName.trim(), fullName.trim(), {
        status,
        tag: tag.trim() || undefined,
        comment: comment.trim() || undefined,
        supervisor: supervisor.trim() || undefined,
        createdAt,
      });
      onCreate(project);
      onClose();
    } catch {
      setError("Не удалось создать проект. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--wide" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, marginBottom: 20 }}>Новый проект</h3>

        <div className="modal-form-row">
          <label>Краткое наименование проекта <span className="required-star">*</span></label>
          <input
            type="text"
            placeholder="Введите краткое название проекта"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="modal-form-row">
          <label>Полное наименование проекта <span className="required-star">*</span></label>
          <textarea
            placeholder="Введите полное наименование проекта"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            rows={3}
          />
          <span className="field-hint">Это название используется при генерации шаблона квартального акта.</span>
        </div>

        <div className="modal-form-row">
          <label>Дата создания <span className="required-star">*</span></label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="modal-form-row">
          <label>Статус</label>
          <select
            className="status-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            <option value="planned">Планируется</option>
            <option value="in_progress">В работе</option>
            <option value="completed">Завершён</option>
          </select>
        </div>

        <div className="modal-form-row">
          <label>Тег</label>
          <input
            type="text"
            placeholder="До 10 символов"
            value={tag}
            maxLength={10}
            onChange={(e) => setTag(e.target.value)}
          />
          <span className="field-hint">{tag.length}/10 символов</span>
        </div>
        <div className="modal-form-row">
          <label>Руководитель</label>
          <input
            type="text"
            placeholder="ФИО руководителя"
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
          />
        </div>
        <div className="modal-form-row">
          <label>Комментарий</label>
          <textarea
            placeholder="Дополнительное описание проекта..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <span className="field-hint">Комментарий виден только внутри проекта</span>
        </div>

        {error && (
          <div style={{ color: "crimson", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? "Создание..." : "Создать проект"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditModalProps {
  project: Project;
  onClose: () => void;
  onSave: (updated: Project) => void;
}

function EditProjectModal({ project, onClose, onSave }: EditModalProps) {
  const [shortName, setShortName] = useState(project.shortName ?? project.name);
  const [fullName, setFullName] = useState(project.fullName ?? project.name);
  const [status, setStatus] = useState<ProjectStatus>(project.status ?? "in_progress");
  const [tag, setTag] = useState(project.tag ?? "");
  const [comment, setComment] = useState(project.comment ?? "");
  const [supervisor, setSupervisor] = useState(project.supervisor ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = shortName.trim().length > 0 && fullName.trim().length > 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProject(project.id, {
        shortName: shortName.trim(),
        fullName: fullName.trim(),
        status,
        tag: tag.trim() || undefined,
        comment: comment.trim() || undefined,
        supervisor: supervisor.trim() || undefined,
      });
      onSave(updated);
      onClose();
    } catch {
      setError("Не удалось сохранить изменения.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--wide" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, marginBottom: 20 }}>Редактировать проект</h3>

        <div className="modal-form-row">
          <label>Краткое наименование проекта <span className="required-star">*</span></label>
          <input
            type="text"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="modal-form-row">
          <label>Полное наименование проекта <span className="required-star">*</span></label>
          <textarea
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            rows={3}
          />
          <span className="field-hint">Это название используется при генерации шаблона квартального акта.</span>
        </div>

        <div className="modal-form-row">
          <label>Статус</label>
          <select
            className="status-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            <option value="planned">Планируется</option>
            <option value="in_progress">В работе</option>
            <option value="completed">Завершён</option>
          </select>
        </div>

        <div className="modal-form-row">
          <label>Тег</label>
          <input
            type="text"
            placeholder="До 10 символов"
            value={tag}
            maxLength={10}
            onChange={(e) => setTag(e.target.value)}
          />
          <span className="field-hint">{tag.length}/10 символов</span>
        </div>

        <div className="modal-form-row">
          <label>Руководитель</label>
          <input
            type="text"
            placeholder="ФИО руководителя"
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
          />
        </div>

        <div className="modal-form-row">
          <label>Комментарий</label>
          <textarea
            placeholder="Дополнительное описание проекта..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        {error && (
          <div style={{ color: "crimson", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<LoadState>("loading");
  const [listError, setListError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "status">("date");
  const [search, setSearch] = useState("");

  async function refreshProjects() {
    setLoading("loading");
    setListError(null);
    try {
      const data = await listProjects();
      setProjects(data);
      setLoading("idle");
    } catch (err) {
      console.error(err);
      setListError("Не удалось загрузить проекты");
      setLoading("error");
    }
  }

  useEffect(() => {
    refreshProjects();
  }, []);

  const STATUS_ORDER: Record<string, number> = {
    in_progress: 0,
    planned: 1,
    completed: 2,
  };


const orderedProjects = useMemo(() => {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.fullName ?? "").toLowerCase().includes(q) ||
          (p.tag ?? "").toLowerCase().includes(q) ||
          (p.comment ?? "").toLowerCase().includes(q) ||
          (p.supervisor ?? "").toLowerCase().includes(q)
      )
    : projects;

  const copy = [...filtered];
  if (sortBy === "date") {
    copy.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  } else {
    copy.sort((a, b) => {
      const sa = STATUS_ORDER[a.status ?? "in_progress"] ?? 99;
      const sb = STATUS_ORDER[b.status ?? "in_progress"] ?? 99;
      if (sa !== sb) return sa - sb;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  }
  return copy;
}, [projects, sortBy, search]);

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
  }
  function handleProjectSaved(updated: Project) {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }
  async function handleDelete() {
    if (!projectToDelete) return;
    setDeleting(true);
    try {
      await deleteProject(projectToDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setProjectToDelete(null);
    } catch (err) {
      console.error(err);
      alert("Не удалось удалить проект");
    } finally {
      setDeleting(false);
    }
  }

  const stats = useMemo(() => ({
    total: projects.length,
    planned: projects.filter((p) => p.status === "planned").length,
    inProgress: projects.filter((p) => p.status === "in_progress").length,
    completed: projects.filter((p) => p.status === "completed").length,
  }), [projects]);

  return (
    <div>
      <div style={{ marginBottom: 24 }} />

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Список научных проектов</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setShowModal(true)}>+ Создать</button>
            <button type="button" className="secondary" onClick={refreshProjects} disabled={loading === "loading"}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Обновить
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <div className="search-input-wrap">
            <input
              type="text"
              placeholder="Поиск по названию, тегу, руководителю, комментарию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch("")}
              >
                ✕
              </button>
            )}
          </div>
          <div className="sort-controls" style={{ margin: 0 }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>Сортировка:</span>
            <button
              type="button"
              className={`sort-btn${sortBy === "date" ? " sort-btn--active" : ""}`}
              onClick={() => setSortBy("date")}
            >
              По дате
            </button>
            <button
              type="button"
              className={`sort-btn${sortBy === "status" ? " sort-btn--active" : ""}`}
              onClick={() => setSortBy("status")}
            >
              По статусу
            </button>
          </div>
        </div>


        {loading === "loading" && <div style={{ color: "#64748b" }}>Загрузка проектов...</div>}

        {loading === "error" && (
          <div>
            {listError ?? "Ошибка загрузки"}
            <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={refreshProjects}>
              Повторить
            </button>
          </div>
        )}

        {loading === "idle" && orderedProjects.length === 0 && (
          <div className="empty-state">
            {search.trim()
              ? `По запросу «${search}» ничего не найдено.`
              : <>Проектов пока нет.{" "}
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: "inherit" }}
                    onClick={() => setShowModal(true)}
                  >
                    Создайте первый проект
                  </button>.</>
            }
          </div>
        )}
        {orderedProjects.length > 0 && (
          <div className="projects-grid">
            {orderedProjects.map((project) => (
              <div key={project.id} style={{ position: "relative", display: "flex" }}>
                <Link
                  to={`/projects/${project.id}`}
                  className="project-card"
                  style={{ flex: 1, position: "relative" }}
                >
                  <div className="project-card__actions">
                    <button
                      type="button"
                      className="project-card__edit"
                      title="Редактировать проект"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProjectToEdit(project);
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1.5 11.5L4.5 10.5L11 4L9 2L2.5 8.5L1.5 11.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        <path d="M9 2L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="project-card__delete"
                      title="Удалить проект"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProjectToDelete(project);
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="project-card__name-wrapper">
                    <span className="project-card__name">{project.name}</span>
                  </div>

                  <div className="project-card__footer">
                    <span className={STATUS_CLASS[project.status ?? "in_progress"]}>
                      {STATUS_LABELS[project.status ?? "in_progress"]}
                    </span>
                    {project.tag && (
                      <span className="tag-badge" title={project.tag}>#{project.tag}</span>
                    )}
                    {project.createdAt && (
                      <span className="project-card__date">{formatDate(project.createdAt)}</span>
                    )}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CreateProjectModal onClose={() => setShowModal(false)} onCreate={handleProjectCreated} />
      )}
      {projectToEdit && (
        <EditProjectModal
          project={projectToEdit}
          onClose={() => setProjectToEdit(null)}
          onSave={handleProjectSaved}
        />
      )}
      {projectToDelete && (
        <div className="modal-overlay" onClick={() => setProjectToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение удаления</h3>
            <p>Вы уверены, что хотите удалить проект <strong>{projectToDelete.name}</strong>?</p>
            <p style={{ fontSize: 14, color: "#94a3b8" }}>Это действие нельзя отменить.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button type="button" className="delete-confirm-button" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Удаление..." : "Удалить"}
              </button>
              <button type="button" className="secondary" onClick={() => setProjectToDelete(null)} disabled={deleting}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {loading === "idle" && projects.length > 0 && (
        <StatusBar>
          <span>
            Всего: <strong>{stats.total}</strong>
          </span>
          <StatusBarDot />
          <span style={{ color: "#3b64d4" }}>
            Планируется: <strong>{stats.planned}</strong>
          </span>
          <StatusBarDot />
          <span style={{ color: "#a1781e" }}>
            В работе: <strong>{stats.inProgress}</strong>
          </span>
          <StatusBarDot />
          <span style={{ color: "#288d4f" }}>
            Завершено: <strong>{stats.completed}</strong>
          </span>
        </StatusBar>
      )}

    </div>
  );
}