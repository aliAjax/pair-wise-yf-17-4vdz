import type { AppState, Measurement, Pipe, Reservation, Visit } from "../types";
import { finalValueFor } from "./measurements";
import { earliestTuneTime, fmtDateTime } from "./utils";

export interface ReportRow {
  pipe: Pipe;
  reservation: Reservation | undefined;
  /** 报告口径最终值（确认值或无冲突时的先到值） */
  final: Measurement | undefined;
  finalKind: "confirmed" | "original" | "none";
  flags: {
    pendingConflict: boolean;
    noMeasurement: boolean;
    centsOver: boolean;
    reedBad: boolean;
    notStable: boolean;
    invalidated: boolean;
  };
  abnormal: boolean;
}

export interface VisitReport {
  visit: Visit;
  generatedAt: string;
  rows: ReportRow[];
  summary: {
    total: number;
    confirmed: number;
    abnormal: number;
    invalidated: number;
    centsOver: number;
    reedBad: number;
    noMeasurement: number;
    pendingConflicts: number;
  };
}

/**
 * 单次维护报告：每次都按当前“最终确认值”重算异常标记；
 * 没有冲突的音管，其先到实测即为最终值；冲突版本一律不进入报告。
 */
export function buildVisitReport(
  state: AppState,
  visitId: string,
  generatedAt: string = new Date().toISOString(),
): VisitReport | null {
  const visit = state.visits.find((v) => v.id === visitId);
  if (!visit) return null;

  const reservations = state.reservations
    .filter((r) => r.visitId === visitId)
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

  const pipeIds = Array.from(new Set(reservations.map((r) => r.pipeId)));
  const tolerance = state.settings.toleranceCents;
  const stableMin = state.settings.stabilizeMinutes;

  const rows: ReportRow[] = pipeIds.map((pipeId) => {
    const pipe = state.pipes.find((p) => p.id === pipeId)!;
    const pipeRes = reservations.filter((r) => r.pipeId === pipeId);
    const latest = pipeRes[0];
    const value = finalValueFor(state, pipeId, visitId);
    const final = value.measurement;
    const invalidated = pipeRes.some((r) => r.status === "invalidated");
    const pendingConflict = value.kind === "none" &&
      state.conflicts.some(
        (g) => g.pipeId === pipeId && g.visitId === visitId && g.status === "pending",
      );

    const noMeasurement = !final;
    const centsOver = !!final && Math.abs(final.cents) > tolerance;
    const reedBad = !!final && final.reedState !== "正常";
    const earliest = earliestTuneTime(visit.arrivedAt, stableMin);
    const notStable =
      pipe.isReed &&
      (final
        ? new Date(final.time).getTime() < earliest
        : latest !== undefined && new Date(latest.start).getTime() < earliest);

    const flags = { pendingConflict, noMeasurement, centsOver, reedBad, notStable, invalidated };
    return {
      pipe,
      reservation: latest,
      final,
      finalKind: value.kind,
      flags,
      abnormal: Object.values(flags).some(Boolean),
    };
  });

  const pendingConflicts = state.conflicts.filter(
    (g) => g.visitId === visitId && g.status === "pending",
  ).length;

  return {
    visit,
    generatedAt,
    rows,
    summary: {
      total: rows.length,
      confirmed: rows.filter((r) => r.final).length,
      abnormal: rows.filter((r) => r.abnormal).length,
      invalidated: rows.filter((r) => r.flags.invalidated).length,
      centsOver: rows.filter((r) => r.flags.centsOver).length,
      reedBad: rows.filter((r) => r.flags.reedBad).length,
      noMeasurement: rows.filter((r) => r.flags.noMeasurement).length,
      pendingConflicts,
    },
  };
}

export const FLAG_META: { key: keyof ReportRow["flags"]; label: string; tone: "warn" | "bad" }[] = [
  { key: "pendingConflict", label: "冲突未确认，无最终值", tone: "bad" },
  { key: "noMeasurement", label: "缺实测值", tone: "warn" },
  { key: "centsOver", label: "音分超限", tone: "bad" },
  { key: "reedBad", label: "簧片异常", tone: "bad" },
  { key: "notStable", label: "稳定时长不足", tone: "bad" },
  { key: "invalidated", label: "湿度波动原预留失效", tone: "warn" },
];

export function reportStamp(r: VisitReport): string {
  return `单次维护报告 · 生成于 ${fmtDateTime(r.generatedAt)}`;
}
