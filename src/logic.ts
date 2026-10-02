// 管风琴调音排程台 — 核心逻辑（纯函数）
import type {
  Blower,
  FieldDiff,
  ID,
  Pipe,
  PipeSnapshot,
  Reservation,
  Venue,
} from "./types";

/** 音分偏差超限阈值（绝对值，音分） */
export const CENT_LIMIT = 8;
/** 湿度适宜区间（百分比） */
export const HUMIDITY_RANGE = [30, 70] as const;
/** 温度适宜区间（摄氏度） */
export const TEMPERATURE_RANGE = [15, 28] as const;
/** 簧片管默认稳定时长（分钟） */
export const DEFAULT_STABILIZATION_MIN = 45;
/** 默认时段时长（分钟） */
export const DEFAULT_SLOT_MIN = 60;

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const FIELD_LABELS: Record<string, string> = {
  number: "音管编号",
  pitch: "音高",
  cent: "音分偏差",
  temperature: "温度",
  humidity: "湿度",
  reedStatus: "簧片状态",
  notes: "维修备注",
  measuredBy: "实测人",
  measuredAt: "实测时间",
};

const snap = (p: Pipe): PipeSnapshot => ({
  number: p.number,
  pitch: p.pitch,
  cent: p.cent,
  temperature: p.temperature,
  humidity: p.humidity,
  reedStatus: p.reedStatus,
  notes: p.notes,
  measuredBy: p.measuredBy,
  measuredAt: p.measuredAt,
});

/** 比较两条实测值，列出字段差异（先到 vs 后到） */
export function diffPipes(existing: Pipe, incoming: Pipe): FieldDiff[] {
  const a = snap(existing);
  const b = snap(incoming);
  const keys = Object.keys(FIELD_LABELS) as (keyof PipeSnapshot)[];
  const diffs: FieldDiff[] = [];
  for (const k of keys) {
    const av = a[k] === null || a[k] === undefined ? "—" : String(a[k]);
    const bv = b[k] === null || b[k] === undefined ? "—" : String(b[k]);
    if (av !== bv) {
      diffs.push({
        field: k,
        label: FIELD_LABELS[k] ?? k,
        existing: av,
        incoming: bv,
      });
    }
  }
  return diffs;
}

/** 应用冲突解决结果，返回最终确认的音管字段 */
export function applyResolution(
  existing: Pipe,
  incoming: Pipe,
  resolution: Partial<Record<keyof PipeSnapshot, "existing" | "incoming">>,
): Pipe {
  const out: Pipe = { ...existing };
  const keys = Object.keys(FIELD_LABELS) as (keyof PipeSnapshot)[];
  for (const k of keys) {
    const choice = resolution[k];
    if (choice === "incoming") {
      (out as unknown as Record<string, unknown>)[k] = incoming[k];
    }
  }
  return out;
}

export interface Anomaly {
  pipeId: string;
  reasons: string[];
}

/**
 * 按最终确认值重算异常标记。
 * 只依据已实测且无待核对冲突的最终确认值。
 */
export function recomputeAnomalies(
  pipes: Pipe[],
  pendingConflictPipeIds: Set<string>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of pipes) {
    if (!p.measuredAt) continue; // 未实测不参与
    if (pendingConflictPipeIds.has(p.id)) continue; // 待核对，不按先到值下结论
    const reasons: string[] = [];
    if (Math.abs(p.cent) >= CENT_LIMIT) {
      reasons.push(`音分偏差 ${p.cent > 0 ? "+" : ""}${p.cent}c（超限 ±${CENT_LIMIT}c）`);
    }
    if (p.reedStatus === "需微调" || p.reedStatus === "标记复检" || p.reedStatus === "待修") {
      reasons.push(`簧片状态：${p.reedStatus}`);
    }
    if (p.humidity !== null && (p.humidity < HUMIDITY_RANGE[0] || p.humidity > HUMIDITY_RANGE[1])) {
      reasons.push(`湿度 ${p.humidity}%（适宜 ${HUMIDITY_RANGE[0]}–${HUMIDITY_RANGE[1]}%）`);
    }
    if (p.temperature !== null && (p.temperature < TEMPERATURE_RANGE[0] || p.temperature > TEMPERATURE_RANGE[1])) {
      reasons.push(`温度 ${p.temperature}℃（适宜 ${TEMPERATURE_RANGE[0]}–${TEMPERATURE_RANGE[1]}℃）`);
    }
    if (reasons.length) map.set(p.id, reasons);
  }
  return map;
}

