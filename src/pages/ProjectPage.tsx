import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import UploadForm from "../components/UploadForm";
import { getProject, listOrders, deleteOrder } from "../api/projects";
import type { DocumentRecord, DocumentValidationStatus, Project } from "../types";

type LoadState = "idle" | "loading" | "error";

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
    <div>
      <Link to="/projects" className="back-link">
        &larr; Все проекты
      </Link>
      <h1 className="page-title">Проект "{project?.name}"</h1>
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
                    <span className="status-badge">{order.status}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                      <Link to={`/projects/${projectId}/${order.documentId}`} className="open-button">
                        Открыть
                      </Link>
                      <Link
                        to={`/projects/${projectId}/${order.documentId}/dashboard`}
                        className="info-button"
                      >
                        Инфографика
                      </Link>
                      {order.fileRef && (
                        <a
                          href={order.fileRef}
                          target="_blank"
                          rel="noreferrer"
                          className="download-button"
                        >
                          Скачать
                        </a>
                      )}
                      <button
                        type="button"
                        className="delete-order-button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOrderToDelete(order);
                        }}
                        aria-label="Удалить приказ"
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
    </div>
  );
}

