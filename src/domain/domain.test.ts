import { describe, it, expect, beforeEach } from "vitest";
import { buildSeed } from "../seed";
import type { AppState } from "../types";
import { checkReservation, activeReservations } from "./schedule";
import { applyReading } from "./environment";
import {
  submitMeasurement,
  resolveConflict,
  diffMeasurements,
  pendingConflicts,
  statusLabel,
} from "./measurements";
import { buildVisitReport } from "./report";
import { fromLocalInput } from "./utils";

let state: AppState;

beforeEach(() => {
  state = buildSeed();
});

describe("排程：风机容量 + 簧片稳定时长", () => {
  it("容量足够时可以并排安排", () => {
    const start = new Date(Date.now() + 10 * 3600000).toISOString();
    const end = new Date(Date.now() + 10 * 3600000 + 20 * 60000).toISOString();
    // 演示数据里该时段为空
    expect(checkReservation(state, { visitId: "visit_stmary_oct", pipeId: "pipe_oboe_a4", start, end })).toBeNull();
    expect(
      checkReservation(state, { visitId: "visit_stmary_oct", pipeId: "pipe_mixture_d5", start, end }),
    ).toBeNull();
  });

  it("同时段风量叠加超过容量被拒绝，并给出已用量", () => {
    const empty: AppState = { ...state, reservations: [] };
    const start = new Date(Date.now() + 10 * 3600000).toISOString();
    const end = new Date(Date.now() + 10 * 3600000 + 20 * 60000).toISOString();
    const mk = (id: string, pipeId: string, cfm: number) => ({
      id,
      visitId: "visit_stmary_oct",
      pipeId,
      start,
      end,
      blowerCfm: cfm,
      status: "held" as const,
      createdBy: "t",
      createdAt: start,
    });
    const r1: AppState = {
      ...empty,
      reservations: [mk("x", "pipe_oboe_a4", 80)],
    };
    // 95 + 80 = 175 < 220 允许
    expect(
      checkReservation(r1, { visitId: "visit_stmary_oct", pipeId: "pipe_trumpet_cs4", start, end }),
    ).toBeNull();
    const r2: AppState = {
      ...r1,
      reservations: [...r1.reservations, mk("y", "pipe_mixture_d5", 45)],
    };
    // 80+45+95=220 恰好等于容量 -> 允许
    expect(
      checkReservation(r2, { visitId: "visit_stmary_oct", pipeId: "pipe_trumpet_cs4", start, end }),
    ).toBeNull();
    const r3: AppState = {
      ...r2,
      reservations: r2.reservations.map((x) => (x.id === "y" ? { ...x, blowerCfm: 46 } : x)),
    };
    const err = checkReservation(r3, {
      visitId: "visit_stmary_oct",
      pipeId: "pipe_trumpet_cs4",
      start,
      end,
    });
    expect(err?.code).toBe("BLOWER_CAPACITY");
    expect(err?.detail).toContain("220");
  });

  it("簧片管稳定时长不够不能排，非簧片管不受限", () => {
    // 以刚送达（0 分钟）重新构造任务
    const fresh: AppState = {
      ...state,
      visits: [
        { ...state.visits[0], id: "visit_fresh", arrivedAt: new Date().toISOString() },
      ],
      reservations: [],
      measurements: [],
      conflicts: [],
    };
    const start = new Date(Date.now() + 10 * 60000).toISOString();
    const end = new Date(Date.now() + 25 * 60000).toISOString();
    const reed = checkReservation(fresh, {
      visitId: "visit_fresh",
      pipeId: "pipe_trumpet_cs4",
      start,
      end,
    });
    expect(reed?.code).toBe("REED_NOT_STABILIZED");
    expect(reed?.message).toContain("60 分钟");
    expect(
      checkReservation(fresh, { visitId: "visit_fresh", pipeId: "pipe_principal_g3", start, end }),
    ).toBeNull();
  });

  it("同一根音管不能重复预留", () => {
    const start = new Date(Date.now() + 10 * 360000).toISOString();
    const err = checkReservation(state, {
      visitId: "visit_stmary_oct",
      pipeId: "pipe_trumpet_cs4",
      start,
      end: new Date(Date.now() + 10 * 360000 + 600000).toISOString(),
    });
    expect(err?.code).toBe("PIPE_BUSY");
  });

  it("风机故障或未在场时不能排", () => {
    const start = new Date(Date.now() + 10 * 3600000).toISOString();
    const end = new Date(Date.now() + 10 * 3600000 + 600000).toISOString();
    const failed: AppState = {
      ...state,
      blowers: [{ ...state.blowers[0], state: "failed" }],
    };
    expect(
      checkReservation(failed, { visitId: "visit_stmary_oct", pipeId: "pipe_oboe_a4", start, end })
        ?.code,
    ).toBe("BLOWER_NOT_RUNNING");
    const absent: AppState = {
      ...state,
      blowers: [{ ...state.blowers[0], venueId: "venue_halla" }],
    };
    expect(
      checkReservation(absent, { visitId: "visit_stmary_oct", pipeId: "pipe_oboe_a4", start, end })
        ?.code,
    ).toBe("BLOWER_ABSENT");
  });

  it("排程中关机时，新增时段被拒绝", () => {
    const off: AppState = { ...state, powered: false };
    const err = checkReservation(off, {
      visitId: "visit_stmary_oct",
      pipeId: "pipe_oboe_a4",
      start: new Date().toISOString(),
      end: new Date(Date.now() + 600000).toISOString(),
    });
    expect(err?.code).toBe("POWERED_OFF");
  });
});

