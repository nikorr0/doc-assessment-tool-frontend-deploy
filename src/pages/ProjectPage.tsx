import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import UploadForm from "../components/UploadForm";
import { StatusBar } from "../components/StatusBar";
import { getProject, listOrders, deleteOrder } from "../api/projects";
import type { DocumentRecord, DocumentValidationStatus, Project } from "../types";

type LoadState = "idle" | "loading" | "error";

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
  };
  return labels[normalized] ?? (status?.trim() || "—");
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [orders, setOrders] = useState<DocumentRecord[]>([]);
  const [ordersState, setOrdersState] = useState<LoadState>("loading");
  const [projectState, setProjectState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setProjectState("loading");
    getProject(projectId)
      .then(data => {
        setProject(data);
        setProjectState("idle");
      })
      .catch(err => {
        console.error(err);
        setProjectState("error");
        setError("Не удалось загрузить проект");
      });
  }, [projectId]);

  const refreshOrders = useCallback(async () => {
    if (!projectId) return;
    setOrdersState("loading");
    try {
      const data = await listOrders(projectId);
      setOrders(data);
      setOrdersState("idle");
    } catch (err) {
      console.error(err);
      setOrdersState("error");
      setError("Не удалось загрузить приказы");
    }
  }, [projectId]);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  function handleOrderUploaded(record: DocumentRecord) {
    setOrders(prev => [record, ...prev.filter(o => o.documentId !== record.documentId)]);
  }

  const handleOrderValidationResolved = useCallback(
    (record: DocumentRecord, validation: DocumentValidationStatus) => {
      if (validation.status === "error") {
        setOrders((prev) => prev.filter((order) => order.documentId !== record.documentId));
        return;
      }

      if (validation.status === "warning") {
        setOrders((prev) =>
          prev.map((order) =>
            order.documentId === record.documentId
              ? { ...order, status: "validation_warning" }
              : order
          )
        );
      }
    },
    []
  );

  async function handleDelete() {
    if (!orderToDelete || !projectId) return;
    setDeleting(true);
    try {
      await deleteOrder(projectId, orderToDelete.documentId);
      setOrders(prev => prev.filter(o => o.documentId !== orderToDelete.documentId));
      setOrderToDelete(null);
    } catch (err) {
      console.error(err);
      alert("Не удалось удалить приказ");
    } finally {
      setDeleting(false);
    }
  }

  if (!projectId) {
    return (
      <div className="card">
        <h2>Проект не найден</h2>
        <Link to="/projects" className="back-link">
          &larr; Вернуться к списку проектов
        </Link>
      </div>
    );
  }

  return (
    <div className="project-page">
      <Link to="/projects" className="back-link">
        &larr; Все проекты
      </Link>
      <h1 className="page-title">Проект "{project?.name}"</h1>
{projectState === "idle" && project && (
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Информация о проекте</h3>
          <div className="project-view-grid">

            <div className="project-view-field">
              <span className="project-view-label">Статус: </span>
              <span className={`status-badge status-badge--${(project.status ?? "in_progress").replace("_", "-")}`}>
                {{ planned: "Планируется", in_progress: "В работе", completed: "Завершён" }[project.status ?? "in_progress"]}
              </span>
            </div>

            {project.tag && (
              <div className="project-view-field">
                <span className="project-view-label">Тег: </span>
                {project.tag
                  ? <span className="tag-badge">#{project.tag}</span>
                  : <span style={{ color: "#94a3b8", fontSize: 14 }}>—</span>
                }
              </div>
            )}

            <div className="project-view-field">
              <span className="project-view-label">Дата создания: </span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {project.createdAt ? (() => { const d = new Date(project.createdAt!); return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`; })() : "—"}
              </span>
            </div>

            {project.supervisor && (
              <div className="project-view-field">
                <span className="project-view-label">Руководитель: </span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{project.supervisor}</span>
              </div>
            )}

            {project.comment && (
              <div className="project-view-field" style={{ gridColumn: "1 / -1" }}>
                <span className="project-view-label">Комментарий: </span>
                <span className="project-view-comment">{project.comment}</span>
              </div>
            )}

          </div>
        </div>
      )}
      
      {/* <p className="subtitle">Создайте и загрузите приказы, затем добавляйте акты внутри каждого приказа.</p> */}
      
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Загрузить приказ</h3>
        <p style={{ marginTop: 4, color: "#64748b" }}>Поддерживаются только файлы .docx</p>
        <UploadForm
          projectId={projectId}
          mode="ORDER"
          onUploaded={handleOrderUploaded}
          onValidationResolved={handleOrderValidationResolved}
        />
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Список приказов</h3>
          {/* <button type="button" className="secondary" onClick={refreshOrders} disabled={ordersState === "loading"}>
            Обновить
          </button> */}
        </div>

        {ordersState === "loading" && <div>Загрузка приказов...</div>}
        {ordersState === "error" && <div style={{ color: "crimson" }}>{error ?? "Ошибка загрузки"}</div>}
        {ordersState === "idle" && orders.length === 0 && <div className="empty-state">Приказы еще не загружены.</div>}

        {orders.length > 0 && (
          <table className="documents-table">
            <thead>
              <tr>
                <th>Файл</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.documentId}>
                  <td>
                    <div>{order.fileName}</div>
                    {order.uploadedAt && (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        Загружено: {new Date(order.uploadedAt).toLocaleString("ru-RU")}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="status-badge">{getDocumentStatusLabel(order.status)}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}> 
                      <Link
                        to={`/projects/${projectId}/${order.documentId}`}
                        title="Открыть приказ"
                        className="icon-btn icon-btn--open"
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#2563eb", textDecoration: "none" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </Link>
                      <Link
                        to={`/projects/${projectId}/${order.documentId}/dashboard`}
                        title="Инфографика приказа"
                        className="icon-btn icon-btn--dashboard"
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#4f46e5", textDecoration: "none" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="20" x2="18" y2="10"/>
                          <line x1="12" y1="20" x2="12" y2="4"/>
                          <line x1="6" y1="20" x2="6" y2="14"/>
                        </svg>
                      </Link>
                      {order.fileRef && (
                        <a
                          href={order.fileRef}
                          target="_blank"
                          rel="noreferrer"
                          title="Скачать приказ"
                          className="icon-btn icon-btn--download"
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#16a34a", textDecoration: "none" }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                        </a>
                      )}

                      <button
                        type="button"
                        title="Удалить приказ"
                        className="icon-btn icon-btn--delete"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOrderToDelete(order); }}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#ef4444", padding: 0 }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <line x1="10" y1="11" x2="10" y2="17"/>
                          <line x1="14" y1="11" x2="14" y2="17"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {projectState === "error" && (
        <div className="card" style={{ borderColor: "crimson", color: "crimson" }}>
          {error ?? "Проект недоступен"}
        </div>
      )}

      {orderToDelete && (
        <div className="modal-overlay" onClick={() => setOrderToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение удаления</h3>
            <p>Вы уверены, что хотите удалить приказ <strong>{orderToDelete.fileName}</strong>?</p>
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
                onClick={() => setOrderToDelete(null)}
                disabled={deleting}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {ordersState === "idle" && projectState === "idle" && project && (
        <StatusBar>
          <span>
            Загружено приказов: <strong>{orders.length}</strong>
          </span>
        </StatusBar>
      )}
    </div>
  );
}

