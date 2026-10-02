import { useMemo, useState } from "react";
import { useStore } from "../store";
import { buildVisitReport, FLAG_META, type ReportRow } from "../domain/report";
import { latestReading } from "../domain/environment";
import { fmtDateTime } from "../domain/utils";
import { Badge, Empty, Field, Panel, inputCls } from "./ui";

export function ReportTab() {
  const { state, dispatch } = useStore();
  const [visitId, setVisitId] = useState(state.visits[0]?.id ?? "");
  const [tick, setTick] = useState(0);
  const generatedAt = useMemo(() => new Date().toISOString(), [tick]);
  const report = visitId ? buildVisitReport(state, visitId, generatedAt) : null;
  const venue = report ? state.venues.find((v) => v.id === report.visit.venueId) : undefined;
  const last = venue ? latestReading(state, venue.id) : undefined;
  const blower = report ? state.blowers.find((b) => b.id === report.visit.blowerId) : undefined;

  return (
    <div className="tab-grid report-tab" id="print-area">
      <Panel
        title="单次维护报告"
        sub="每次打开/重算都按当前最终值"
        actions={
          <>
            <select className={inputCls} value={visitId} onChange={(e) => setVisitId(e.target.value)}>
              {state.visits.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
            <button onClick={() => setTick((t) => t + 1)}>按最终值重算</button>
            <button className="primary" onClick={() => window.print()}>
              打印报告
            </button>
          </>
        }
      >
        {!report ? (
          <Empty>暂无维护任务</Empty>
        ) : (
          <>
            <div className="report-head">
              <h3>{report.visit.title}</h3>
              <p className="muted small">
                场馆：{venue?.name}　风机：{blower?.name}（{blower?.capacityCfm} CFM）
                送达：{fmtDateTime(report.visit.arrivedAt)}
                {report.visit.closedAt ? `　结束：${fmtDateTime(report.visit.closedAt)}` : ""}
              </p>
              <p className="muted small">
                现场最近环境：{last ? `${last.tempC}℃ / ${last.humidityRh}%RH（${fmtDateTime(last.time)}）` : "无记录"}
                　报告生成：{fmtDateTime(report.generatedAt)}
              </p>
            </div>

            <div className="report-stats">
              <Stat label="排程音管" value={report.summary.total} />
              <Stat label="有最终值" value={report.summary.confirmed} tone="ok" />
              <Stat label="异常标记" value={report.summary.abnormal} tone="bad" />
              <Stat label="音分超限" value={report.summary.centsOver} tone="bad" />
              <Stat label="簧片异常" value={report.summary.reedBad} tone="bad" />
              <Stat label="湿度失效预留" value={report.summary.invalidated} tone="warn" />
              <Stat label="缺实测值" value={report.summary.noMeasurement} tone="warn" />
              <Stat label="待处理冲突" value={report.summary.pendingConflicts} tone="warn" />
            </div>

            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>音栓 / 编号</th>
                    <th>最终音高</th>
                    <th>最终音分</th>
                    <th>簧片</th>
                    <th>预留状态</th>
                    <th>异常标记（按最终值重算）</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <ReportLine key={row.pipe.id} row={row} tolerance={state.settings.toleranceCents} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted tiny">
              说明：报告只采用最终值——有冲突时取逐字段确认的「最终确认值」，无冲突时先到实测即为最终值；冲突待确认期间不产出最终值。湿度波动导致的预留失效会保留标记供复检。
            </p>
          </>
        )}
      </Panel>

      <Panel title="判定参数" sub="修改后下一次重算生效">
        <div className="form-grid">
          <Field label={`簧片稳定时长（分钟）`}>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={state.settings.stabilizeMinutes}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_SETTINGS",
                  settings: { ...state.settings, stabilizeMinutes: Number(e.target.value) },
                })
              }
            />
          </Field>
          <Field label="音分报警阈值（|cent|）">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={state.settings.toleranceCents}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_SETTINGS",
                  settings: { ...state.settings, toleranceCents: Number(e.target.value) },
                })
              }
            />
          </Field>
          <Field label="湿度允许波动（%RH）">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={state.settings.humidityDeltaRh}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_SETTINGS",
                  settings: { ...state.settings, humidityDeltaRh: Number(e.target.value) },
                })
              }
            />
          </Field>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: number; tone?: "ok" | "bad" | "warn" | "muted" }) {
  return (
    <div className={`stat stat-${tone}`}>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function ReportLine({ row, tolerance }: { row: ReportRow; tolerance: number }) {
  const status = row.reservation?.status;
  return (
    <tr className={row.abnormal ? "row-abnormal" : ""}>
      <td>
        <b>{row.pipe.stopName}</b>
        <span className="muted small"> · {row.pipe.code}（{row.pipe.group}{row.pipe.isReed ? "·簧片" : ""}）</span>
      </td>
      <td className="mono">{row.final?.pitch ?? "—"}</td>
      <td className={"mono" + (row.flags.centsOver ? " cent-bad" : "")}>
        {row.final ? (
          <>
            {row.final.cents > 0 ? `+${row.final.cents}` : row.final.cents}
            <span className="muted tiny">
              （阈值 ±{tolerance}；{row.finalKind === "confirmed" ? "确认值" : "先到值"}）
            </span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td>{row.final?.reedState ?? row.pipe.reedState}</td>
      <td>
        {status === "done" && <Badge tone="ok">已完成</Badge>}
        {status === "held" && <Badge tone="info">已预留</Badge>}
        {status === "in_progress" && <Badge tone="warn">进行中</Badge>}
        {status === "invalidated" && <Badge tone="bad">已失效需重排</Badge>}
        {!status && <span className="muted">未排程</span>}
      </td>
      <td>
        {row.abnormal ? (
          <div className="flag-stack">
            {FLAG_META.filter((f) => row.flags[f.key]).map((f) => (
              <Badge key={f.key} tone={f.tone}>
                {f.label}
              </Badge>
            ))}
          </div>
        ) : (
          <Badge tone="ok">正常</Badge>
        )}
      </td>
    </tr>
  );
}
