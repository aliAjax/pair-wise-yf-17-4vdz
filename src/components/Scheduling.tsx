// 排程台：风机容量 + 稳定时长校验，预留 / 确认 / 恢复
import { useEffect, useMemo, useState } from "react";
import type { ID, Reservation } from "../types";
import {
  DEFAULT_SLOT_MIN,
  DEFAULT_STABILIZATION_MIN,
  earliestTuningStart,
  fmtDateTime,
  fmtTime,
  toLocalInput,
  validateSlot,
} from "../logic";
import {
  completeReservation,
  confirmReservation,
  createReservation,
  rebookReservation,
  setBlowerStatus,
  useStore,
} from "../store";
import { Badge, Button, Field, Modal, Panel } from "./ui";

const STATUS_COLOR: Record<Reservation["status"], string> = {
  预留: "sky",
  已确认: "green",
  已失效: "amber",
  待恢复: "red",
  已完成: "slate",
};

export function Scheduling({ onShutdown }: { onShutdown: () => void }) {
  const { venues, stops, pipes, blowers, reservations } = useStore();
  const tuners = useStore().tuners;

  const [venueId, setVenueId] = useState("");
  const [blowerId, setBlowerId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [start, setStart] = useState("");
  const [stab, setStab] = useState(DEFAULT_STABILIZATION_MIN);
  const [slotMin] = useState(DEFAULT_SLOT_MIN);
  const [tuner, setTuner] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<ID | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId && venues[0]) setVenueId(venues[0].id);
    if (!blowerId && blowers[0]) setBlowerId(blowers[0].id);
    if (!tuner && tuners[0]) setTuner(tuners[0]);
  }, [venues, blowers, tuners, venueId, blowerId, tuner]);

  const venue = venues.find((v) => v.id === venueId);
  const blower = blowers.find((b) => b.id === blowerId);

  const venuePipes = useMemo(
    () =>
      pipes.filter((p) => {
        const stop = stops.find((s) => s.id === p.stopId);
        return stop?.venueId === venueId;
      }),
    [pipes, stops, venueId],
  );

  // 切换场馆时，默认选中该馆全部音管
  useEffect(() => {
    setSelected(new Set(venuePipes.map((p) => p.id)));
  }, [venuePipes]);

  const earliest = useMemo(
    () => (venue ? earliestTuningStart(venue, stab) : new Date()),
    [venue, stab],
  );

  // 开始时间早于最早可定音时间时，自动修正到最早时间
  useEffect(() => {
    if (!venue) return;
    const cur = start ? new Date(start) : null;
    if (!cur || cur.getTime() < earliest.getTime()) {
      setStart(toLocalInput(earliest));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earliest]);

  const startDate = start ? new Date(start) : null;
  const endDate = startDate ? new Date(startDate.getTime() + slotMin * 60000) : null;

  const validation = useMemo(() => {
    if (!venue || !startDate || !endDate) return { ok: false, errors: [], warnings: [] };
    return validateSlot({
      venue,
      blower,
      pipeCount: selected.size,
      start: startDate,
      end: endDate,
      stabilizationMin: stab,
      reservations,
      excludeId: editingId ?? undefined,
    });
  }, [venue, blower, selected.size, startDate, endDate, stab, reservations, editingId]);

  const togglePipe = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setNote("");
    setErrMsg(null);
  };

  const submit = () => {
    if (!venue || !blower || !startDate || !endDate) return;
    if (!validation.ok) {
      setErrMsg(validation.errors[0] ?? "排期校验未通过");
      return;
    }
    if (editingId) {
      rebookReservation(editingId, {
        blowerId,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        pipeIds: [...selected],
        stabilizationMin: stab,
      });
    } else {
      createReservation({
        venueId: venue.id,
        blowerId: blower.id,
        pipeIds: [...selected],
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        stabilizationMin: stab,
        tuner,
        note,
      });
    }
    resetForm();
  };

  const startRebook = (r: Reservation) => {
    setEditingId(r.id);
    setVenueId(r.venueId);
    setBlowerId(r.blowerId);
    setSelected(new Set(r.pipeIds));
    setStab(r.stabilizationMin);
    setTuner(r.tuner);
    setNote(r.note);
    const v = venues.find((x) => x.id === r.venueId);
    const e = v ? earliestTuningStart(v, r.stabilizationMin) : new Date();
    setStart(toLocalInput(e));
    setErrMsg(null);
  };

  const active = reservations.filter((r) => r.status !== "已完成");
  const done = reservations.filter((r) => r.status === "已完成");

  return (
    <div className="tab-stack">
      {/* 风机状态 */}
      <Panel title="移动风机">
        <div className="blower-row">
          {blowers.map((b) => (
            <div key={b.id} className="blower-card">
              <div>
                <b>{b.name}</b>
                <div className="sub">容量 {b.capacity} 管</div>
              </div>
              <Badge
                color={b.status === "运行中" ? "sky" : b.status === "故障" ? "red" : "green"}
              >
                {b.status}
              </Badge>
              <div className="row-actions">
                {b.status === "故障" ? (
                  <Button onClick={() => setBlowerStatus(b.id, "待命")}>修复并待命</Button>
                ) : (
                  <>
                    <Button
                      onClick={() => setBlowerStatus(b.id, b.status === "运行中" ? "待命" : "运行中")}
                    >
                      {b.status === "运行中" ? "停止" : "启动"}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setBlowerStatus(b.id, "故障")}
                    >
                      模拟启动失败
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* 排期表单 */}
      <Panel
        title={editingId ? "重新安排预留" : "新增排时段"}
        extra={
          <Button variant="danger" onClick={onShutdown}>
            模拟关机
          </Button>
        }
      >
        <div className="form-grid">
          <Field label="场馆">
            <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（当前 {v.temperature ?? "—"}℃ / {v.humidity ?? "—"}%）
                </option>
              ))}
            </select>
          </Field>
          <Field label="风机">
            <select value={blowerId} onChange={(e) => setBlowerId(e.target.value)}>
              {blowers.map((b) => (
                <option key={b.id} value={b.id} disabled={b.status === "故障"}>
                  {b.name}（容量 {b.capacity}）{b.status === "故障" ? "·故障" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="开始时间">
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="稳定时长（分钟）">
            <input
              type="number"
              value={stab}
              onChange={(e) => setStab(Number(e.target.value))}
            />
          </Field>
          <Field label="调音师">
            <select value={tuner} onChange={(e) => setTuner(e.target.value)}>
              {tuners.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="备注">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
          </Field>
        </div>

        {/* 音管选择 */}
        <div className="pipe-pick">
          <div className="sub">选择本时段维护的音管（{selected.size} / {venuePipes.length}）</div>
          <div className="chips">
            {venuePipes.map((p) => (
              <button
                key={p.id}
                className={selected.has(p.id) ? "chip-on" : ""}
                onClick={() => togglePipe(p.id)}
              >
                {p.number}
              </button>
            ))}
            {venuePipes.length === 0 && <span className="sub">该场馆暂无音管</span>}
          </div>
        </div>

        {/* 校验提示 */}
        <div className="slot-hint">
          <p>
            簧片管需在当地湿度（{venue?.humidity ?? "—"}%）中稳定 <b>{stab}</b> 分钟，最早可定音时间：
            <b className="num-ok"> {fmtDateTime(earliest.toISOString())}</b>
          </p>
          {blower && (
            <p className="sub">
              风机「{blower.name}」容量 {blower.capacity} 管，本时段选 {selected.size} 管
              {selected.size > blower.capacity && (
                <span className="num-danger">（超出容量）</span>
              )}
            </p>
          )}
          {validation.errors.map((e) => (
            <p key={e} className="form-msg form-msg-err">
              {e}
            </p>
          ))}
          {validation.warnings.map((w) => (
            <p key={w} className="form-msg form-msg-warn">
              {w}
            </p>
          ))}
          {errMsg && <p className="form-msg form-msg-err">{errMsg}</p>}
        </div>

        <div className="modal-actions">
          {editingId && <Button onClick={resetForm}>取消重排</Button>}
          <Button
            variant="primary"
            disabled={!validation.ok || selected.size === 0}
            onClick={submit}
          >
            {editingId ? "保存为预留" : "创建预留"}
          </Button>
        </div>
      </Panel>

      {/* 有效预留 */}
      <Panel title={`未完成排程（${active.length}）`}>
        {active.length === 0 ? (
          <p className="empty">暂无未完成排程</p>
        ) : (
          <div className="records">
            {active.map((r) => {
              const v = venues.find((x) => x.id === r.venueId);
              const b = blowers.find((x) => x.id === r.blowerId);
              return (
                <article key={r.id}>
                  <b>{fmtTime(r.start)}</b>
                  <div>
                    <h3>
                      {v?.name} · {fmtTime(r.start)}–{fmtTime(r.end)}
                    </h3>
                    <p>
                      风机 {b?.name} · {r.pipeIds.length} 管 · 稳定 {r.stabilizationMin} 分钟 ·{" "}
                      {r.tuner}
                    </p>
                    <p className="sub">
                      预定时湿度 {r.humidityAtBooking ?? "—"}% · {fmtDateTime(r.createdAt)}
                    </p>
                    <div className="row-actions">
                      <Badge color={STATUS_COLOR[r.status]}>{r.status}</Badge>
                      {r.status === "预留" && (
                        <Button onClick={() => confirmReservation(r.id)}>确认预留</Button>
                      )}
                      {(r.status === "待恢复" || r.status === "已失效") && (
                        <Button variant="accent" onClick={() => startRebook(r)}>
                          重新安排
                        </Button>
                      )}
                      {(r.status === "已确认" || r.status === "预留") && (
                        <Button onClick={() => completeReservation(r.id)}>完成</Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      {/* 已完成 */}
      <Panel title={`已完成（${done.length}）`}>
        {done.length === 0 ? (
          <p className="empty">暂无已完成排程</p>
        ) : (
          <div className="records">
            {done.map((r) => {
              const v = venues.find((x) => x.id === r.venueId);
              return (
                <article key={r.id}>
                  <b>✓</b>
                  <div>
                    <h3>
                      {v?.name} · {fmtTime(r.start)}–{fmtTime(r.end)}
                    </h3>
                    <p className="sub">
                      {r.tuner} · {r.pipeIds.length} 管
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
