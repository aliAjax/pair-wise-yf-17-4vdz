import type {
  AppState,
  ConflictGroup,
  Measurement,
  ReedState,
} from "../types";
import { uid, looseEqual } from "./utils";

export interface MeasurementInput {
  pipeId: string;
  visitId: string;
  reservationId?: string;
  author: string;
  time: string;
  pitch: string;
  cents: number;
  tempC?: number;
  humidityRh?: number;
  reedState: ReedState;
  note?: string;
}

/** 参与逐字段比对的字段（实测值的全部业务字段） */
export const DIFF_FIELDS = [
  { key: "pitch", label: "音高" },
  { key: "cents", label: "音分偏差" },
  { key: "tempC", label: "温度(℃)" },
  { key: "humidityRh", label: "湿度(%RH)" },
  { key: "reedState", label: "簧片状态" },
  { key: "note", label: "维修备注" },
] as const;

export type DiffKey = (typeof DIFF_FIELDS)[number]["key"];

export interface FieldDiff {
  field: DiffKey;
  label: string;
  original: unknown;
  conflict: unknown;
  differs: boolean;
}

export function diffMeasurements(a: Measurement, b: Measurement): FieldDiff[] {
  return DIFF_FIELDS.map((f) => {
    const va = a[f.key] as unknown;
    const vb = b[f.key] as unknown;
    return {
      field: f.key,
      label: f.label,
      original: va,
      conflict: vb,
      differs: !looseEqual(va, vb),
    };
  });
}

function pendingGroupFor(state: AppState, pipeId: string, visitId: string) {
  return state.conflicts.find(
    (g) => g.pipeId === pipeId && g.visitId === visitId && g.status === "pending",
  );
}

/** 当前对该音管/本次维护有效的实测：优先最终确认值，否则先到的原始值 */
function baselineFor(state: AppState, pipeId: string, visitId: string): Measurement | undefined {
  const rows = state.measurements
    .filter(
      (m) =>
        m.pipeId === pipeId &&
        m.visitId === visitId &&
        (m.status === "confirmed" || m.status === "original"),
    )
    .sort((x, y) => new Date(y.time).getTime() - new Date(x.time).getTime());
  return rows[0];
}

export interface SubmitResult {
  state: AppState;
  measurement: Measurement;
  conflict?: ConflictGroup;
  error?: "PENDING_CONFLICT" | "BAD_POWER" | "NO_VISIT";
}

/**
 * 提交实测值。
 * - 同管/同次维护的第一份：直接作为先到原始值；
 * - 再来一份：原样保留为“冲突版本（待确认）”，先到那份一个字段都不覆盖，
 *   两者进入冲突组，列出字段差异后逐字段确认。
 */
export function submitMeasurement(state: AppState, input: MeasurementInput): SubmitResult {
  if (!state.powered) return { ...empty(state, input), error: "BAD_POWER" };
  if (!state.visits.some((v) => v.id === input.visitId)) {
    return { ...empty(state, input), error: "NO_VISIT" };
  }
  if (pendingGroupFor(state, input.pipeId, input.visitId)) {
    return { ...empty(state, input), error: "PENDING_CONFLICT" };
  }

  const baseline = baselineFor(state, input.pipeId, input.visitId);

  const measurement: Measurement = {
    id: uid("m"),
    pipeId: input.pipeId,
    visitId: input.visitId,
    reservationId: input.reservationId,
    author: input.author,
    time: input.time,
    pitch: input.pitch,
    cents: input.cents,
    tempC: input.tempC,
    humidityRh: input.humidityRh,
    reedState: input.reedState,
    note: input.note,
    status: baseline ? "pending_conflict" : "original",
  };

  let conflicts = state.conflicts;
  let group: ConflictGroup | undefined;

  if (baseline) {
    group = {
      id: uid("g"),
      pipeId: input.pipeId,
      visitId: input.visitId,
      originalId: baseline.id,
      conflictId: measurement.id,
      status: "pending",
      resolution: [],
    };
    conflicts = [...state.conflicts, group];
  }

  return {
    state: { ...state, measurements: [...state.measurements, measurement], conflicts },
    measurement,
    conflict: group,
  };
}

function empty(state: AppState, input: MeasurementInput): SubmitResult {
  const m: Measurement = {
    id: "",
    pipeId: input.pipeId,
    visitId: input.visitId,
    author: input.author,
    time: input.time,
    pitch: input.pitch,
    cents: input.cents,
    reedState: input.reedState,
    status: "original",
  };
  return { state, measurement: m };
}

/** 冲突组内的两份实测 */
export function groupMeasurements(
  state: AppState,
  group: ConflictGroup,
): { original: Measurement; conflict: Measurement } | null {
  const original = state.measurements.find((m) => m.id === group.originalId);
  const conflict = state.measurements.find((m) => m.id === group.conflictId);
  if (!original || !conflict) return null;
  return { original, conflict };
}

