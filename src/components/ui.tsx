// 共享 UI 组件
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Panel({
  title,
  extra,
  children,
  className = "",
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || extra) && (
        <div className="heading">
          <div>{title && <h2>{title}</h2>}</div>
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

type Variant = "default" | "primary" | "accent" | "danger" | "ghost";

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}

const BADGE_COLORS: Record<string, string> = {
  green: "badge-green",
  amber: "badge-amber",
  red: "badge-red",
  sky: "badge-sky",
  slate: "badge-slate",
};

export function Badge({
  color = "slate",
  children,
}: {
  color?: keyof typeof BADGE_COLORS | string;
  children: ReactNode;
}) {
  return <span className={`badge ${BADGE_COLORS[color] ?? "badge-slate"}`}>{children}</span>;
}

export function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
