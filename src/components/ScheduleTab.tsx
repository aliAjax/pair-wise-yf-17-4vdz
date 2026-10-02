import { useMemo, useState } from "react";
import { useStore } from "../store";
import { activeReservations, checkReservation, concurrentCfm, createReservation } from "../domain/schedule";
import { earliestTuneTime, fmtDateTime, fmtTime, fromLocalInput } from "../domain/utils";
import { Badge, Banner, Empty, Field, Panel, RESERVATION_STATUS, inputCls } from "./ui";

function localNow(offsetMin = 0): string {
  const d = new Date(Date.now() + offsetMin * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ScheduleTab() {
  const { state, dispatch } = useStore();
  const openVisits = state.visits.filter((v) => !v.closedAt);
  const [visitId, setVisitId] = useState(openVisits[0]?.id ?? state.visits[0]?.id ?? "");
  const [pipeId, setPipeId] = useState("");
  const [start, setStart] = useState(localNow(30));
  const [end, setEnd] = useState(localNow(50));
  const [createdBy, setCreatedBy] = useState("调音师甲");
  const [formError, setFormError] = useState<string | null>(null);

  const visit = state.visits.find((v) => v.id === visitId);
  const blower = visit ? state.blowers.find((b) => b.id === visit.blowerId) : undefined;
  const venue = visit ? state.venues.find((v) => v.id === visit.venueId) : undefined;
  const pipe = state.pipes.find((p) => p.id === pipeId);

  const visitPipes = useMemo(
    () => state.pipes.filter((p) => p.venueId === visit?.venueId),
    [state.pipes, visit?.venueId],
  );

  const reservations = useMemo(
    () =>
      state.reservations
        .filter((r) => r.visitId === visitId)
        .sort((a, b) => +new Date(b.start) - +new Date(a.start)),
    [state.reservations, visitId],
  );

  const active = useMemo(
    () => activeReservations(state).filter((r) => r.visitId === visitId),
    [state, visitId],
  );

  let startIso = "";
  let endIso = "";
  try {
    startIso = start ? fromLocalInput(start) : "";
    endIso = end ? fromLocalInput(end) : "";
  } catch {
    /* ignore */
  }
  const usedNow = startIso && endIso && visit
    ? concurrentCfm(state, visitId, startIso, endIso)
    : 0;
  const demand = pipe?.demandCfm ?? 0;
  const capacity = blower?.capacityCfm ?? 0;

  const liveError =
    visit && pipe && startIso && endIso
      ? checkReservation(state, { visitId, pipeId, start: startIso, end: endIso })
      : null;

  const earliest = visit
    ? new Date(earliestTuneTime(visit.arrivedAt, state.settings.stabilizeMinutes))
    : null;

  const addReservation = () => {
    if (!visit || !pipe) return;
    const err = checkReservation(state, {
      visitId,
      pipeId,
      start: startIso,
      end: endIso,
    });
    if (err) {
      setFormError(err.message);
      return;
    }
    setFormError(null);
    dispatch({
      type: "ADD_RESERVATION",
      reservation: createReservation(state, {
        visitId,
        pipeId,
        start: startIso,
        end: endIso,
        createdBy: createdBy.trim() || "调音师",
      }),
    });
    setPipeId("");
  };

  const pipeName = (id: string) => {
    const p = state.pipes.find((x) => x.id === id);
    return p ? `${p.stopName} ${p.code}` : id;
  };

  const selectedActive = pipeId ? active.some((r) => r.pipeId === pipeId) : false;

  return (
    <div className="tab-grid">
      <Panel
        title="排时段"
        sub={visit ? venue?.name ?? "维护任务" : "选择维护任务"}
        actions={
          <select className={inputCls} value={visitId} onChange={(e) => setVisitId(e.target.value)}>
            {state.visits.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
                {v.closedAt ? "（已结束）" : ""}
              </option>
            ))}
          </select>
        }
      >
        {!visit ? (
          <Empty>请先在「风机与温湿度」页把移动风机送到场馆，建立维护任务。</Empty>
        ) : (
          <>
            <dl className="kv kv-3">
              <div>
                <dt>风机 / 容量</dt>
                <dd>
                  {blower?.name} · <span className="mono">{blower?.capacityCfm} CFM</span>{" "}
                  {blower?.state === "running" ? (
                    <Badge tone="ok">运转中</Badge>
                  ) : blower?.state === "failed" ? (
                    <Badge tone="bad">启动失败</Badge>
                  ) : (
                    <Badge tone="muted">停机</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt>风机送达</dt>
                <dd className="mono">{fmtDateTime(visit.arrivedAt)}</dd>
              </div>
              <div>
                <dt>簧片最早可排（稳定 {state.settings.stabilizeMinutes} 分钟）</dt>
                <dd className="mono">{earliest ? fmtDateTime(earliest.toISOString()) : "—"}</dd>
              </div>
            </dl>

            {!state.powered && (
              <Banner tone="bad">
                排程系统关机中：原有预留保留在本机，不能新增或推进时段；重新开机后继续未完成的部分。
              </Banner>
            )}
            {state.powered && blower?.state === "failed" && (
              <Banner tone="bad">风机启动失败，恢复前不能排新时段；已有预留不受影响。</Banner>
            )}

            <div className="form-grid">
              <Field label="音管">
                <select className={inputCls} value={pipeId} onChange={(e) => setPipeId(e.target.value)}>
                  <option value="">选择音管</option>
                  {visitPipes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.stopName} {p.code}
                      {p.isReed ? "（簧片管）" : ""} · {p.demandCfm} CFM
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="开始">
                <input className={inputCls} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="结束">
                <input className={inputCls} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
              <Field label="调音师">
                <input className={inputCls} value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
              </Field>
            </div>

            {pipe && (
              <div className="capacity-bar">
                <div className="capacity-meta">
                  <span>
                    同时段已用 <b className="mono">{usedNow}</b>
                    {selectedActive && <em className="cap-warn">（该管已有未完成预留）</em>}
                  </span>
                  <span>
                    本管 <b className="mono">+{demand}</b>
                  </span>
                  <span>
                    合计 <b className="mono">{usedNow + demand}</b> / {capacity} CFM
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className={"bar-fill" + (usedNow + demand > capacity ? " over" : "")}
                    style={{ width: `${Math.min(100, ((usedNow + demand) / Math.max(1, capacity)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {liveError && pipe && <Banner tone="bad">{liveError.message}</Banner>}
            {formError && <Banner tone="bad">{formError}</Banner>}

            <button
              className="primary wide"
              onClick={addReservation}
              disabled={!state.powered || !pipe || !!liveError}
            >
              预留此时段
            </button>
          </>
        )}
      </Panel>

      <Panel title="时段预留列表" sub={`进行中占用容量的 ${active.length} 条 / 全部 ${reservations.length} 条`}>
        {reservations.length === 0 ? (
          <Empty>本次维护还没有预留</Empty>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>音管</th>
                  <th>时段</th>
                  <th>风量</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => {
                  const st = RESERVATION_STATUS[r.status];
                  return (
                    <tr key={r.id} className={r.status === "invalidated" ? "row-invalid" : ""}>
                      <td>{pipeName(r.pipeId)}</td>
                      <td className="mono">
                        {fmtTime(r.start)}–{fmtTime(r.end)}
                        {r.status === "invalidated" && r.invalidateReason && (
                          <small className="row-reason">{r.invalidateReason}</small>
                        )}
                      </td>
                      <td className="mono">{r.blowerCfm} CFM</td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td>
                        {r.status === "held" && (
                          <button
                            className="tiny"
                            disabled={!state.powered}
                            onClick={() => dispatch({ type: "START_RESERVATION", id: r.id, at: new Date().toISOString() })}
                          >
                            开始
                          </button>
                        )}
                        {(r.status === "held" || r.status === "in_progress") && (
                          <button
                            className="tiny primary"
                            disabled={!state.powered}
                            onClick={() => dispatch({ type: "COMPLETE_RESERVATION", id: r.id, at: new Date().toISOString() })}
                          >
                            完成
                          </button>
                        )}
                        {r.status === "done" && <span className="muted small">{fmtDateTime(r.completedAt)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
