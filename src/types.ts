// 管风琴调音排程台 — 核心类型定义

export type ID = string;

/** 分组（音栓所属分组） */
export type Division = "主音栓" | "簧片音栓" | "混合音栓" | "低音管";

export const DIVISIONS: Division[] = ["主音栓", "簧片音栓", "混合音栓", "低音管"];

/** 簧片状态 */
export type ReedStatus = "正常" | "需微调" | "标记复检" | "待修";

export const REED_STATUSES: ReedStatus[] = ["正常", "需微调", "标记复检", "待修"];

/** 场馆（教堂 / 音乐厅） */
export interface Venue {
  id: ID;
  name: string; // 场馆名称
  location: string; // 地点
  temperature: number | null; // 最近温度
  humidity: number | null; // 最近湿度
  envUpdatedAt: string | null; // 最近温湿度记录时间
  notes: string;
}

/** 音栓 */
export interface Stop {
  id: ID;
  venueId: ID;
  name: string; // 音栓名称，如 Trumpet 8'
  division: Division; // 分组
}

/** 音管实测值 */
export interface Pipe {
  id: ID;
  stopId: ID;
  number: string; // 音管编号，如 C#4
  pitch: string; // 音高
  cent: number; // 音分偏差（音分）
  temperature: number | null; // 温度
  humidity: number | null; // 湿度
  reedStatus: ReedStatus; // 簧片状态
  notes: string; // 维修备注
  measuredBy: string; // 实测调音师
  measuredAt: string | null; // 实测时间
}

/** 风机 */
export interface Blower {
  id: ID;
  name: string;
  capacity: number; // 风机容量（可同时服务音管数）
  status: "待命" | "运行中" | "故障";
}

/** 预留状态 */
export type ReservationStatus = "预留" | "已确认" | "已失效" | "待恢复" | "已完成";

/** 时段预留 */
export interface Reservation {
  id: ID;
  venueId: ID;
  blowerId: ID;
  pipeIds: ID[];
  start: string; // ISO 开始时间
  end: string; // ISO 结束时间
  status: ReservationStatus;
  humidityAtBooking: number | null; // 预定时湿度（湿度变化即失效）
  stabilizationMin: number; // 所需稳定时长（分钟）
  tuner: string;
  createdAt: string;
  note: string;
}

/** 实测值快照（冲突版本用） */
export type PipeSnapshot = Omit<Pipe, "id" | "stopId">;

/** 字段差异 */
export interface FieldDiff {
  field: keyof PipeSnapshot;
  label: string;
  existing: string; // 先到值
  incoming: string; // 后到（冲突版本）值
}

/** 冲突记录：两名调音师提交同一根音管的实测值 */
export interface ConflictRecord {
  id: ID;
  pipeId: ID;
  pipeLabel: string; // 音管编号（用于展示）
  existing: PipeSnapshot; // 先到的整条（保留不动）
  incoming: PipeSnapshot; // 后到的冲突版本
  diffs: FieldDiff[];
  status: "待核对" | "已确认";
  resolution: Partial<Record<keyof PipeSnapshot, "existing" | "incoming">>;
  createdAt: string;
  incomingBy: string;
}

/** 温湿度记录 */
export interface EnvReading {
  id: ID;
  venueId: ID;
  temperature: number;
  humidity: number;
  at: string;
  by: string;
}

/** 持久化状态 */
export interface State {
  venues: Venue[];
  stops: Stop[];
  pipes: Pipe[];
  blowers: Blower[];
  reservations: Reservation[];
  conflicts: ConflictRecord[];
  readings: EnvReading[];
  tuners: string[];
}
