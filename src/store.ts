// 管风琴调音排程台 — 数据存储（localStorage 持久化，关机/故障后可恢复）
import { useSyncExternalStore } from "react";
import type {
  Blower,
  ConflictRecord,
  EnvReading,
  ID,
  Pipe,
  Reservation,
  State,
  Stop,
  Venue,
} from "./types";
import {
  applyResolution,
  diffPipes,
  invalidateByHumidity,
  markReservationsRecovery,
  markUnfinishedRecovery,
  uid,
} from "./logic";

const STORAGE_KEY = "organ-tuning-desk-v1";

function seed(): State {
  const now = Date.now();
  const iso = (minAgo: number) => new Date(now - minAgo * 60000).toISOString();

  const venues: Venue[] = [
    {
      id: "v-stmary",
      name: "圣玛丽教堂",
      location: "东侧 12 号",
      temperature: 18,
      humidity: 55,
      envUpdatedAt: iso(90),
      notes: "石结构，湿度偏稳",
    },
    {
      id: "v-concert",
      name: "音乐厅 A",
      location: "市中心文化中心",
      temperature: 22,
      humidity: 48,
      envUpdatedAt: iso(60),
      notes: "空调风口附近",
    },
    {
      id: "v-abbey",
      name: "修道院礼拜堂",
      location: "北郊修道院",
      temperature: 16,
      humidity: 62,
      envUpdatedAt: iso(120),
      notes: "地下室，湿度偏高",
    },
  ];

  const stops: Stop[] = [
    { id: "s-trumpet", venueId: "v-stmary", name: "Trumpet 8'", division: "簧片音栓" },
    { id: "s-principal", venueId: "v-concert", name: "Principal 4'", division: "主音栓" },
    { id: "s-bourdon", venueId: "v-abbey", name: "Bourdon 16'", division: "低音管" },
  ];

  const pipes: Pipe[] = [
    {
      id: "p-cs4",
      stopId: "s-trumpet",
      number: "C#4",
      pitch: "C#4",
      cent: 9,
      temperature: 18,
      humidity: 55,
      reedStatus: "需微调",
      notes: "簧片需微调",
      measuredBy: "阿林",
      measuredAt: iso(80),
    },
    {
      id: "p-g3",
      stopId: "s-principal",
      number: "G3",
      pitch: "G3",
      cent: -3,
      temperature: 22,
      humidity: 48,
      reedStatus: "正常",
      notes: "正常",
      measuredBy: "阿林",
      measuredAt: iso(50),
    },
    {
      id: "p-f2",
      stopId: "s-bourdon",
      number: "F2",
      pitch: "F2",
      cent: -12,
      temperature: 16,
      humidity: 62,
      reedStatus: "标记复检",
      notes: "标记复检",
      measuredBy: "阿林",
      measuredAt: iso(110),
    },
  ];

  const blowers: Blower[] = [
    { id: "b-1", name: "移动风机 1 号", capacity: 60, status: "待命" },
    { id: "b-2", name: "移动风机 2 号", capacity: 40, status: "待命" },
  ];

  const reservations: Reservation[] = [
    {
      id: "r-1",
      venueId: "v-stmary",
      blowerId: "b-1",
      pipeIds: ["p-cs4"],
      start: iso(60),
      end: iso(120),
      status: "预留",
      humidityAtBooking: 55,
      stabilizationMin: 45,
      tuner: "阿林",
      createdAt: iso(100),
      note: "首场预留",
    },
  ];

  // 预置一条待核对冲突：另一位调音师对 C#4 提交了不同实测值
  const incoming: Pipe = {
    ...pipes[0],
    cent: 6,
    temperature: 19,
    humidity: 58,
    reedStatus: "正常",
    notes: "复测后改善",
    measuredBy: "老周",
    measuredAt: iso(20),
  };
  const conflicts: ConflictRecord[] = [
    {
      id: "c-1",
      pipeId: "p-cs4",
      pipeLabel: "C#4",
      existing: { ...pipes[0] },
      incoming: { ...incoming },
      diffs: diffPipes(pipes[0], incoming),
      status: "待核对",
      resolution: {},
      createdAt: iso(20),
      incomingBy: "老周",
    },
  ];

  const readings: EnvReading[] = [
    { id: "e-1", venueId: "v-stmary", temperature: 18, humidity: 55, at: iso(90), by: "阿林" },
    { id: "e-2", venueId: "v-concert", temperature: 22, humidity: 48, at: iso(60), by: "阿林" },
    { id: "e-3", venueId: "v-abbey", temperature: 16, humidity: 62, at: iso(120), by: "阿林" },
  ];

  return {
    venues,
    stops,
    pipes,
    blowers,
    reservations,
    conflicts,
    readings,
    tuners: ["阿林", "老周"],
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* 解析失败则重建 */
  }
  const s = seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return s;
}

