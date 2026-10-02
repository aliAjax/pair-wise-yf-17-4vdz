import type { AppState } from "./types";
import { uid } from "./domain/utils";

function offset(base: number, minutes: number): string {
  return new Date(base + minutes * 60000).toISOString();
}

export function buildSeed(): AppState {
  const now = Date.now();
  const settings = { stabilizeMinutes: 60, toleranceCents: 8, humidityDeltaRh: 10 };

  const venueA = { id: "venue_stmary", name: "圣玛丽教堂", location: "老城区礼拜堂" };
  const venueB = { id: "venue_halla", name: "市立音乐厅 A 厅", location: "滨河路 12 号" };

  const pipes = [
    {
      id: "pipe_trumpet_cs4",
      code: "C#4",
      venueId: venueA.id,
      stopName: "Trumpet 8'",
      group: "簧片音栓" as const,
      pitch: "C#4",
      isReed: true,
      demandCfm: 95,
      reedState: "正常" as const,
      notes: "簧舌有轻微磨痕，本季继续观察。",
    },
    {
      id: "pipe_oboe_a4",
      code: "A4",
      venueId: venueA.id,
      stopName: "Oboe 8'",
      group: "簧片音栓" as const,
      pitch: "A4",
      isReed: true,
      demandCfm: 80,
      reedState: "轻微锈蚀" as const,
      notes: "调音师两次实测不一致，待现场复核。",
    },
    {
      id: "pipe_principal_g3",
      code: "G3",
      venueId: venueA.id,
      stopName: "Principal 4'",
      group: "主音栓" as const,
      pitch: "G3",
      isReed: false,
      demandCfm: 40,
      reedState: "正常" as const,
      notes: "",
    },
    {
      id: "pipe_bourdon_f2",
      code: "F2",
      venueId: venueA.id,
      stopName: "Bourdon 16'",
      group: "低音管" as const,
      pitch: "F2",
      isReed: false,
      demandCfm: 70,
      reedState: "正常" as const,
      notes: "音准持续偏低，上次复检标记待修。",
    },
    {
      id: "pipe_mixture_d5",
      code: "D5",
      venueId: venueA.id,
      stopName: "Mixture III",
      group: "混合音栓" as const,
      pitch: "D5",
      isReed: false,
      demandCfm: 45,
      reedState: "正常" as const,
      notes: "",
    },
    {
      id: "pipe_trompette_b4",
      code: "B4",
      venueId: venueB.id,
      stopName: "Trompette harmonique 8'",
      group: "簧片音栓" as const,
      pitch: "B4",
      isReed: true,
      demandCfm: 90,
      reedState: "锈蚀" as const,
      notes: "等待下周送修簧片。",
    },
  ];

  const blower = {
    id: "blower_mobile_1",
    name: "移动风机 MF-220",
    capacityCfm: 220,
    venueId: venueA.id,
    state: "running" as const,
  };

  const visit = {
    id: "visit_stmary_oct",
    venueId: venueA.id,
    blowerId: blower.id,
    title: "圣玛丽教堂 · 秋季例行维护",
    arrivedAt: offset(now, -130),
    createdAt: offset(now, -132),
  };

  const reservations = [
    {
      id: "res_principal",
      visitId: visit.id,
      pipeId: "pipe_principal_g3",
      start: offset(now, -55),
      end: offset(now, -40),
      blowerCfm: 40,
      status: "done" as const,
      createdBy: "调音师甲",
      createdAt: offset(now, -120),
      startedAt: offset(now, -55),
      completedAt: offset(now, -38),
    },
    {
      id: "res_bourdon",
      visitId: visit.id,
      pipeId: "pipe_bourdon_f2",
      start: offset(now, -30),
      end: offset(now, -15),
      blowerCfm: 70,
      status: "invalidated" as const,
      createdBy: "调音师甲",
      createdAt: offset(now, -110),
      startedAt: offset(now, -30),
      invalidateAt: offset(now, -28),
      invalidateReason:
        "湿度由 45%RH 变为 68%RH，波动超过 10%RH，原预留失效",
    },
    {
      id: "res_trumpet",
      visitId: visit.id,
      pipeId: "pipe_trumpet_cs4",
      start: offset(now, 20),
      end: offset(now, 45),
      blowerCfm: 95,
      status: "held" as const,
      createdBy: "调音师乙",
      createdAt: offset(now, -10),
    },
  ];

  const measurements = [
    {
      id: "m_principal",
      pipeId: "pipe_principal_g3",
      visitId: visit.id,
      reservationId: "res_principal",
      author: "调音师甲",
      time: offset(now, -42),
      pitch: "G3",
      cents: -3,
      tempC: 19.2,
      humidityRh: 45,
      reedState: "正常" as const,
      note: "偏差在容差内。",
      status: "original" as const,
    },
    {
      id: "m_oboe_a",
      pipeId: "pipe_oboe_a4",
      visitId: visit.id,
      author: "调音师甲",
      time: offset(now, -20),
      pitch: "A4",
      cents: 6,
      tempC: 19.5,
      humidityRh: 68,
      reedState: "轻微锈蚀" as const,
      note: "建议轻度收簧。",
      status: "original" as const,
    },
    {
      id: "m_oboe_b",
      pipeId: "pipe_oboe_a4",
      visitId: visit.id,
      author: "调音师乙",
      time: offset(now, -12),
      pitch: "A4",
      cents: 14,
      tempC: 19.4,
      humidityRh: 67,
      reedState: "锈蚀" as const,
      note: "偏差明显，需要更换簧片。",
      status: "pending_conflict" as const,
    },
  ];

  const conflicts = [
    {
      id: "grp_oboe",
      pipeId: "pipe_oboe_a4",
      visitId: visit.id,
      originalId: "m_oboe_a",
      conflictId: "m_oboe_b",
      status: "pending" as const,
      resolution: [],
    },
  ];

  const readings = [
    {
      id: uid("env"),
      venueId: venueA.id,
      time: offset(now, -120),
      tempC: 18.6,
      humidityRh: 45,
      note: "风机刚送达。",
    },
    {
      id: uid("env"),
      venueId: venueA.id,
      time: offset(now, -28),
      tempC: 19.4,
      humidityRh: 68,
      note: "午后雨势加大，堂内骤湿。",
    },
    {
      id: uid("env"),
      venueId: venueB.id,
      time: offset(now, -200),
      tempC: 21.0,
      humidityRh: 52,
      note: "下周维护前基线。",
    },
  ];

  const events = [
    {
      id: uid("ev"),
      time: offset(now, -130),
      kind: "ok" as const,
      message: "移动风机 MF-220 送达圣玛丽教堂并启动，簧片开始稳定计时（60 分钟）。",
    },
    {
      id: uid("ev"),
      time: offset(now, -28),
      kind: "bad" as const,
      message: "湿度 45%RH → 68%RH，超出允许波动 10%RH，F2(Bourdon 16') 的预留已失效。",
    },
    {
      id: uid("ev"),
      time: offset(now, -12),
      kind: "warn" as const,
      message: "A4(Oboe 8') 收到调音师乙的第二份实测，已作为冲突版本挂起，等待字段确认。",
    },
  ];

  return {
    version: 1,
    powered: true,
    venues: [venueA, venueB],
    pipes,
    readings,
    blowers: [blower],
    visits: [visit],
    reservations,
    measurements,
    conflicts,
    events,
    settings,
  };
}