/** 簧片管最早可定音时间：需在当地湿度中稳定够时长 */
export function earliestTuningStart(venue: Venue, stabilizationMin: number, from = new Date()): Date {
  const base = venue.envUpdatedAt ? new Date(venue.envUpdatedAt) : from;
  const start = new Date(Math.max(base.getTime(), from.getTime()));
  start.setMinutes(start.getMinutes() + stabilizationMin);
  return start;
}

export interface SlotValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 校验排时段：
 * 1) 稳定时长 —— 不得早于最早可定音时间；
 * 2) 风机容量 —— 同一风机在重叠时段只能驻留一个场馆，且音管总数不超过容量。
 */
export function validateSlot(args: {
  venue: Venue;
  blower: Blower | undefined;
  pipeCount: number;
  start: Date;
  end: Date;
  stabilizationMin: number;
  reservations: Reservation[];
  excludeId?: string;
}): SlotValidation {
  const { venue, blower, pipeCount, start, end, stabilizationMin, reservations, excludeId } = args;
  const errors: string[] = [];
  const warnings: string[] = [];

  const earliest = earliestTuningStart(venue, stabilizationMin);
  if (start.getTime() < earliest.getTime()) {
    errors.push(
      `簧片管需在当地湿度稳定 ${stabilizationMin} 分钟，最早可定音时间为 ${fmtDateTime(
        earliest.toISOString(),
      )}`,
    );
  }

  if (!blower) {
    errors.push("请选择风机");
    return { ok: false, errors, warnings };
  }
  if (blower.status === "故障") {
    errors.push(`风机「${blower.name}」故障，无法启动，请更换风机或先修复`);
  }

  if (pipeCount <= 0) {
    errors.push("请选择要维护的音管");
  } else if (pipeCount > blower.capacity) {
    errors.push(
      `音管数 ${pipeCount} 超过风机「${blower.name}」容量 ${blower.capacity}，请分批或更换风机`,
    );
  }

  // 重叠时段校验
  const s = start.getTime();
  const e = end.getTime();
  for (const r of reservations) {
    if (r.id === excludeId) continue;
    if (r.status === "已失效" || r.status === "已完成") continue;
    const rs = new Date(r.start).getTime();
    const re = new Date(r.end).getTime();
    const overlap = s < re && e > rs;
    if (!overlap) continue;

    if (r.blowerId === blower.id) {
      if (r.venueId !== venue.id) {
        errors.push(
          `风机「${blower.name}」在 ${fmtTime(r.start)}–${fmtTime(
            r.end,
          )} 已驻留其他场馆，移动风机无法同时服务两处`,
        );
      } else {
        // 同场馆同风机重叠：容量合并校验
        warnings.push(
          `与 ${fmtTime(r.start)}–${fmtTime(r.end)} 的预留重叠，合并音管数请勿超过风机容量`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** 湿度变化后，将场馆内仍有效的预布置为失效 */
export function invalidateByHumidity(
  reservations: Reservation[],
  venueId: ID,
): Reservation[] {
  return reservations.map((r) => {
    if (r.venueId !== venueId) return r;
    if (r.status === "预留" || r.status === "已确认") {
      return { ...r, status: "已失效" as const };
    }
    return r;
  });
}

/** 风机故障后，相关预布置为待恢复 */
export function markReservationsRecovery(
  reservations: Reservation[],
  blowerId: ID,
): Reservation[] {
  return reservations.map((r) => {
    if (r.blowerId !== blowerId) return r;
    if (r.status === "预留" || r.status === "已确认") {
      return { ...r, status: "待恢复" as const };
    }
    return r;
  });
}

/** 关机/退出时，未完成预布置为待恢复（数据仍留在本机） */
export function markUnfinishedRecovery(reservations: Reservation[]): Reservation[] {
  return reservations.map((r) => {
    if (r.status === "预留" || r.status === "已确认") {
      return { ...r, status: "待恢复" as const };
    }
    return r;
  });
}
