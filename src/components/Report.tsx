// 单次维护报告：按最终确认值重算异常标记
import { useMemo, useState } from "react";
import { CENT_LIMIT, HUMIDITY_RANGE, TEMPERATURE_RANGE, recomputeAnomalies } from "../logic";
import { useStore } from "../store";
import { Badge, Button, Panel } from "./ui";

export function Report() {
  {
    const { venues, stops, pipes, conflicts, reservations } = useStore();
    const [venueId, setVenueId] = useState<string>("all");
    const [tick, setTick] = useState(0);
    const [lastRecompute, setLastRecompute] = useState<string | null>(null);

    const pendingPipeIds = useMemo(
      () => new Set(conflicts.filter((c) => c.status === "待核对").map((c) => c.pipeId)),
      [conflicts],
    );

    const scopePipes = useMemo(() => {
      if (venueId === "all") return pipes;
      return pipes.filter((p) => {
        const stop = stops.find((s) => s.id === p.stopId);
        return stop?.venueId === venueId;
      });
    }, [pipes, stops, venueId]);

    // 按最终确认值重算异常标记（tick 用于响应“重算”按钮）
    const anomalies = useMemo(() => {
      void tick;
      return recomputeAnomalies(scopePipes, pendingPipeIds);
    }, [scopePipes, pendingPipeIds, tick]);

    const measured = scopePipes.filter((p) => p.measuredAt);
    const pending = scopePipes.filter((p) => pendingPipeIds.has(p.id));
    const unmeasured = scopePipes.filter((p) => !p.measuredAt);

    const scopeReservations = useMemo(() => {
      if (venueId === "all") return reservations;
      return reservations.filter((r) => r.venueId === venueId);
    }, [reservations, venueId]);

    const doRecompute = () => {
      setTick((t) => t + 1);
      setLastRecompute(new Date().toISOString());
    };

    const stats = [
      { label: "音管总数", value: scopePipes.length },
      { label: "已实测（最终值）", value: measured.length },
      { label: "待核对冲突", value: pending.length },
      { label: "异常音管", value: anomalies.size },
    ];

    return (
      <div className="tab-stack">
        <Panel
          title="单次维护报告"
          extra={
            <div className="row-actions">
              <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                <option value="all">全部场馆</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <Button variant="primary" onClick={doRecompute}>
                重算异常标记
              </Button>
            </div>
          }
        >
          <div className="report-meta">
            <p>
              维护范围：
              <b>{venueId === "all" ? "全部场馆" : venues.find((v) => v.id === venueId)?.name}</b>
            </p>
            <p className="sub">
              异常标记依据最终确认值重算：音分偏差 ≥ ±{CENT_LIMIT}c、簧片状态异常、湿度{" "}
              {HUMIDITY_RANGE[0]}–{HUMIDITY_RANGE[1]}%、温度 {TEMPERATURE_RANGE[0]}–
              {TEMPERATURE_RANGE[1]}℃。
              {lastRecompute && ` 上次重算：${new Date(lastRecompute).toLocaleString("zh-CN")}`}
            </p>
          </div>

          <div className="metrics">
            {stats.map((s) => (
              <article key={s.label}>
                <small>{s.label}</small>
                <strong>{s.value}</strong>
              </article>
            ))}
          </div>

          <h3 className="section-title">异常音管（{anomalies.size}）</h3>
          {anomalies.size === 0 ? (
            <p className="empty">按最终确认值重算后，暂无异常音管</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>音管编号</th>
                    <th>音栓</th>
                    <th>场馆</th>
                    <th>音分偏差</th>
                    <th>簧片状态</th>
                    <th>温湿度</th>
                    <th>异常原因</th>
                  </tr>
                </thead>
                <tbody>
                  {scopePipes
                    .filter((p) => anomalies.has(p.id))
                    .map((p) => {
                      const stop = stops.find((s) => s.id === p.stopId);
                      const venue = venues.find((v) => v.id === stop?.venueId);
                      return (
                        <tr key={p.id}>
                          <td className="strong">{p.number}</td>
                          <td>{stop?.name}</td>
                          <td>{venue?.name}</td>
                          <td>
                            <span className="num-danger">
                              {p.cent > 0 ? "+" : ""}
                              {p.cent}c
                            </span>
                          </td>
                          <td>{p.reedStatus}</td>
                          <td>
                            {p.temperature !== null ? `${p.temperature}℃` : "—"} /{" "}
                            {p.humidity !== null ? `${p.humidity}%` : "—"}
                          </td>
                          <td>{anomalies.get(p.id)?.join("；")}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {pending.length > 0 && (
            <>
              <h3 className="section-title">待核对（{pending.length}）</h3>
              <div className="records">
                {pending.map((p) => (
                  <article key={p.id}>
                    <b>?</b>
                    <div>
                      <h3>{p.number}</h3>
                      <p className="sub">存在两个实测版本，确认前不纳入异常重算</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {unmeasured.length > 0 && (
            <>
              <h3 className="section-title">未实测（{unmeasured.length}）</h3>
              <p className="sub">
                {unmeasured.map((p) => p.number).join("、")} 尚未提交实测值，暂不参与异常标记。
              </p>
            </>
          )}

          <h3 className="section-title">排程执行情况</h3>
          <div className="records">
            {scopeReservations.length === 0 && <p className="empty">本范围暂无排程</p>}
            {scopeReservations.map((r) => {
              const v = venues.find((x) => x.id === r.venueId);
              return (
                <article key={r.id}>
                  <b>·</b>
                  <div>
                    <h3>
                      {v?.name} · {r.tuner}
                    </h3>
                    <p className="sub">
                      {new Date(r.start).toLocaleString("zh-CN")} · {r.pipeIds.length} 管 ·{" "}
                      <Badge
                        color={
                          r.status === "已完成"
                            ? "slate"
                            : r.status === "已失效"
                              ? "amber"
                              : r.status === "待恢复"
                                ? "red"
                                : "sky"
                        }
                      >
                        {r.status}
                      </Badge>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }
}
