import { createContext, useContext } from "react";
import type {
  AppState,
  Blower,
  ConflictGroup,
  EnvironmentReading,
  LogEvent,
  Measurement,
  Pipe,
  Reservation,
  Settings,
  Venue,
  Visit,
} from "./types";
import { uid } from "./domain/utils";

const STORAGE_KEY = "organ-scheduler-v1";

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 本机存储不可用时静默，界面仍可使用
  }
}

export function ev(kind: LogEvent["kind"], message: string): LogEvent {
  return { id: uid("ev"), time: new Date().toISOString(), kind, message };
}

export type Action =
  | { type: "POWER_ON" }
  | { type: "POWER_OFF" }
  | { type: "REPLACE_ALL"; state: AppState }
  | { type: "ADD_VENUE"; venue: Venue }
  | { type: "ADD_PIPE"; pipe: Pipe }
  | { type: "UPDATE_PIPE"; pipe: Pipe }
  | { type: "ADD_READING"; reading: EnvironmentReading; invalidated: Reservation[] }
  | { type: "DELIVER_BLOWER"; blower: Blower; visit: Visit }
  | { type: "BLOWER_START" }
  | { type: "BLOWER_FAIL" }
  | { type: "BLOWER_RECOVER" }
  | { type: "CLOSE_VISIT"; visitId: string; at: string }
  | { type: "ADD_RESERVATION"; reservation: Reservation }
  | { type: "START_RESERVATION"; id: string; at: string }
  | { type: "COMPLETE_RESERVATION"; id: string; at: string }
  | {
      type: "SUBMIT_MEASUREMENT";
      measurement: Measurement;
      conflict?: ConflictGroup;
    }
  | { type: "RESOLVE_CONFLICT"; state: AppState }
  | { type: "UPDATE_SETTINGS"; settings: Settings };

function addEvents(state: AppState, events: LogEvent[]): LogEvent[] {
  return [...events, ...state.events].slice(0, 200);
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "POWER_ON":
      return {
        ...state,
        powered: true,
        events: addEvents(state, [ev("ok", "系统已开机：本机原有预留与实测值完整保留，可继续未完成的排程。")]),
      };
    case "POWER_OFF":
      return {
        ...state,
        powered: false,
        events: addEvents(state, [ev("warn", "排程系统关机：数据仍保存在本机，期间不能修改排程或提交实测。")]),
      };
    case "REPLACE_ALL":
      return action.state;
    case "ADD_VENUE":
      return { ...state, venues: [...state.venues, action.venue] };
    case "ADD_PIPE":
      return { ...state, pipes: [...state.pipes, action.pipe] };
    case "UPDATE_PIPE":
      return {
        ...state,
        pipes: state.pipes.map((p) => (p.id === action.pipe.id ? action.pipe : p)),
      };
    case "ADD_READING": {
      const messages = action.invalidated.map((r) =>
        ev("bad", `湿度波动超限，预留 ${r.id}（${r.pipeId}）已失效，原时段需重新安排。`),
      );
      return {
        ...state,
        readings: [...state.readings, action.reading],
        reservations: state.reservations.map((r) => {
          const hit = action.invalidated.find((x) => x.id === r.id);
          return hit ?? r;
        }),
        events: addEvents(state, [
          ev("info", `登记温湿度：${action.reading.tempC}℃ / ${action.reading.humidityRh}%RH。`),
          ...messages,
        ]),
      };
    }
    case "DELIVER_BLOWER":
      return {
        ...state,
        blowers: state.blowers.map((b) =>
          b.id === action.blower.id ? action.blower : b,
        ),
        visits: [...state.visits, action.visit],
        events: addEvents(state, [
          ev(
            "ok",
            `${action.blower.name} 轮送到「${
              state.venues.find((v) => v.id === action.visit.venueId)?.name ?? action.visit.venueId
            }」并启动，簧片管开始 ${state.settings.stabilizeMinutes} 分钟稳定计时。`,
          ),
        ]),
      };
    case "BLOWER_START":
      return {
        ...state,
        blowers: state.blowers.map((b) => ({ ...b, state: "running" })),
        events: addEvents(state, [ev("ok", "风机启动成功。")]),
      };
    case "BLOWER_FAIL":
      return {
        ...state,
        blowers: state.blowers.map((b) => ({ ...b, state: "failed" })),
        events: addEvents(state, [
          ev("bad", "风机启动失败，已进入恢复流程：原有预留与实测值保留在本机，不能新增时段。"),
        ]),
      };
    case "BLOWER_RECOVER":
      return {
        ...state,
        blowers: state.blowers.map((b) =>
          b.state === "failed" ? { ...b, state: "running" } : b,
        ),
        events: addEvents(state, [
          ev("ok", "风机已恢复运转：继续未完成的部分，原预留与实测值不变。"),
        ]),
      };
    case "CLOSE_VISIT":
      return {
        ...state,
        visits: state.visits.map((v) =>
          v.id === action.visitId ? { ...v, closedAt: action.at } : v,
        ),
        events: addEvents(state, [ev("info", "单次维护任务已结束。")]),
      };
    case "ADD_RESERVATION":
      return {
        ...state,
        reservations: [...state.reservations, action.reservation],
        events: addEvents(state, [
          ev("info", `已排时段 ${action.reservation.id}，占用风量 ${action.reservation.blowerCfm} CFM。`),
        ]),
      };
    case "START_RESERVATION":
      return {
        ...state,
        reservations: state.reservations.map((r) =>
          r.id === action.id
            ? { ...r, status: "in_progress", startedAt: action.at }
            : r,
        ),
        events: addEvents(state, [ev("info", `时段 ${action.id} 开始定音。`)]),
      };
    case "COMPLETE_RESERVATION":
      return {
        ...state,
        reservations: state.reservations.map((r) =>
          r.id === action.id
            ? { ...r, status: "done", completedAt: action.at }
            : r,
        ),
        events: addEvents(state, [ev("ok", `时段 ${action.id} 完成。`)]),
      };
    case "SUBMIT_MEASUREMENT": {
      const pipe = state.pipes.find((p) => p.id === action.measurement.pipeId);
      const label = `${action.measurement.pitch}（${pipe?.stopName ?? action.measurement.pipeId}）`;
      const events = action.conflict
        ? [
            ev(
              "warn",
              `${action.measurement.author} 对 ${label} 的第二份实测已保留为冲突版本；` +
                "先到那份不覆盖，待逐字段确认。",
            ),
          ]
        : [ev("info", `${action.measurement.author} 提交 ${label} 实测值。`)];
      return {
        ...state,
        measurements: [...state.measurements, action.measurement],
        conflicts: action.conflict ? [...state.conflicts, action.conflict] : state.conflicts,
        events: addEvents(state, events),
      };
    }
    case "RESOLVE_CONFLICT":
      return {
        ...action.state,
        events: addEvents(action.state, [
          ev("ok", "冲突已逐字段确认，生成最终确认值；两份原始记录均已保留可追溯。"),
        ]),
      };
    case "UPDATE_SETTINGS":
      return { ...state, settings: action.settings };
    default:
      return state;
  }
}

export interface Store {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreContext missing");
  return ctx;
}
