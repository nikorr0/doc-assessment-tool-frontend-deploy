import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { createProject, listProjects, deleteProject } from "../api/projects";
import type { Project } from "../types";

type LoadState = "idle" | "loading" | "error";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState<LoadState>("loading");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setFormError(null);
    try {
      const project = await createProject(name.trim());
      setProjects(prev => [project, ...prev]);
      setName("");
    } catch (err) {
      console.error(err);
      setFormError("Не удалось создать проект");
    } finally {
      setCreating(false);
    }
  }

  const orderedProjects = useMemo(
    () => [...projects].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [projects]
  );

  async function handleDelete() {
    if (!projectToDelete) return;
    setDeleting(true);
    try {
      await deleteProject(projectToDelete.id);
      setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
      setProjectToDelete(null);
    } catch (err) {
      console.error(err);
      alert("Не удалось удалить проект");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Проекты</h1>
      {/* <p className="subtitle">Создавайте проекты, загружайте приказы и акты, отслеживайте прогресс задач.</p> */}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Создать проект TEST</h3>
        <form onSubmit={handleCreate} className="input-row">
          <input
            type="text"
            placeholder="Напишите название проекта"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <button type="submit" disabled={!name.trim() || creating}>
            {creating ? "Создание..." : "Создать"}
          </button>
        </form>
        {formError && <div style={{ color: "crimson", marginTop: 12 }}>{formError}</div>}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Список проектов</h3>
          <button type="button" className="secondary" onClick={refreshProjects} disabled={loading === "loading"}>
            Обновить
          </button>
        </div>

        {loading === "loading" && <div>Загрузка проектов...</div>}
        {loading === "error" && (
          <div>
            {listError ?? "Ошибка загрузки"}
            <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={refreshProjects}>
              Повторить
            </button>
          </div>
        )}

        {loading === "idle" && orderedProjects.length === 0 && (
          <div className="empty-state">Проектов пока нет. Создайте первый проект.</div>
        )}

        {orderedProjects.length > 0 && (
          <ul className="projects-list">
            {orderedProjects.map(project => (
              <li key={project.id}>
                <Link to={`/projects/${project.id}`}>
                  <div>
                    <strong>{project.name}</strong>
                    {project.createdAt && (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        Создан: {new Date(project.createdAt).toLocaleString("ru-RU")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="status-badge">проекты</span>
                    <button
                      type="button"
                      className="delete-project-button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProjectToDelete(project);
                      }}
                      aria-label="Удалить проект"
                    >
                      ✖
                    </button>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {projectToDelete && (
        <div className="modal-overlay" onClick={() => setProjectToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение удаления</h3>
            <p>Вы уверены, что хотите удалить проект <strong>{projectToDelete.name}</strong>?</p>
            <p style={{ fontSize: 14, color: "#94a3b8" }}>Это действие нельзя отменить.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button
                type="button"
                className="delete-confirm-button"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Удаление..." : "Удалить"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setProjectToDelete(null)}
                disabled={deleting}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}