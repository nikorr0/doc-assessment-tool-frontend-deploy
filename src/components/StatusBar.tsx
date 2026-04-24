import type { ReactNode } from "react";

type StatusBarProps = {
  children: ReactNode;
  /** Длинные сводки: перенос строки и дополнительные отступы (страница приказа). */
  multiline?: boolean;
  className?: string;
};

/**
 * Нижняя фиксированная панель сводки в едином стиле с `.status-bar` в `index.css`.
 */
export function StatusBar({ children, multiline, className }: StatusBarProps) {
  return (
    <div
      className={["status-bar", multiline ? "order-page-status-bar" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

/** Точка-разделитель между показателями. */
export function StatusBarDot() {
  return <span className="status-bar__dot" aria-hidden />;
}
