import type { AppState, Reservation } from "../types";
import { uid } from "./utils";

/** 场馆最近一次温湿度记录 */
export function latestReading(state: AppState, venueId: string) {
  return state.readings
    .filter((r) => r.venueId === venueId)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
}

export interface ReadingResult {
  state: AppState;
  invalidated: Reservation[];
}

/**
 * 登记一条温湿度。若与该场馆上一条记录相比湿度波动超过阈值，
 * 该场馆当前所有 held / in_progress 预留立即失效（可重新安排）。
 */
export function applyReading(
  state: AppState,
  input: { venueId: string; time: string; tempC: number; humidityRh: number; note?: string },
): ReadingResult {
  const prev = latestReading(state, input.venueId);
  const reading = {
    id: uid("env"),
    venueId: input.venueId,
    time: input.time,
    tempC: input.tempC,
    humidityRh: input.humidityRh,
    note: input.note,
  };

  let invalidated: Reservation[] = [];
  let reservations = state.reservations;

  if (prev && Math.abs(input.humidityRh - prev.humidityRh) > state.settings.humidityDeltaRh) {
    const visitIds = new Set(
      state.visits.filter((v) => v.venueId === input.venueId && !v.closedAt).map((v) => v.id),
    );
    reservations = state.reservations.map((r) => {
      if (
        visitIds.has(r.visitId) &&
        (r.status === "held" || r.status === "in_progress")
      ) {
        const copy = {
          ...r,
          status: "invalidated" as const,
          invalidateAt: input.time,
          invalidateReason:
            `湿度由 ${prev.humidityRh}%RH 变为 ${input.humidityRh}%RH，` +
            `波动超过 ${state.settings.humidityDeltaRh}%RH，原预留失效`,
        };
        invalidated.push(copy);
        return copy;
      }
      return r;
    });
  }

  return {
    state: { ...state, readings: [...state.readings, reading], reservations },
    invalidated,
  };
}
