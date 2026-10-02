// 通用工具
export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function toMinutes(ms: number): number {
  return ms / 60000;
}

export function earliestTuneTime(arrivedIso: string, stabilizeMinutes: number): number {
  return new Date(arrivedIso).getTime() + stabilizeMinutes * 60000;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime();
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local 输入值 → ISO */
export function fromLocalInput(value: string): string {
  // value 形如 2026-10-02T14:30（本机时区）
  return new Date(value).toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  return String(a) === String(b);
}