describe("湿度变化 → 预留失效", () => {
  it("波动超过阈值时，该场馆所有进行中的预留失效，另一场馆不动", () => {
    const other: AppState = {
      ...state,
      visits: [
        ...state.visits,
        {
          id: "visit_b",
          venueId: "venue_halla",
          blowerId: "blower_mobile_1",
          title: "B",
          arrivedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
      reservations: [
        ...state.reservations,
        {
          id: "res_b",
          visitId: "visit_b",
          pipeId: "pipe_trompette_b4",
          start: new Date(Date.now() + 3600000).toISOString(),
          end: new Date(Date.now() + 4200000).toISOString(),
          blowerCfm: 90,
          status: "held",
          createdBy: "t",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const res = applyReading(other, {
      venueId: "venue_stmary",
      time: new Date().toISOString(),
      tempC: 20,
      humidityRh: 90, // 上一条 68，变化 22 > 10
    });
    const trumpet = res.state.reservations.find((r) => r.id === "res_trumpet")!;
    const bourdon = res.state.reservations.find((r) => r.id === "res_bourdon")!;
    const hall = res.state.reservations.find((r) => r.id === "res_b")!;
    expect(trumpet.status).toBe("invalidated");
    expect(trumpet.invalidateReason).toContain("68%RH");
    expect(bourdon.status).toBe("invalidated"); // 本来就是
    expect(hall.status).toBe("held"); // 另一场馆不受影响
    expect(res.invalidated.map((r) => r.id)).toContain("res_trumpet");
    expect(activeReservations(res.state).map((r) => r.id)).not.toContain("res_trumpet");
  });

  it("波动未超过阈值时预留保持有效", () => {
    const res = applyReading(state, {
      venueId: "venue_stmary",
      time: new Date().toISOString(),
      tempC: 20,
      humidityRh: 72, // 68 -> 72，变化 4
    });
    expect(res.state.reservations.find((r) => r.id === "res_trumpet")!.status).toBe("held");
  });
});

describe("两名调音师实测冲突", () => {
  const baseInput = {
    pipeId: "pipe_trumpet_cs4",
    visitId: "visit_stmary_oct",
    time: new Date().toISOString(),
    pitch: "C#4",
    cents: 5,
    tempC: 19,
    humidityRh: 50,
    reedState: "正常" as const,
    note: "ok",
  };

  it("第一份为原始值；第二份挂为冲突版本，原始值不被覆盖", () => {
    const r1 = submitMeasurement(state, { ...baseInput, author: "甲", cents: 5 });
    expect(r1.measurement.status).toBe("original");
    expect(r1.conflict).toBeUndefined();
    const snapshot = JSON.stringify(r1.state.measurements.find((m) => m.id === r1.measurement.id));

    const r2 = submitMeasurement(r1.state, {
      ...baseInput,
      author: "乙",
      cents: 12,
      reedState: "轻微锈蚀",
      note: "需要处理",
      time: new Date(Date.now() + 60000).toISOString(),
    });
    expect(r2.measurement.status).toBe("pending_conflict");
    expect(r2.conflict?.status).toBe("pending");
    expect(pendingConflicts(r2.state)).toHaveLength(2); // 种子里已有一个

    const stillOriginal = r2.state.measurements.find((m) => m.id === r1.measurement.id)!;
    expect(JSON.stringify(stillOriginal)).toBe(snapshot); // 先到那份原样不动
    expect(stillOriginal.cents).toBe(5);
  });

  it("冲突未确认前，第三份被拒收", () => {
    const r1 = submitMeasurement(state, { ...baseInput, author: "甲" });
    const r2 = submitMeasurement(r1.state, { ...baseInput, author: "乙", cents: 99 });
    const r3 = submitMeasurement(r2.state, { ...baseInput, author: "丙", cents: -1 });
    expect(r3.error).toBe("PENDING_CONFLICT");
  });

  it("列出字段差异", () => {
    const r1 = submitMeasurement(state, { ...baseInput, author: "甲" });
    const r2 = submitMeasurement(r1.state, {
      ...baseInput,
      author: "乙",
      cents: 12,
      reedState: "锈蚀",
    });
    const g = r2.conflict!;
    const pair = {
      original: r2.state.measurements.find((m) => m.id === g.originalId)!,
      conflict: r2.state.measurements.find((m) => m.id === g.conflictId)!,
    };
    const diffs = diffMeasurements(pair.original, pair.conflict);
    const fields = diffs.filter((d) => d.differs).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["cents", "reedState"]));
    expect(diffs.find((d) => d.field === "pitch")?.differs).toBe(false);
  });

  it("必须为每个差异字段做出选择才能确认", () => {
    const r1 = submitMeasurement(state, { ...baseInput, author: "甲" });
    const r2 = submitMeasurement(r1.state, { ...baseInput, author: "乙", cents: 12 });
    const g = r2.conflict!;
    const bad = resolveConflict(r2.state, {
      groupId: g.id,
      choices: {},
      resolvedBy: "组长",
      time: new Date().toISOString(),
    });
    expect(bad.error).toBe("MISSING_CHOICE");
  });

  it("逐字段确认生成最终值，两份原始记录都保留可追溯", () => {
    const r1 = submitMeasurement(state, { ...baseInput, author: "甲", cents: 5, note: "甲备注" });
    const r2 = submitMeasurement(r1.state, {
      ...baseInput,
      author: "乙",
      cents: 12,
      note: "乙备注",
    });
    const g = r2.conflict!;
    const res = resolveConflict(r2.state, {
      groupId: g.id,
      choices: { cents: "conflict", note: "original" },
      resolvedBy: "组长",
      time: new Date().toISOString(),
    });
    expect(res.confirmed?.cents).toBe(12);
    expect(res.confirmed?.note).toBe("甲备注");
    expect(res.confirmed?.status).toBe("confirmed");

    const original = res.state.measurements.find((m) => m.id === g.originalId)!;
    const conflict = res.state.measurements.find((m) => m.id === g.conflictId)!;
    expect(original.status).toBe("original"); // 先到那份永不改写
    expect(conflict.status).toBe("archived_conflict"); // 后到那份归档保留
    expect(pendingConflicts(res.state)).toHaveLength(1); // 种子里那个
  });

  it("关机时不能提交实测", () => {
    const off: AppState = { ...state, powered: false };
    expect(submitMeasurement(off, { ...baseInput, author: "甲" }).error).toBe("BAD_POWER");
  });

  it("状态标签可用于界面", () => {
    expect(statusLabel("pending_conflict")).toContain("冲突");
  });
});

describe("单次维护报告按最终确认值重算", () => {
  it("演示数据：F2 有失效标记且缺实测、G3 先到值正常", () => {
    const report = buildVisitReport(state, "visit_stmary_oct")!;
    const f2 = report.rows.find((r) => r.pipe.id === "pipe_bourdon_f2")!;
    expect(f2.flags.invalidated).toBe(true);
    expect(f2.flags.noMeasurement).toBe(true);
    expect(f2.abnormal).toBe(true);
    const g3 = report.rows.find((r) => r.pipe.id === "pipe_principal_g3")!;
    // G3 无冲突，先到实测 -3cent 即最终值：容差 8 内、簧片正常
    expect(g3.final?.cents).toBe(-3);
    expect(g3.finalKind).toBe("original");
    expect(g3.flags.noMeasurement).toBe(false);
    expect(g3.flags.centsOver).toBe(false);
    expect(g3.abnormal).toBe(false);
    expect(report.summary.total).toBe(3); // G3、F2、C#4 三支有预留的音管
  });

  it("确认冲突后重新生成，异常标记按最终值重算", () => {
    // A4：先到 +6/轻微锈蚀，后到 +14/锈蚀（种子冲突）
    const before = buildVisitReport(state, "visit_stmary_oct")!;
    const oboeBefore = before.rows.find((r) => r.pipe.id === "pipe_oboe_a4");
    expect(oboeBefore).toBeUndefined(); // A4 没有预留，不进报告

    // 给 A4 补一支预留，使其进入报告
    const withRes: AppState = {
      ...state,
      reservations: [
        ...state.reservations,
        {
          id: "res_oboe",
          visitId: "visit_stmary_oct",
          pipeId: "pipe_oboe_a4",
          start: new Date().toISOString(),
          end: new Date(Date.now() + 600000).toISOString(),
          blowerCfm: 80,
          status: "held",
          createdBy: "t",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const rep1 = buildVisitReport(withRes, "visit_stmary_oct")!;
    const row1 = rep1.rows.find((r) => r.pipe.id === "pipe_oboe_a4")!;
    expect(row1.flags.noMeasurement).toBe(true);
    expect(row1.flags.pendingConflict).toBe(true);
    expect(rep1.summary.pendingConflicts).toBe(1);

    // 逐字段确认：音分取先到 +6（容差 8 内），簧片取后到“锈蚀”
    const resolved = resolveConflict(withRes, {
      groupId: "grp_oboe",
      choices: {
        cents: "original",
        reedState: "conflict",
        note: "conflict",
        tempC: "original",
        humidityRh: "original",
      },
      resolvedBy: "组长",
      time: new Date().toISOString(),
    }).state;
    const rep2 = buildVisitReport(resolved, "visit_stmary_oct")!;
    const row2 = rep2.rows.find((r) => r.pipe.id === "pipe_oboe_a4")!;
    expect(row2.final?.cents).toBe(6);
    expect(row2.finalKind).toBe("confirmed");
    expect(row2.flags.noMeasurement).toBe(false);
    expect(row2.flags.centsOver).toBe(false);
    expect(row2.flags.reedBad).toBe(true); // 最终值簧片锈蚀
    expect(rep2.summary.pendingConflicts).toBe(0);
  });

  it("不存在的任务返回 null", () => {
    expect(buildVisitReport(state, "nope")).toBeNull();
  });

  it("同一份最终值，收紧容差阈值后重算，音分超限标记随之改变", () => {
    // G3 先到值 -3cent
    const tol8 = buildVisitReport(state, "visit_stmary_oct")!;
    const g3a = tol8.rows.find((r) => r.pipe.id === "pipe_principal_g3")!;
    expect(g3a.flags.centsOver).toBe(false);
    const tighter: AppState = {
      ...state,
      settings: { ...state.settings, toleranceCents: 2 },
    };
    const tol2 = buildVisitReport(tighter, "visit_stmary_oct")!;
    const g3b = tol2.rows.find((r) => r.pipe.id === "pipe_principal_g3")!;
    expect(g3b.flags.centsOver).toBe(true);
    expect(g3b.abnormal).toBe(true);
    // 原始数据未被报告重算改动
    expect(state.measurements.find((m) => m.id === "m_principal")!.cents).toBe(-3);
  });
});

describe("关机/恢复后数据仍在本机", () => {
  it("关机期间无法修改排程，重新开机后原有预留和实测完整保留", () => {
    const before = JSON.stringify({
      reservations: state.reservations,
      measurements: state.measurements,
    });
    const off: AppState = { ...state, powered: false };
    expect(
      checkReservation(off, {
        visitId: "visit_stmary_oct",
        pipeId: "pipe_oboe_a4",
        start: new Date(Date.now() + 10 * 3600000).toISOString(),
        end: new Date(Date.now() + 10 * 3600000 + 600000).toISOString(),
      })?.code,
    ).toBe("POWERED_OFF");
    const back: AppState = { ...off, powered: true };
    const after = JSON.stringify({
      reservations: back.reservations,
      measurements: back.measurements,
    });
    expect(after).toBe(before);
    // 恢复后可以接着补没完成的部分
    expect(
      checkReservation(back, {
        visitId: "visit_stmary_oct",
        pipeId: "pipe_oboe_a4",
        start: new Date(Date.now() + 10 * 3600000).toISOString(),
        end: new Date(Date.now() + 10 * 3600000 + 600000).toISOString(),
      }),
    ).toBeNull();
  });

  it("datetime-local 值可转为 ISO", () => {
    expect(fromLocalInput("2026-10-02T14:30")).toMatch(/2026-10-02T/);
  });
});
