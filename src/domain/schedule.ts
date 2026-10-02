import type { AppState, Reservation, Pipe } from "../types";
import { earliestTuneTime, overlaps } from "./utils";

export type ScheduleErrorCode =
  | "POWERED_OFF"
  | "NO_VISIT"
  | "VISIT_CLOSED"
  | "NO_PIPE"
  | "TIME_ORDER"
  | "REED_NOT_STABILIZED"
  | "PIPE_BUSY"
  | "BLOWER_ABSENT"
  | "BLOWER_NOT_RUNNING"
  | "BLOWER_CAPACITY";

export interface ScheduleError {
  code: ScheduleErrorCode;
  message: string;
  detail?: string;
}

/** 占用风机的预留（已排 / 进行中；完成或失效的不占容量） */
export function activeReservations(state: AppState): Reservation[] {
  return state.reservations.filter(
    (r) => r.status === "held" || r.status === "in_progress",
  );
}

/** 该时段风机上同时段已有预留的总风量 */
export function concurrentCfm(
  state: AppState,
  visitId: string,
  start: string,
  end: string,
  excludeId?: string,
): number {
  const visit = state.visits.find((v) => v.id === visitId);
  if (!visit) return 0;
  return activeReservations(state)
    .filter((r) => r.visitId === visitId && r.id !== excludeId)
    .filter((r) => overlaps(r.start, r.end, start, end))
    .reduce((sum, r) => sum + r.blowerCfm, 0);
}

/**
 * 排时段前统一检查：
 * 1) 排程中必须开机；
 * 2) 维护任务存在且未关闭；
 * 3) 时间合法；
 * 4) 簧片管必须在当地湿度中稳定够时长（从风机送达起算）；
 * 5) 同一音管不能被重复预留；
 * 6) 风机必须在该场馆且正在运转；
 * 7) 同时段叠加风量不能超过风机容量。
 */
export function checkReservation(
  state: AppState,
  input: { visitId: string; pipeId: string; start: string; end: string; cfm?: number },
): ScheduleError | null {
  if (!state.powered) {
    return { code: "POWERED_OFF", message: "排程系统已关机，无法新增或修改时段。" };
  }

  const visit = state.visits.find((v) => v.id === input.visitId);
  if (!visit) return { code: "NO_VISIT", message: "维护任务不存在。" };
  if (visit.closedAt) return { code: "VISIT_CLOSED", message: "该次维护已结束。" };

  const pipe = state.pipes.find((p) => p.id === input.pipeId);
  if (!pipe) return { code: "NO_PIPE", message: "音管不存在。" };
  if (pipe.venueId !== visit.venueId) {
    return { code: "NO_PIPE", message: "该音管不属于本次维护的场馆。" };
  }

  const s = new Date(input.start).getTime();
  const e = new Date(input.end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || s >= e) {
    return { code: "TIME_ORDER", message: "时段开始时间必须早于结束时间。" };
  }

  const blower = state.blowers.find((b) => b.id === visit.blowerId);
  if (!blower || blower.venueId !== visit.venueId) {
    return {
      code: "BLOWER_ABSENT",
      message: "移动风机尚未送达该场馆，簧片管无法开始稳定计时。",
    };
  }
  if (blower.state !== "running") {
    return {
      code: "BLOWER_NOT_RUNNING",
      message: blower.state === "failed" ? "风机启动失败，已进入恢复流程。" : "风机未启动。",
    };
  }

  if (pipe.isReed) {
    const earliest = earliestTuneTime(visit.arrivedAt, state.settings.stabilizeMinutes);
    if (s < earliest) {
      const need = new Date(earliest);
      return {
        code: "REED_NOT_STABILIZED",
        message: `簧片管需在当地湿度中稳定满 ${state.settings.stabilizeMinutes} 分钟，最早可排 ${need.toLocaleString("zh-CN")}。`,
      };
    }
  }

  const duplicate = activeReservations(state).find(
    (r) => r.pipeId === input.pipeId,
  );
  if (duplicate) {
    return { code: "PIPE_BUSY", message: "该音管已有未完成的预留，同一根音管不能重复排时段。" };
  }

  const cfm = input.cfm ?? pipe.demandCfm;
  const used = concurrentCfm(state, input.visitId, input.start, input.end);
  if (used + cfm > blower.capacityCfm) {
    return {
      code: "BLOWER_CAPACITY",
      message: `超出风机容量：同时段已有 ${used} CFM + 本管 ${cfm} CFM > 容量 ${blower.capacityCfm} CFM。`,
      detail: `已用 ${used} / ${blower.capacityCfm} CFM`,
    };
  }

  return null;
}

export function createReservation(
  state: AppState,
  input: { visitId: string; pipeId: string; start: string; end: string; createdBy: string },
): Reservation {
  const pipe: Pipe = state.pipes.find((p) => p.id === input.pipeId)!;
  return {
    id: `res_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`,
    visitId: input.visitId,
    pipeId: input.pipeId,
    start: input.start,
    end: input.end,
    blowerCfm: pipe.demandCfm,
    status: "held",
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
}

export function isReedStableAt(
  arrivedIso: string,
  stabilizeMinutes: number,
  atIso: string,
): boolean {
  return new Date(atIso).getTime() >= earliestTuneTime(arrivedIso, stabilizeMinutes);
}
