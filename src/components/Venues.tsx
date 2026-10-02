// 场馆与音栓：登记场馆、音栓，记录温湿度（湿度变化会让原预留失效）
import { useState } from "react";
import { DIVISIONS, type Division } from "../types";
import { fmtDateTime } from "../logic";
import { addEnvReading, addStop, addVenue, useStore } from "../store";
import { Badge, Button, Field, Modal, Panel } from "./ui";

export function Venues() {
  const { venues, stops, pipes, reservations } = useStore();
  const [venueModal, setVenueModal] = useState(false);
  const [stopModal, setStopModal] = useState<string | null>(null);
  const [envModal, setEnvModal] = useState<string | null>(null);

  const [vName, setVName] = useState("");
  const [vLocation, setVLocation] = useState("");
  const [vNotes, setVNotes] = useState("");

  const [sName, setSName] = useState("");
  const [sDivision, setSDivision] = useState<Division>("主音栓");

  const [eTemp, setETemp] = useState("");
  const [eHum, setEHum] = useState("");
  const [eBy, setEBy] = useState("");

  const openEnv = (venueId: string) => {
    const v = venues.find((x) => x.id === venueId);
    setEnvModal(venueId);
    setETemp(v?.temperature !== null && v?.temperature !== undefined ? String(v.temperature) : "");
    setEHum(v?.humidity !== null && v?.humidity !== undefined ? String(v.humidity) : "");
    setEBy("");
  };

  const submitEnv = () => {
    if (!envModal) return;
    addEnvReading({
      venueId: envModal,
      temperature: Number(eTemp),
      humidity: Number(eHum),
      by: eBy || "未署名",
    });
    setEnvModal(null);
  };

  const activeReservations = (venueId: string) =>
    reservations.filter(
      (r) => r.venueId === venueId && (r.status === "预留" || r.status === "已确认"),
    ).length;

  return (
    <div className="tab-stack">
      <Panel
        title="场馆与音栓"
        extra={
          <Button variant="primary" onClick={() => setVenueModal(true)}>
            新增场馆
          </Button>
        }
      >
        <div className="venue-grid">
          {venues.map((v) => {
            const venueStops = stops.filter((s) => s.venueId === v.id);
            const pipeCount = pipes.filter((p) =>
              venueStops.some((s) => s.id === p.stopId),
            ).length;
            return (
              <article key={v.id} className="venue-card">
                <div className="venue-head">
                  <div>
                    <h3>{v.name}</h3>
                    <p className="sub">{v.location}</p>
                  </div>
                  {activeReservations(v.id) > 0 && (
                    <Badge color="sky">{activeReservations(v.id)} 项有效预留</Badge>
                  )}
                </div>

                <div className="env-row">
                  <span>
                    温度 <b>{v.temperature !== null ? `${v.temperature}℃` : "—"}</b>
                  </span>
                  <span>
                    湿度 <b>{v.humidity !== null ? `${v.humidity}%` : "—"}</b>
                  </span>
                  <span className="sub">更新于 {fmtDateTime(v.envUpdatedAt)}</span>
                </div>

                {v.notes && <p className="venue-notes">{v.notes}</p>}

                <div className="stop-list">
                  {venueStops.length === 0 && <p className="sub">暂无音栓</p>}
                  {venueStops.map((s) => {
                    const n = pipes.filter((p) => p.stopId === s.id).length;
                    return (
                      <div key={s.id} className="stop-chip">
                        <span>{s.name}</span>
                        <Badge color="slate">{s.division}</Badge>
                        <span className="sub">{n} 管</span>
                      </div>
                    );
                  })}
                </div>

                <div className="row-actions">
                  <Button onClick={() => openEnv(v.id)}>记录温湿度</Button>
                  <Button onClick={() => setStopModal(v.id)}>新增音栓</Button>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>

      {/* 新增场馆 */}
      <Modal open={venueModal} onClose={() => setVenueModal(false)} title="新增场馆">
        <div className="form-grid">
          <Field label="场馆名称">
            <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="如 圣玛丽教堂" />
          </Field>
          <Field label="地点">
            <input value={vLocation} onChange={(e) => setVLocation(e.target.value)} placeholder="如 东侧 12 号" />
          </Field>
          <Field label="备注">
            <input value={vNotes} onChange={(e) => setVNotes(e.target.value)} placeholder="可选" />
          </Field>
        </div>
        <div className="modal-actions">
          <Button onClick={() => setVenueModal(false)}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!vName.trim()) return;
              addVenue({ name: vName.trim(), location: vLocation, notes: vNotes });
              setVenueModal(false);
              setVName("");
              setVLocation("");
              setVNotes("");
            }}
          >
            保存
          </Button>
        </div>
      </Modal>

      {/* 新增音栓 */}
      <Modal open={!!stopModal} onClose={() => setStopModal(null)} title="新增音栓">
        <div className="form-grid">
          <Field label="音栓名称">
            <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="如 Trumpet 8'" />
          </Field>
          <Field label="分组">
            <select value={sDivision} onChange={(e) => setSDivision(e.target.value as Division)}>
              {DIVISIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="modal-actions">
          <Button onClick={() => setStopModal(null)}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!stopModal || !sName.trim()) return;
              addStop({ venueId: stopModal, name: sName.trim(), division: sDivision });
              setStopModal(null);
              setSName("");
            }}
          >
            保存
          </Button>
        </div>
      </Modal>

      {/* 记录温湿度 */}
      <Modal open={!!envModal} onClose={() => setEnvModal(null)} title="记录温湿度">
        <p className="form-msg form-msg-warn">
          湿度变化后，该场馆原有的有效预留将失效，需要重新安排（数据仍保留在本机）。
        </p>
        <div className="form-grid">
          <Field label="温度（℃）">
            <input type="number" value={eTemp} onChange={(e) => setETemp(e.target.value)} />
          </Field>
          <Field label="湿度（%）">
            <input type="number" value={eHum} onChange={(e) => setEHum(e.target.value)} />
          </Field>
          <Field label="记录人">
            <input value={eBy} onChange={(e) => setEBy(e.target.value)} placeholder="如 阿林" />
          </Field>
        </div>
        <div className="modal-actions">
          <Button onClick={() => setEnvModal(null)}>取消</Button>
          <Button variant="primary" onClick={submitEnv}>
            保存并使原预留失效
          </Button>
        </div>
      </Modal>
    </div>
  );
}
