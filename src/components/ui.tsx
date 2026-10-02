import type { ReactNode } from "react";
import type { ReservationStatus } from "../types";

export function Panel({
  title,
  sub,
  actions,
  children,
  padded = true,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={"panel" + (padded ? "" : " panel-flush")}>
      {title && (
        <div className="heading">
          <div>
            {sub && <p className="eyebrow">{sub}</p>}
            <h2>{title}</h2>
          </div>
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "ok" | "warn" | "bad" | "muted" | "info";

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const RESERVATION_STATUS: Record<ReservationStatus, { label: string; tone: Tone }> = {
  held: { label: "已预留", tone: "info" },
  in_progress: { label: "进行中", tone: "warn" },
  done: { label: "已完成", tone: "ok" },
  invalidated: { label: "已失效", tone: "bad" },
};

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export const inputCls = "inp";

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Banner({ tone = "warn", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}
