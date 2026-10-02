// 音管台账 + 实测值提交（重复提交自动进入冲突核对）
import { useMemo, useState } from "react";
import { DIVISIONS, REED_STATUSES, type Division, type Pipe, type ReedStatus } from "../types";
import { CENT_LIMIT, fmtDateTime } from "../logic";
import { submitMeasurement, useStore } from "../store";
import { Badge, Button, Field, Modal, Panel } from "./ui";

interface FormState {
  venueId: string;
  stopId: string;
  number: string;
  pitch: string;
  cent: string;
  temperature: string;
  humidity: string;
  reedStatus: ReedStatus;
  notes: string;
  measuredBy: string;
}

const EMPTY: FormState = {
  venueId: "",
  stopId: "",
  number: "",
  pitch: "",
  cent: "0",
  temperature: "",
  humidity: "",
  reedStatus: "正常",
  notes: "",
  measuredBy: "",
};

export function Pipes({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { venues, stops, pipes, conflicts, tuners } = useStore();
  const [division, setDivision] = useState<Division | "全部">("全部");
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [msg, setMsg] = useState<{ type: "ok" | "conflict"; text: string } | null>(null);

  const pendingPipeIds = useMemo(
    () => new Set(conflicts.filter((c) => c.status === "待核对").map((c) => c.pipeId)),
    [conflicts],
  );

  const filtered = useMemo(() => {
    return pipes.filter((p) => {
      const stop = stops.find((s) => s.id === p.stopId);
      if (division !== "全部" && stop?.division !== division) return false;
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        const venue = venues.find((v) => v.id === stop?.venueId);
        return (
          p.number.toLowerCase().includes(k) ||
          p.pitch.toLowerCase().includes(k) ||
          stop?.name.toLowerCase().includes(k) ||
          venue?.name.toLowerCase().includes(k)
        );
      }
      return true;
    });
  }, [pipes, stops, venues, division, keyword]);

  const stopsOfVenue = venues.find((v) => v.id === form.venueId)
    ? stops.filter((s) => s.venueId === form.venueId)
    : [];

  const openNew = () => {
    setForm({ ...EMPTY, venueId: venues[0]?.id ?? "", measuredBy: tuners[0] ?? "" });
    setMsg(null);
    setOpen(true);
  };

  const openRemeasure = (p: Pipe) => {
    const stop = stops.find((s) => s.id === p.stopId);
    setForm({
      venueId: stop?.venueId ?? "",
      stopId: p.stopId,
      number: p.number,
      pitch: p.pitch,
      cent: String(p.cent),
      temperature: p.temperature !== null ? String(p.temperature) : "",
      humidity: p.humidity !== null ? String(p.humidity) : "",
      reedStatus: p.reedStatus,
      notes: p.notes,
      measuredBy: tuners[0] ?? "",
    });
    setMsg(null);
    setOpen(true);
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.stopId || !form.number.trim()) {
      setMsg({ type: "conflict", text: "请选择音栓并填写音管编号" });
      return;
    }
    const res = submitMeasurement({
      stopId: form.stopId,
      number: form.number,
      pitch: form.pitch || form.number,
      cent: Number(form.cent) || 0,
      temperature: form.temperature === "" ? null : Number(form.temperature),
      humidity: form.humidity === "" ? null : Number(form.humidity),
      reedStatus: form.reedStatus,
      notes: form.notes,
      measuredBy: form.measuredBy || "未署名",
    });
    if (res.conflict) {
      setMsg({
        type: "conflict",
        text: "已存在实测值：后到的一份保留为冲突版本，先到记录未被覆盖。请前往冲突核对确认差异。",
      });
    } else {
      setMsg({ type: "ok", text: "实测值已保存" });
      setOpen(false);
    }
  };

  return (
    <div className="tab-stack">
      <Panel
        title="音管台账"
        extra={
          <div className="row-actions">
            <input
              className="search"
              placeholder="搜索音管 / 音栓 / 场馆"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button variant="primary" onClick={openNew}>
              提交实测值
            </Button>
          </div>
        }
      >
        <div className="chips">
          {(["全部", ...DIVISIONS] as const).map((d) => (
            <button
              key={d}
              className={division === d ? "chip-on" : ""}
              onClick={() => setDivision(d)}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>音管编号</th>
                <th>音栓 / 分组</th>
                <th>场馆</th>
                <th>音高</th>
                <th>音分偏差</th>
                <th>温湿度</th>
                <th>簧片状态</th>
                <th>实测人 / 时间</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty">
                    暂无音管记录
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const stop = stops.find((s) => s.id === p.stopId);
                const venue = venues.find((v) => v.id === stop?.venueId);
                const pending = pendingPipeIds.has(p.id);
                const over = Math.abs(p.cent) >= CENT_LIMIT;
                return (
                  <tr key={p.id}>
                    <td className="strong">{p.number}</td>
                    <td>
                      {stop?.name}
                      <div className="sub">{stop?.division}</div>
                    </td>
                    <td>{venue?.name}</td>
                    <td>{p.pitch}</td>
                    <td>
                      <span className={over ? "num-danger" : "num-ok"}>
                        {p.cent > 0 ? "+" : ""}
                        {p.cent}c
                      </span>
                    </td>
                    <td>
                      {p.temperature !== null ? `${p.temperature}℃` : "—"} /{" "}
                      {p.humidity !== null ? `${p.humidity}%` : "—"}
                    </td>
                    <td>{p.reedStatus}</td>
                    <td>
                      {p.measuredBy}
                      <div className="sub">{fmtDateTime(p.measuredAt)}</div>
                    </td>
                    <td>
                      {pending ? (
                        <Badge color="amber">待核对</Badge>
                      ) : p.measuredAt ? (
                        <Badge color="green">已实测</Badge>
                      ) : (
                        <Badge color="slate">待实测</Badge>
                      )}
                    </td>
                    <td>
                      <Button onClick={() => openRemeasure(p)}>复测</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title="提交实测值">
        <div className="form-grid">
          <Field label="场馆">
            <select
              value={form.venueId}
              onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value, stopId: "" }))}
            >
              <option value="">选择场馆</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="音栓">
            <select value={form.stopId} onChange={(e) => set("stopId", e.target.value)}>
              <option value="">选择音栓</option>
              {stopsOfVenue.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.division}
                </option>
              ))}
            </select>
          </Field>
          <Field label="音管编号">
            <input
              value={form.number}
              onChange={(e) => set("number", e.target.value)}
              placeholder="如 C#4"
            />
          </Field>
          <Field label="音高">
            <input
              value={form.pitch}
              onChange={(e) => set("pitch", e.target.value)}
              placeholder="如 C#4"
            />
          </Field>
          <Field label="音分偏差（音分）">
            <input
              type="number"
              value={form.cent}
              onChange={(e) => set("cent", e.target.value)}
            />
          </Field>
          <Field label="温度（℃）">
            <input
              type="number"
              value={form.temperature}
              onChange={(e) => set("temperature", e.target.value)}
              placeholder="如 20"
            />
          </Field>
          <Field label="湿度（%）">
            <input
              type="number"
              value={form.humidity}
              onChange={(e) => set("humidity", e.target.value)}
              placeholder="如 55"
            />
          </Field>
          <Field label="簧片状态">
            <select
              value={form.reedStatus}
              onChange={(e) => set("reedStatus", e.target.value as ReedStatus)}
            >
              {REED_STATUSES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="实测人">
            <select
              value={form.measuredBy}
              onChange={(e) => set("measuredBy", e.target.value)}
            >
              {tuners.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="维修备注">
            <input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="维修备注"
            />
          </Field>
        </div>
        {msg && (
          <p className={msg.type === "conflict" ? "form-msg form-msg-warn" : "form-msg form-msg-ok"}>
            {msg.text}
          </p>
        )}
        <div className="modal-actions">
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={submit}>
            提交实测值
          </Button>
        </div>
      </Modal>
    </div>
  );
}