let state: State = load();
const listeners = new Set<() => void>();

function commit(updater: (s: State) => State) {
  state = updater(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 存储失败仅保内存 */
  }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state);
}

// ---------- 场馆 / 音栓 ----------
export function addVenue(v: Omit<Venue, "id" | "temperature" | "humidity" | "envUpdatedAt">) {
  commit((s) => ({ ...s, venues: [...s.venues, { ...v, id: uid(), temperature: null, humidity: null, envUpdatedAt: null }] }));
}

export function addStop(st: Omit<Stop, "id">) {
  commit((s) => ({ ...s, stops: [...s.stops, { ...st, id: uid() }] }));
}

// ---------- 音管实测 ----------
export interface MeasurementInput {
  stopId: string;
  number: string;
  pitch: string;
  cent: number;
  temperature: number | null;
  humidity: number | null;
  reedStatus: Pipe["reedStatus"];
  notes: string;
  measuredBy: string;
}

/**
 * 提交实测值。若该音管已有实测值，则后到的一份保留为冲突版本，
 * 列出字段差异待确认，不覆盖先到整条记录。
 */
export function submitMeasurement(input: MeasurementInput): { conflict: boolean } {
  let conflict = false;
  commit((s) => {
    const existing = s.pipes.find(
      (p) => p.stopId === input.stopId && p.number.trim() === input.number.trim(),
    );
    const now = new Date().toISOString();
    const incoming: Pipe = {
      id: existing ? existing.id : uid(),
      stopId: input.stopId,
      number: input.number.trim(),
      pitch: input.pitch,
      cent: Number(input.cent),
      temperature: input.temperature,
      humidity: input.humidity,
      reedStatus: input.reedStatus,
      notes: input.notes,
      measuredBy: input.measuredBy,
      measuredAt: now,
    };

    if (!existing || !existing.measuredAt) {
      // 首次实测：直接落为最终值
      if (existing) {
        return {
          ...s,
          pipes: s.pipes.map((p) => (p.id === existing.id ? incoming : p)),
        };
      }
      return { ...s, pipes: [...s.pipes, incoming] };
    }

    // 已有实测：保留先到整条，后到作为冲突版本
    conflict = true;
    const diffs = diffPipes(existing, incoming);
    const record: ConflictRecord = {
      id: uid(),
      pipeId: existing.id,
      pipeLabel: existing.number,
      existing: { ...existing },
      incoming: { ...incoming },
      diffs,
      status: "待核对",
      resolution: {},
      createdAt: now,
      incomingBy: input.measuredBy,
    };
    return { ...s, conflicts: [...s.conflicts, record] };
  });
  return { conflict };
}

