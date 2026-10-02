import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { EnvironmentReading } from "../types";
import { uid, fmtDateTime, fromLocalInput } from "../domain/utils";
import { applyReading, latestReading } from "../domain/environment";
import { Badge, Banner, Empty, Field, Panel, inputCls } from "./ui";

function localNow(offsetMin = 0): string {
  const d = new Date(Date.now() + offsetMin * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function EnvironmentTab() {
  const { state, dispatch } = useStore();
  const blower = state.blowers[0];
  const [venueId, setVenueId] = useState(state.venues[0]?.id ?? "");
  const [reading, setReading] = useState({ time: localNow(), temp: 20, rh: 55, note: "" });
  const [arrive, setArrive] = useState(localNow());
  const [notice, setNotice] = useState<string | null>(null);

  const venue = state.venues.find((v) => v.id === venueId);
  const last = venue ? latestReading(state, venue.id) : undefined;

  const visits = useMemo(
    () => [...state.visits].sort((a, b) => +new Date(b.arrivedAt) - +new Date(a.arrivedAt)),
    [state.visits],
  );

  const submitReading = () => {
    if (!venueId) return;
    const result = applyReading(state, {
      venueId,
      time: fromLocalInput(reading.time),
      tempC: Number(reading.temp),
      humidityRh: Number(reading.rh),
      note: reading.note.trim() || undefined,
    });
    const newReading: EnvironmentReading = result.state.readings[result.state.readings.length - 1];
    dispatch({
      type: "ADD_READING",
      reading: newReading,
      invalidated: result.invalidated,
    });
    setNotice(
      result.invalidated.length > 0
        ? `湿度波动 ${Math.abs(Number(reading.rh) - (last?.humidityRh ?? Number(reading.rh)))}%RH 超阈值，${result.invalidated.length} 条原预留已失效。`
        : "温湿度已登记，现有预留保持有效。",
    );
    setReading((r) => ({ ...r, note: "" }));
  };

  const deliver = () => {
    if (!blower || !venueId) return;
    const arrivedAt = fromLocalInput(arrive);
    const visit = {
      id: uid("visit"),
      venueId,
      blowerId: blower.id,
      title: `${venue?.name ?? venueId} · 维护 ${fmtDateTime(arrivedAt)}`,
      arrivedAt,
      createdAt: new Date().toISOString(),
    };
    dispatch({
      type: "DELIVER_BLOWER",
      blower: { ...blower, venueId, state: "running" },
      visit,
    });
  };

  const venueReadings = state.readings
    .filter((r) => r.venueId === venueId)
    .sort((a, b) => +new Date(b.time) - +new Date(a.time));

  const tone = blower?.state === "running" ? "ok" : blower?.state === "failed" ? "bad" : "muted";
  const stateLabel = blower?.state === "running" ? "运转中" : blower?.state === "failed" ? "启动失败" : "停机";

  return (
    <div className="tab-grid">
      <Panel title="移动风机" sub="全组轮用一台">
        {blower && (
          <div className={`blower-card blower-${blower.state}`}>
            <div className="blower-head">
              <b>{blower.name}</b>
              <Badge tone={tone}>{stateLabel}</Badge>
            </div>
            <dl className="kv">
              <div>
                <dt>容量</dt>
                <dd className="mono">{blower.capacityCfm} CFM</dd>
              </div>
              <div>
                <dt>当前场馆</dt>
                <dd>{state.venues.find((v) => v.id === blower.venueId)?.name ?? "未送出"}</dd>
              </div>
            </dl>
            <div className="btn-row">
              {blower.state === "idle" && (
                <button className="primary" onClick={() => dispatch({ type: "BLOWER_START" })}>
                  启动风机
                </button>
              )}
              {blower.state === "running" && (
                <button onClick={() => dispatch({ type: "BLOWER_FAIL" })}>模拟启动失败</button>
              )}
              {blower.state === "failed" && (
                <button className="primary" onClick={() => dispatch({ type: "BLOWER_RECOVER" })}>
                  故障恢复（原数据保留）
                </button>
              )}
            </div>
            {blower.state === "failed" && (
              <Banner tone="bad">
                启动失败：所有预留与实测值仍保存在本机；恢复后即可接着补没完成的部分，排程不会重排。
              </Banner>
            )}
          </div>
        )}

        <h3 className="subhead">轮送到场馆 / 开新单次维护</h3>
        <p className="muted small">
          送达时间即簧片管在当地湿度中稳定计时的起点（需稳定 {state.settings.stabilizeMinutes} 分钟）。
        </p>
        <div className="form-row">
          <Field label="送抵场馆">
            <select className={inputCls} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              {state.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="送达时间">
            <input className={inputCls} type="datetime-local" value={arrive} onChange={(e) => setArrive(e.target.value)} />
          </Field>
          <div className="field-end">
            <button className="primary" onClick={deliver} disabled={!state.powered || !venueId}>
              送达并启动
            </button>
          </div>
        </div>
        {!state.powered && <Banner tone="bad">系统关机中，不能登记风机操作。</Banner>}

        <h3 className="subhead">维护任务</h3>
        <div className="card-list">
          {visits.map((v) => (
            <article className="mini-card" key={v.id}>
              <b>{v.title}</b>
              <span>
                送达 {fmtDateTime(v.arrivedAt)} ·{" "}
                {v.closedAt ? (
                  <Badge tone="muted">已于 {fmtDateTime(v.closedAt)} 结束</Badge>
                ) : (
                  <Badge tone="ok">进行中</Badge>
                )}
              </span>
              {!v.closedAt && (
                <button
                  className="tiny"
                  disabled={!state.powered}
                  onClick={() => dispatch({ type: "CLOSE_VISIT", visitId: v.id, at: new Date().toISOString() })}
                >
                  结束本次维护
                </button>
              )}
            </article>
          ))}
          {visits.length === 0 && <Empty>还没有维护任务</Empty>}
        </div>
      </Panel>

      <Panel
        title="温湿度登记"
        sub="湿度波动超限 → 原预留失效"
        actions={
          <select className={inputCls} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {state.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        }
      >
        {last && (
          <p className="muted small">
            上一条：{fmtDateTime(last.time)} · {last.tempC}℃ · {last.humidityRh}%RH
            （波动超过 ±{state.settings.humidityDeltaRh}%RH 将使该场馆进行中的预留失效）
          </p>
        )}
        <div className="form-grid">
          <Field label="记录时间">
            <input className={inputCls} type="datetime-local" value={reading.time} onChange={(e) => setReading({ ...reading, time: e.target.value })} />
          </Field>
          <Field label="温度 ℃">
            <input className={inputCls} type="number" step="0.1" value={reading.temp} onChange={(e) => setReading({ ...reading, temp: Number(e.target.value) })} />
          </Field>
          <Field label="相对湿度 %RH">
            <input className={inputCls} type="number" step="1" value={reading.rh} onChange={(e) => setReading({ ...reading, rh: Number(e.target.value) })} />
          </Field>
          <Field label="备注">
            <input className={inputCls} value={reading.note} onChange={(e) => setReading({ ...reading, note: e.target.value })} placeholder="午后下雨…" />
          </Field>
        </div>
        <button className="primary wide" onClick={submitReading} disabled={!state.powered || !venueId}>
          登记并校验湿度
        </button>
        {notice && (
          <Banner tone={notice.includes("失效") ? "bad" : "ok"}>
            {notice}
          </Banner>
        )}

        <h3 className="subhead">该场馆温湿度历史</h3>
        {venueReadings.length === 0 ? (
          <Empty>暂无记录</Empty>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>温度</th>
                  <th>湿度</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {venueReadings.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{fmtDateTime(r.time)}</td>
                    <td className="mono">{r.tempC}℃</td>
                    <td className="mono">{r.humidityRh}%</td>
                    <td className="note-cell">{r.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="事件日志" sub="本机操作留痕">
        <ul className="events">
          {state.events.map((e) => (
            <li key={e.id} className={`ev ev-${e.kind}`}>
              <span className="ev-time">{fmtDateTime(e.time)}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
