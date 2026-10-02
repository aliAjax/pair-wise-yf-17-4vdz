// 管风琴调音排程台：核心数据模型

export type ReedState = "正常" | "轻微锈蚀" | "锈蚀" | "待更换";

export const REED_STATES: ReedState[] = ["正常", "轻微锈蚀", "锈蚀", "待更换"];

export type PipeGroup = "主音栓" | "簧片音栓" | "混合音栓" | "低音管";

export const PIPE_GROUPS: PipeGroup[] = ["主音栓", "簧片音栓", "混合音栓", "低音管"];

/** 场馆（教堂 / 音乐厅等） */
export interface Venue {
  id: string;
  name: string;
  location?: string;
}

/** 音管登记 */
export interface Pipe {
  id: string;
  code: string; // 音管编号
  venueId: string;
  stopName: string; // 音栓
  group: PipeGroup; // 分组
  pitch: string; // 音高，如 A4
  isReed: boolean; // 是否簧片管
  demandCfm: number; // 定音时占用的风机风量 CFM
  reedState: ReedState; // 簧片状态
  notes?: string; // 维修备注
}

/** 温湿度实测记录 */
export interface EnvironmentReading {
  id: string;
  venueId: string;
  time: string; // ISO
  tempC: number;
  humidityRh: number;
  note?: string;
}

export type BlowerState = "idle" | "running" | "failed";

/** 移动风机（全组轮用一台） */
export interface Blower {
  id: string;
  name: string;
  capacityCfm: number; // 风机容量 CFM
  venueId: string | null; // 当前轮送到的场馆
  state: BlowerState;
}

/** 单次场馆维护任务（风机送达即开启） */
export interface Visit {
  id: string;
  venueId: string;
  blowerId: string;
  title: string;
  /** 移动风机送达时间，簧片稳定时长从此起算 */
  arrivedAt: string;
  createdAt: string;
  closedAt?: string;
}

export type ReservationStatus = "held" | "in_progress" | "done" | "invalidated";

/** 时段预留 */
export interface Reservation {
  id: string;
  visitId: string;
  pipeId: string;
  start: string;
  end: string;
  blowerCfm: number; // 预留时锁定的风量
  status: ReservationStatus;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  invalidateAt?: string;
  invalidateReason?: string;
}

export type MeasurementStatus =
  | "original" // 先到的实测
  | "pending_conflict" // 后到的冲突版本，待确认
  | "archived_conflict" // 冲突处理后归档（数据原样保留）
  | "confirmed"; // 最终确认值

/** 一次实测值提交 */
export interface Measurement {
  id: string;
  pipeId: string;
  visitId: string;
  reservationId?: string;
  author: string; // 调音师
  time: string;
  pitch: string; // 实测音高
  cents: number; // 音分偏差
  tempC?: number;
  humidityRh?: number;
  reedState: ReedState;
  note?: string;
  status: MeasurementStatus;
  groupId?: string;
}

/** 两名调音师对同一根音管的冲突组 */
export interface ConflictGroup {
  id: string;
  pipeId: string;
  visitId: string;
  /** 先到的那份（基线，任何时候都不被整条覆盖） */
  originalId: string;
  /** 后到的冲突版本 */
  conflictId: string;
  status: "pending" | "resolved";
  /** 逐字段确认结果 */
  resolution: { field: string; source: "original" | "conflict" }[];
  resolvedMeasurementId?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface LogEvent {
  id: string;
  time: string;
  kind: "info" | "warn" | "bad" | "ok";
  message: string;
}

export interface Settings {
  /** 簧片管需在场馆湿度中稳定的分钟数 */
  stabilizeMinutes: number;
  /** 音分偏差报警阈值（绝对值） */
  toleranceCents: number;
  /** 相邻两次记录允许的湿度波动（%RH，超过则预留失效） */
  humidityDeltaRh: number;
}

export interface AppState {
  version: 1;
  powered: boolean;
  venues: Venue[];
  pipes: Pipe[];
  readings: EnvironmentReading[];
  blowers: Blower[];
  visits: Visit[];
  reservations: Reservation[];
  measurements: Measurement[];
  conflicts: ConflictGroup[];
  events: LogEvent[];
  settings: Settings;
}
