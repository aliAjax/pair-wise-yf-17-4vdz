import { useMemo, useState } from "react";
import { useStore } from "../store";
import { REED_STATES, type ReedState } from "../types";
import {
  diffMeasurements,
  groupMeasurements,
  pendingConflicts,
  resolveConflict,
  statusLabel,
  submitMeasurement,
  type DiffKey,
} from "../domain/measurements";
import { fmtDateTime } from "../domain/utils";
import { Badge, Banner, Empty, Field, Panel, inputCls } from "./ui";

function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function statusTone(s: string): "ok" | "warn" | "bad" | "muted" | "info" {
  if (s === "confirmed") return "ok";
  if (s === "pending_conflict") return "bad";
  if (s === "archived_conflict") return "muted";
  return "info";
}

export function MeasurementsTab() {
  const { state, dispatch } = useStore();
  const openVisits = state.visits.filter((v) => !v.closedAt);
  const [visitId, setVisitId] = useState(openVisits[0]?.id ?? state.visits[0]?.id ?? "");
  const [pipeId, setPipeId] = useState("");
  const [author, setAuthor] = useState("调音师甲");
  const [time, setTime] = useState(localNow());
  const [form, setForm] = useState({
    pitch: "",
    cents: 0,
    tempC: undefined as number | undefined,
    humidityRh: undefined as number | undefined,
    reedState: "正常" as ReedState,
    note: "",
  });
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const pending = useMemo(() => pendingConflicts(state), [state]);

  const visitPipes = useMemo(
    () => state.pipes.filter((p) => p.venueId === state.visits.find((v) => v.id === visitId)?.venueId),
    [state.pipes, state.visits, visitId],
  );

  const submit = () => {
    if (!pipeId || !author.trim()) return;
    const res = submitMeasurement(state, {
      pipeId,
      visitId,
      author: author.trim(),
      time: new Date(time).toISOString(),
      pitch: form.pitch.trim(),
      cents: Number(form.cents),
      tempC: form.tempC,
      humidityRh: form.humidityRh,
      reedState: form.reedState,
      note: form.note.trim() || undefined,
    });
    if (res.error === "BAD_POWER") {
      setMsg({ tone: "bad", text: "系统关机中，不能提交实测；数据已保留在本机。" });
      return;
    }
    if (res.error === "PENDING_CONFLICT") {
      setMsg({ tone: "bad", text: "该音管已有一份后到的冲突版本待确认，请先在冲突队列里逐字段确认，再提交新值。" });
      return;
    }
    dispatch({ type: "SUBMIT_MEASUREMENT", measurement: res.measurement, conflict: res.conflict });
    setMsg(
      res.conflict
        ? { tone: "bad", text: "已保留为冲突版本（先到那份未做任何改动），请到上方冲突队列确认字段差异。" }
        : { tone: "ok", text: "实测已登记。" },
    );
    setForm({ pitch: "", cents: 0, tempC: undefined, humidityRh: undefined, reedState: "正常", note: "" });
  };

  const history = useMemo(
    () =>
      [...state.measurements]
        .filter((m) => m.visitId === visitId)
        .sort((a, b) => +new Date(b.time) - +new Date(a.time)),
    [state.measurements, visitId],
  );

  const pipeName = (id: string) => {
    const p = state.pipes.find((x) => x.id === id);
    return p ? `${p.stopName} ${p.code}` : id;
  };

  return (
    <div className="tab-grid">
      <Panel title="冲突确认队列" sub={`${pending.length} 份后到实测待确认`}>
        {pending.length === 0 ? (
          <Empty>没有待确认的冲突。两名调音师对同一根音管各提交一次后，后到那份会出现在这里。</Empty>
        ) : (
          <div className="conflict-list">
            {pending.map((g) => (
              <ConflictCard key={g.id} groupId={g.id} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="提交实测值"
        sub="同一根音管的第二份将挂为冲突版本"
        actions={
          <select className={inputCls} value={visitId} onChange={(e) => { setVisitId(e.target.value); setPipeId(""); }}>
            {state.visits.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
                {v.closedAt ? "（已结束）" : ""}
              </option>
            ))}
          </select>
        }
      >
        {!state.powered && <Banner tone="bad">系统关机中，不能提交实测。</Banner>}
        <div className="form-grid">
          <Field label="音管">
            <select className={inputCls} value={pipeId} onChange={(e) => setPipeId(e.target.value)}>
              <option value="">选择音管</option>
              {visitPipes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.stopName} {p.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="调音师">
            <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="调音师甲 / 乙" />
          </Field>
          <Field label="实测时间">
            <input className={inputCls} type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="实测音高">
            <input className={inputCls} value={form.pitch} onChange={(e) => setForm({ ...form, pitch: e.target.value })} placeholder="如 A4" />
          </Field>
          <Field label="音分偏差（cent）">
            <input className={inputCls} type="number" step="1" value={form.cents} onChange={(e) => setForm({ ...form, cents: Number(e.target.value) })} />
          </Field>
          <Field label="温度 ℃">
            <input className={inputCls} type="number" step="0.1" value={form.tempC ?? ""} onChange={(e) => setForm({ ...form, tempC: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
          <Field label="湿度 %RH">
            <input className={inputCls} type="number" step="1" value={form.humidityRh ?? ""} onChange={(e) => setForm({ ...form, humidityRh: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
          <Field label="簧片状态">
            <select className={inputCls} value={form.reedState} onChange={(e) => setForm({ ...form, reedState: e.target.value as ReedState })}>
              {REED_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="维修备注">
            <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
        <button className="primary wide" onClick={submit} disabled={!state.powered || !pipeId || !author.trim() || !form.pitch.trim()}>
          提交实测
        </button>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      </Panel>

      <Panel title="实测留痕" sub="含先到、冲突、归档、最终确认四类">
        {history.length === 0 ? (
          <Empty>本次维护暂无实测</Empty>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>音管</th>
                  <th>调音师</th>
                  <th>音高</th>
                  <th>音分</th>
                  <th>温/湿</th>
                  <th>簧片</th>
                  <th>状态</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id} className={m.status === "archived_conflict" ? "row-archived" : ""}>
                    <td className="mono">{fmtDateTime(m.time)}</td>
                    <td>{pipeName(m.pipeId)}</td>
                    <td>{m.author}</td>
                    <td className="mono">{m.pitch}</td>
                    <td className={"mono " + (Math.abs(m.cents) > state.settings.toleranceCents ? "cent-bad" : "")}>
                      {m.cents > 0 ? `+${m.cents}` : m.cents}
                    </td>
                    <td className="mono small">
                      {m.tempC ?? "—"}℃ / {m.humidityRh ?? "—"}%
                    </td>
                    <td>{m.reedState}</td>
                    <td>
                      <Badge tone={statusTone(m.status)}>{statusLabel(m.status)}</Badge>
                    </td>
                    <td className="note-cell">{m.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ConflictCard({ groupId }: { groupId: string }) {
  const { state, dispatch } = useStore();
  const group = state.conflicts.find((g) => g.id === groupId);
  const [choices, setChoices] = useState<Partial<Record<DiffKey, "original" | "conflict">>>({});
  const [by, setBy] = useState("组长");

  if (!group) return null;
  const pair = groupMeasurements(state, group);
  if (!pair) return null;
  const diffs = diffMeasurements(pair.original, pair.conflict);
  const pipe = state.pipes.find((p) => p.id === group.pipeId);
  const differing = diffs.filter((d) => d.differs);
  const missing = differing.some((d) => !choices[d.field]);

  const confirm = () => {
    const res = resolveConflict(state, {
      groupId: group.id,
      choices,
      resolvedBy: by.trim() || "组长",
      time: new Date().toISOString(),
    });
    if (res.error) return;
    dispatch({ type: "RESOLVE_CONFLICT", state: res.state });
  };

  const fmt = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));

  return (
    <article className="conflict-card">
      <header>
        <b>{pipe ? `${pipe.stopName} ${pipe.code}` : group.pipeId}</b>
        <Badge tone="bad">{differing.length} 个字段不同</Badge>
      </header>
      <p className="muted small">
        先到：{pair.original.author} · {fmtDateTime(pair.original.time)}　｜　后到：
        {pair.conflict.author} · {fmtDateTime(pair.conflict.time)}
      </p>
      <div className="table-wrap">
        <table className="diff-grid">
          <thead>
            <tr>
              <th>字段</th>
              <th>先到（保留）</th>
              <th>后到冲突版</th>
              <th>取哪份</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.field} className={d.differs ? "" : "same-row"}>
                <td>{d.label}</td>
                <td className={d.differs ? "cell-original" : ""}>{fmt(d.original)}</td>
                <td className={d.differs ? "cell-conflict" : ""}>{fmt(d.conflict)}</td>
                <td>
                  {d.differs ? (
                    <div className="seg">
                      <button
                        className={choices[d.field] === "original" ? "seg-on" : ""}
                        onClick={() => setChoices((c) => ({ ...c, [d.field]: "original" }))}
                      >
                        先到
                      </button>
                      <button
                        className={choices[d.field] === "conflict" ? "seg-on seg-on-c" : ""}
                        onClick={() => setChoices((c) => ({ ...c, [d.field]: "conflict" }))}
                      >
                        后到
                      </button>
                    </div>
                  ) : (
                    <span className="muted small">相同，无需选</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="conflict-foot">
        <input className={inputCls} value={by} onChange={(e) => setBy(e.target.value)} placeholder="确认人" />
        <button className="primary" disabled={missing || !by.trim()} onClick={confirm}>
          {missing ? `还有 ${differing.filter((d) => !choices[d.field]).length} 个字段待选` : "生成最终确认值"}
        </button>
      </div>
      <p className="muted tiny">
        确认后先到记录保持「{statusLabel(pair.original.status)}」原样不动，后到版本归档为
        「{statusLabel("archived_conflict")}」，二者均可追溯；报告只采用最终确认值。
      </p>
    </article>
  );
}
