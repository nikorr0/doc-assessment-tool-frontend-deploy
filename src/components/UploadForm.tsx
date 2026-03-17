import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { getDocumentValidation, uploadAct, uploadOrder } from "../api/projects";
import { getApiErrorMessage } from "../utils/error";
import { sha256FileHex } from "../utils/hash";
import type { DocumentRecord, DocumentValidationStatus } from "../types";

type Props = {
  projectId: string;
  mode: "ORDER" | "ACT";
  orderId?: string;
  groupId?: string;
  quarterYear?: number;
  onUploaded?: (record: DocumentRecord) => void;
  onValidationResolved?: (record: DocumentRecord, validation: DocumentValidationStatus) => void;
};

const VALIDATION_POLL_INTERVAL_MS = 1500;
const VALIDATION_POLL_MAX_ATTEMPTS = 40;

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

export default function UploadForm({
  projectId,
  mode,
  orderId,
  groupId,
  quarterYear,
  onUploaded,
  onValidationResolved,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationBanner, setValidationBanner] = useState<ValidationBanner | null>(null);
  const [validationModal, setValidationModal] = useState<ValidationModal | null>(null);

  async function waitForValidation(documentId: string): Promise<DocumentValidationStatus> {
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
  }

  async function monitorValidation(record: DocumentRecord): Promise<void> {
    setValidationBanner({ tone: "info", text: "Проверяем документ..." });
    const validation = await waitForValidation(record.documentId);
    onValidationResolved?.(record, validation);

    if (validation.status === "error") {
      const issues = validation.errors.length > 0 ? validation.errors : [validation.summary || "Обнаружены ошибки валидации."];
      setValidationModal({
        tone: "error",
        title: "Документ не прошел валидацию",
        issues,
      });
      setValidationBanner({ tone: "error", text: "Документ отклонен валидатором." });
      return;
    }

    if (validation.status === "warning") {
      const issues =
        validation.warnings.length > 0
          ? validation.warnings
          : [validation.summary || "В документе есть предупреждения."];
      setValidationModal({
        tone: "warning",
        title: "Документ загружен с предупреждениями",
        issues,
      });
      setValidationBanner({
        tone: "warning",
        text: "Проверка завершена с предупреждениями. Документ передан в обработку.",
      });
      return;
    }

    if (validation.status === "success") {
      setValidationBanner({
        tone: "success",
        text: "Ошибок не найдено. Документ передан в обработку.",
      });
      return;
    }

    setValidationBanner({
      tone: "info",
      text: "Проверка документа выполняется дольше обычного. Документ остается в обработке.",
    });
  }

  async function handleChoose(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setHash(null);
    if (f) {
      try {
        const value = await sha256FileHex(f);
        setHash(value);
      } catch {
        // ignore hashing issues silently
      }
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setValidationBanner(null);
    if (!file) {
      setError("Выберите файл .docx");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError("Только файлы .docx допустимы");
      return;
    }
    if (mode === "ACT" && !orderId) {
      setError("Не найден идентификатор приказа");
      return;
    }
    if (mode === "ACT" && (!groupId || typeof quarterYear !== "number")) {
      setError("Выберите группу и квартал");
      return;
    }

    setUploading(true);
    try {
      const record =
        mode === "ORDER"
          ? await uploadOrder(projectId, file)
          : await uploadAct(projectId, orderId!, file, groupId!, quarterYear!);
      onUploaded?.(record);
      void monitorValidation(record).catch((monitorError: unknown) => {
        console.error(monitorError);
        setValidationBanner({
          tone: "warning",
          text: "Документ загружен, но не удалось получить результат валидации.",
        });
      });
      setFile(null);
      setHash(null);
    } catch (err: unknown) {
      console.error(err);
      setError(getApiErrorMessage(err, "Ошибка загрузки"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* <span style={{ fontSize: 13, color: "#64748b" }}>
          {mode === "ORDER" ? "Файл приказа (.docx)" : "Файл акта (.docx)"}
        </span> */}
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleChoose}
        />
      </label>

      {hash && (
        <div style={{ fontSize: 12, color: "#475569" }}>
          SHA256: <code>{hash}</code>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={uploading || !file}>
          {uploading ? "Загрузка..." : mode === "ORDER" ? "Загрузить приказ" : "Загрузить акт"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setFile(null);
            setHash(null);
            setError(null);
          }}
        >
          Очистить
        </button>
      </div>

      {error && <div style={{ color: "crimson" }}>{error}</div>}

      {validationBanner && (
        <div className={`validation-banner validation-banner--${validationBanner.tone}`}>
          {validationBanner.text}
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
              {validationModal.issues.map((issue, idx) => (
                <li key={`${idx}-${issue}`}>{issue}</li>
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
    </form>
  );
}

