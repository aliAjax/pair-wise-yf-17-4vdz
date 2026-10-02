import { useState } from "react";
import { useStore } from "../store";
import { PIPE_GROUPS, REED_STATES, type Pipe, type PipeGroup, type ReedState, type Venue } from "../types";
import { uid } from "../domain/utils";
import { Badge, Empty, Field, Panel, inputCls } from "./ui";

export function RegistryTab() {
  const { state, dispatch } = useStore();
  const [venueName, setVenueName] = useState("");
  const [venueLoc, setVenueLoc] = useState("");
  const [filterVenue, setFilterVenue] = useState<string>("");
  const [filterGroup, setFilterGroup] = useState<string>("");

  const [form, setForm] = useState({
    venueId: "",
    code: "",
    stopName: "",
    group: "簧片音栓" as PipeGroup,
    pitch: "",
    isReed: true,
    demandCfm: 60,
    reedState: "正常" as ReedState,
    notes: "",
  });

  const addVenue = () => {
    if (!venueName.trim()) return;
    const venue: Venue = { id: uid("venue"), name: venueName.trim(), location: venueLoc.trim() || undefined };
    dispatch({ type: "ADD_VENUE", venue });
    setVenueName("");
    setVenueLoc("");
    if (!form.venueId) setForm((f) => ({ ...f, venueId: venue.id }));
  };

  const addPipe = () => {
    if (!form.venueId || !form.code.trim() || !form.stopName.trim() || !form.pitch.trim()) return;
    const pipe: Pipe = {
      id: uid("pipe"),
      venueId: form.venueId,
      code: form.code.trim(),
      stopName: form.stopName.trim(),
      group: form.group,
      pitch: form.pitch.trim(),
      isReed: form.isReed,
      demandCfm: Number(form.demandCfm) || 0,
      reedState: form.reedState,
      notes: form.notes.trim() || undefined,
    };
    dispatch({ type: "ADD_PIPE", pipe });
    setForm((f) => ({ ...f, code: "", pitch: "", notes: "" }));
  };

  const pipes = state.pipes.filter(
    (p) =>
      (!filterVenue || p.venueId === filterVenue) &&
      (!filterGroup || p.group === filterGroup),
  );

  return (
    <div className="tab-grid">
      <Panel title="场馆登记" sub="教堂 / 音乐厅">
        <div className="form-row">
          <Field label="场馆名称">
            <input className={inputCls} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="如 圣玛丽教堂" />
          </Field>
          <Field label="位置（可选）">
            <input className={inputCls} value={venueLoc} onChange={(e) => setVenueLoc(e.target.value)} placeholder="如 老城区礼拜堂" />
          </Field>
          <div className="field-end">
            <button className="primary" onClick={addVenue} disabled={!venueName.trim()}>
              登记场馆
            </button>
          </div>
        </div>
        <div className="card-list">
          {state.venues.map((v) => (
            <article className="mini-card" key={v.id}>
              <b>{v.name}</b>
              <span>{v.location || "—"}</span>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="音管登记" sub="音栓 · 编号 · 分组 · 簧片状态">
        <div className="form-grid">
          <Field label="所在场馆">
            <select
              className={inputCls}
              value={form.venueId}
              onChange={(e) => setForm({ ...form, venueId: e.target.value })}
            >
              <option value="">选择场馆</option>
              {state.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="音栓">
            <input className={inputCls} value={form.stopName} onChange={(e) => setForm({ ...form, stopName: e.target.value })} placeholder="如 Trumpet 8'" />
          </Field>
          <Field label="音管编号">
            <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="如 C#4" />
          </Field>
          <Field label="音高">
            <input className={inputCls} value={form.pitch} onChange={(e) => setForm({ ...form, pitch: e.target.value })} placeholder="如 C#4 / A4" />
          </Field>
          <Field label="分组">
            <select className={inputCls} value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value as PipeGroup })}>
              {PIPE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="簧片状态">
            <select className={inputCls} value={form.reedState} onChange={(e) => setForm({ ...form, reedState: e.target.value as ReedState })}>
              {REED_STATES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label={`定音风量需求（CFM）`}>
            <input className={inputCls} type="number" min={0} value={form.demandCfm} onChange={(e) => setForm({ ...form, demandCfm: Number(e.target.value) })} />
          </Field>
          <Field label="管型">
            <label className="checkline">
              <input type="checkbox" checked={form.isReed} onChange={(e) => setForm({ ...form, isReed: e.target.checked })} />
              簧片管（需稳定时长）
            </label>
          </Field>
          <Field label="维修备注">
            <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="本季观察 / 待更换簧片…" />
          </Field>
        </div>
        <button
          className="primary wide"
          onClick={addPipe}
          disabled={!form.venueId || !form.code.trim() || !form.stopName.trim() || !form.pitch.trim()}
        >
          登记音管
        </button>
      </Panel>

      <Panel
        title="音管台账"
        sub={`${pipes.length} 支音管`}
        actions={
          <>
            <select className={inputCls} value={filterVenue} onChange={(e) => setFilterVenue(e.target.value)}>
              <option value="">全部场馆</option>
              {state.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select className={inputCls} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
              <option value="">全部分组</option>
              {PIPE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </>
        }
      >
        {pipes.length === 0 ? (
          <Empty>暂无符合条件的音管</Empty>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>场馆</th>
                  <th>音栓</th>
                  <th>编号</th>
                  <th>音高</th>
                  <th>分组</th>
                  <th>管型</th>
                  <th>风量</th>
                  <th>簧片状态</th>
                  <th>维修备注</th>
                </tr>
              </thead>
              <tbody>
                {pipes.map((p) => (
                  <tr key={p.id}>
                    <td>{state.venues.find((v) => v.id === p.venueId)?.name ?? "—"}</td>
                    <td>{p.stopName}</td>
                    <td className="mono">{p.code}</td>
                    <td className="mono">{p.pitch}</td>
                    <td>{p.group}</td>
                    <td>{p.isReed ? <Badge tone="info">簧片管</Badge> : "唇管"}</td>
                    <td className="mono">{p.demandCfm}</td>
                    <td>
                      <Badge tone={p.reedState === "正常" ? "ok" : p.reedState === "待更换" || p.reedState === "锈蚀" ? "bad" : "warn"}>
                        {p.reedState}
                      </Badge>
                    </td>
                    <td className="note-cell">{p.notes || "—"}</td>
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
