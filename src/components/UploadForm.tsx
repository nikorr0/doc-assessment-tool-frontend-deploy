import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { uploadAct, uploadOrder } from "../api/projects";
import { getApiErrorMessage } from "../utils/error";
import { sha256FileHex } from "../utils/hash";
import type { DocumentRecord } from "../types";

type Props = {
  projectId: string;
  mode: "ORDER" | "ACT";
  orderId?: string;
  groupId?: string;
  quarterYear?: number;
  onUploaded?: (record: DocumentRecord) => void;
};

export default function UploadForm({ projectId, mode, orderId, groupId, quarterYear, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </form>
  );
}