/** 确认冲突：按字段选择先到或后到，落为最终确认值，并重算异常标记 */
export function resolveConflict(
  conflictId: ID,
  resolution: ConflictRecord["resolution"],
) {
  commit((s) => {
    const c = s.conflicts.find((x) => x.id === conflictId);
    if (!c) return s;
    const finalPipe = applyResolution(
      { ...c.existing, id: c.pipeId, stopId: s.pipes.find((p) => p.id === c.pipeId)?.stopId ?? "" },
      { ...c.incoming, id: c.pipeId, stopId: s.pipes.find((p) => p.id === c.pipeId)?.stopId ?? "" },
      resolution,
    );
    return {
      ...s,
      pipes: s.pipes.map((p) => (p.id === c.pipeId ? finalPipe : p)),
      conflicts: s.conflicts.map((x) =>
        x.id === conflictId ? { ...x, status: "已确认" as const, resolution } : x,
      ),
    };
  });
}

// ---------- 温湿度 ----------
export function addEnvReading(r: Omit<EnvReading, "id" | "at">) {
  commit((s) => {
    const at = new Date().toISOString();
    const readings = [...s.readings, { ...r, id: uid(), at }];
    // 湿度变化：原预留失效
    const reservations = invalidateByHumidity(s.reservations, r.venueId);
    const venues = s.venues.map((v) =>
      v.id === r.venueId
        ? { ...v, temperature: r.temperature, humidity: r.humidity, envUpdatedAt: at }
        : v,
    );
    return { ...s, readings, reservations, venues };
  });
}

// ---------- 风机 ----------
export function setBlowerStatus(blowerId: ID, status: Blower["status"]) {
  commit((s) => {
    let reservations = s.reservations;
    if (status === "故障") {
      // 风机启动失败：相关预留转待恢复，数据仍留在本机
      reservations = markReservationsRecovery(s.reservations, blowerId);
    }
    return {
      ...s,
      blowers: s.blowers.map((b) => (b.id === blowerId ? { ...b, status } : b)),
      reservations,
    };
  });
}

// ---------- 预留 / 排程 ----------
export interface ReservationInput {
  venueId: ID;
  blowerId: ID;
  pipeIds: ID[];
  start: string;
  end: string;
  stabilizationMin: number;
  tuner: string;
  note: string;
}

export function createReservation(input: ReservationInput) {
  commit((s) => {
    const venue = s.venues.find((v) => v.id === input.venueId);
    const r: Reservation = {
      id: uid(),
      venueId: input.venueId,
      blowerId: input.blowerId,
      pipeIds: input.pipeIds,
      start: input.start,
      end: input.end,
      status: "预留",
      humidityAtBooking: venue?.humidity ?? null,
      stabilizationMin: input.stabilizationMin,
      tuner: input.tuner,
      createdAt: new Date().toISOString(),
      note: input.note,
    };
    return { ...s, reservations: [...s.reservations, r] };
  });
}

export function confirmReservation(id: ID) {
  commit((s) => ({
    ...s,
    reservations: s.reservations.map((r) =>
      r.id === id && r.status === "预留" ? { ...r, status: "已确认" as const } : r,
    ),
  }));
}

export function completeReservation(id: ID) {
  commit((s) => ({
    ...s,
    reservations: s.reservations.map((r) =>
      r.id === id && (r.status === "已确认" || r.status === "预留")
        ? { ...r, status: "已完成" as const }
        : r,
    ),
  }));
}

/** 关机：未完成预留转待恢复，数据留在本机 */
export function shutdown() {
  commit((s) => ({
    ...s,
    reservations: markUnfinishedRecovery(s.reservations),
  }));
}

/** 恢复后重新安排：把待恢复/已失效预留按新风机与时段重建为预留 */
export function rebookReservation(
  id: ID,
  patch: Partial<Pick<Reservation, "blowerId" | "start" | "end" | "pipeIds" | "stabilizationMin">>,
) {
  commit((s) => ({
    ...s,
    reservations: s.reservations.map((r) =>
      r.id === id
        ? {
            ...r,
            ...patch,
            status: "预留" as const,
            humidityAtBooking:
              s.venues.find((v) => v.id === r.venueId)?.humidity ?? r.humidityAtBooking,
          }
        : r,
    ),
  }));
}

export function resetAll() {
  const s = seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  state = s;
  listeners.forEach((l) => l());
}
