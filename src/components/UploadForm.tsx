import { useState, useRef, useCallback } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { getDocumentValidation, uploadAct, uploadOrder } from "../api/projects";
import { getApiErrorMessage } from "../utils/error";
import { sha256FileHex } from "../utils/hash";
import { toValidationIssues } from "../utils/validationIssues";
import ValidationIssuesModal from "./ValidationIssuesModal";
import type { DocumentRecord, DocumentValidationStatus, ValidationIssue } from "../types";

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
  issues: ValidationIssue[];
  exportFileNamePrefix: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
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
  const [_hash, setHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationBanner, setValidationBanner] = useState<ValidationBanner | null>(null);
  const [validationModal, setValidationModal] = useState<ValidationModal | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  async function waitForValidation(documentId: string): Promise<DocumentValidationStatus> {
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
  }

  async function monitorValidation(record: DocumentRecord): Promise<void> {
    setValidationBanner({ tone: "info", text: "Проверяем документ..." });
    const validation = await waitForValidation(record.documentId);
    onValidationResolved?.(record, validation);

    if (validation.status === "error") {
      const issues = toValidationIssues(validation);
      setValidationModal({
        tone: "error",
        title: "Документ не прошел валидацию",
        issues,
        exportFileNamePrefix: mode === "ORDER"
          ? "Результат_валидации_приказа"
          : "Результат_валидации_акта",
      });
      setValidationBanner({ tone: "error", text: "Документ отклонен валидатором." });
      return;
    }

    if (validation.status === "warning") {
      const issues = toValidationIssues(validation);
      setValidationModal({
        tone: "warning",
        title: "Документ загружен с предупреждениями",
        issues,
        exportFileNamePrefix: mode === "ORDER"
          ? "Результат_валидации_приказа"
          : "Результат_валидации_акта",
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

  const applyFile = useCallback(async (f: File) => {
    setError(null);
    setValidationBanner(null);
    setFile(f);
    setHash(null);
    try {
      const value = await sha256FileHex(f);
      setHash(value);
    } catch {
      // ignore
    }
  }, []);

  async function handleChoose(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) await applyFile(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".docx")) {
      setError("Только файлы .docx допустимы");
      return;
    }
    await applyFile(f);
  }

  function handleClear() {
    setFile(null);
    setHash(null);
    setError(null);
    setValidationBanner(null);
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
      {/* Скрытый input */}
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleChoose}
        style={{ display: "none" }}
      />

      {/* Пустое состояние: drag-and-drop зона */}
      {!file && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Перетащите файл .docx или нажмите для выбора"
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "24px 20px",
            borderRadius: 12,
            border: `2px dashed ${isDragOver ? "#2563eb" : "#c7d7f5"}`,
            background: isDragOver ? "#eff6ff" : "#f8faff",
            cursor: "pointer",
            transition: "border-color 0.18s, background 0.18s",
            userSelect: "none",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: isDragOver ? "#dbeafe" : "#e8effe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.18s",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke={isDragOver ? "#1d4ed8" : "#3b82f6"}
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
              Перетащите файл сюда
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              поддерживаются только файлы .docx
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            style={{
              marginTop: 4,
              padding: "7px 18px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Выбрать файл
          </button>
        </div>
      )}

      {/* Файл выбран: карточка */}
      {file && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#fff",
            maxWidth: "100%",
          }}
        >
          {/* Иконка DOCX */}
          <div
            style={{
              flexShrink: 0,
              width: 40,
              height: 40,
              borderRadius: 8,
              background: "#fff",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#2563eb" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>

          {/* Имя и размер */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: "#0f172a",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {file.name}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {formatFileSize(file.size)}
            </div>
          </div>

          {/* Кнопка загрузить */}
          <button type="submit" disabled={uploading} style={{ flexShrink: 0, whiteSpace: "nowrap", height: 32, padding: "0 14px", fontSize: 14 }}>
            {uploading ? "Загрузка..." : mode === "ORDER" ? "Загрузить" : "Загрузить акт"}
          </button>

          {/* Крестик */}
          <button
            type="button"
            onClick={handleClear}
            disabled={uploading}
            title="Убрать файл"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              padding: 0,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {error && <div style={{ color: "crimson", fontSize: 14 }}>{error}</div>}

      {validationBanner && (
        <div className={`validation-banner validation-banner--${validationBanner.tone}`}>
          {validationBanner.text}
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
    </form>
  );
}