export function pendingConflicts(state: AppState): ConflictGroup[] {
  return state.conflicts.filter((g) => g.status === "pending");
}

export interface ResolveInput {
  groupId: string;
  /** 每个差异字段取 original 还是 conflict */
  choices: Partial<Record<DiffKey, "original" | "conflict">>;
  resolvedBy: string;
  time: string;
}

export interface ResolveResult {
  state: AppState;
  confirmed?: Measurement;
  error?: "NOT_FOUND" | "MISSING_CHOICE";
}

/**
 * 逐字段确认冲突：先到与后到两份都原样保留（转为归档可追溯），
 * 合并生成一份独立的“最终确认值”。先到那份的字段永不被整条覆盖。
 */
export function resolveConflict(state: AppState, input: ResolveInput): ResolveResult {
  const group = state.conflicts.find((g) => g.id === input.groupId);
  if (!group || group.status !== "pending") return { state, error: "NOT_FOUND" };
  const pair = groupMeasurements(state, group);
  if (!pair) return { state, error: "NOT_FOUND" };

  const diffs = diffMeasurements(pair.original, pair.conflict);
  const differing = diffs.filter((d) => d.differs);
  for (const d of differing) {
    if (!input.choices[d.field]) return { state, error: "MISSING_CHOICE" };
  }

  const pick = (key: DiffKey) => {
    const source = input.choices[key] ?? "original";
    const src = source === "original" ? pair.original : pair.conflict;
    return src[key];
  };

  const confirmed: Measurement = {
    id: uid("m"),
    pipeId: group.pipeId,
    visitId: group.visitId,
    author: input.resolvedBy,
    time: input.time,
    pitch: pick("pitch") as string,
    cents: pick("cents") as number,
    tempC: pick("tempC") as number | undefined,
    humidityRh: pick("humidityRh") as number | undefined,
    reedState: pick("reedState") as ReedState,
    note: pick("note") as string | undefined,
    status: "confirmed",
    groupId: group.id,
  };

  const resolution = diffs.map((d) => ({
    field: d.field,
    source: input.choices[d.field] ?? "original",
  }));

  const conflicts = state.conflicts.map((g) =>
    g.id === group.id
      ? {
          ...g,
          status: "resolved" as const,
          resolution,
          resolvedMeasurementId: confirmed.id,
          resolvedAt: input.time,
          resolvedBy: input.resolvedBy,
        }
      : g,
  );

  // 仅后到的冲突版本归档；被新一轮冲突取代的旧确认值也归档；
  // 第一份 original 永不改写。
  const measurements = state.measurements.map((m) => {
    if (m.id === pair.conflict.id) return { ...m, status: "archived_conflict" as const };
    if (m.id === pair.original.id && m.status === "confirmed") {
      return { ...m, status: "archived_conflict" as const };
    }
    return m;
  });

  return {
    state: {
      ...state,
      measurements: [...measurements, confirmed],
      conflicts,
    },
    confirmed,
  };
}

/** 该音管在本次维护的最终确认值（无确认则为 undefined） */
export function finalConfirmed(
  state: AppState,
  pipeId: string,
  visitId: string,
): Measurement | undefined {
  return state.measurements
    .filter((m) => m.pipeId === pipeId && m.visitId === visitId && m.status === "confirmed")
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
}

/**
 * 报告口径的最终值：
 * - 有最终确认值 → 取确认值（冲突逐字段合并的结果）；
 * - 无待处理冲突、有未被推翻的先到实测 → 先到值即最终值；
 * - 存在待处理冲突 → 不产出最终值，必须先确认。
 */
export function finalValueFor(
  state: AppState,
  pipeId: string,
  visitId: string,
): { measurement?: Measurement; kind: "confirmed" | "original" | "none" } {
  const confirmed = finalConfirmed(state, pipeId, visitId);
  if (confirmed) return { measurement: confirmed, kind: "confirmed" };
  const pending = state.conflicts.some(
    (g) => g.pipeId === pipeId && g.visitId === visitId && g.status === "pending",
  );
  if (pending) return { kind: "none" };
  const original = state.measurements
    .filter((m) => m.pipeId === pipeId && m.visitId === visitId && m.status === "original")
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
  return original ? { measurement: original, kind: "original" } : { kind: "none" };
}

export function statusLabel(s: Measurement["status"]): string {
  switch (s) {
    case "original":
      return "先到实测";
    case "pending_conflict":
      return "冲突待确认";
    case "archived_conflict":
      return "已归档";
    case "confirmed":
      return "最终确认";
  }
}
