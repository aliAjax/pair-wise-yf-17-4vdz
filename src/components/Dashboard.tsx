// 总览面板
import { useMemo } from "react";
import { CENT_LIMIT, recomputeAnomalies } from "../logic";
import { useStore } from "../store";
import { Badge, Panel } from "./ui";

export function Dashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { venues, stops, pipes, conflicts, reservations } = useStore();

  const pendingConflictPipeIds = useMemo(
    () => new Set(conflicts.filter((c) => c.status === "待核对").map((c) => c.pipeId)),
    [conflicts],
  );
  const anomalies = useMemo(
    () => recomputeAnomalies(pipes, pendingConflictPipeIds),
    [pipes, pendingConflictPipeIds],
  );

  const avgTemp = useMemo(() => {
    const vals = venues.map((v) => v.temperature).filter((v): v is number => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [venues]);
  const avgHum = useMemo(() => {
    const vals = venues.map((v) => v.humidity).filter((v): v is number => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [venues]);

  const overLimit = pipes.filter(
    (p) => p.measuredAt && !pendingConflictPipeIds.has(p.id) && Math.abs(p.cent) >= CENT_LIMIT,
  ).length;
  const pendingConflicts = conflicts.filter((c) => c.status === "待核对").length;
  const unfinished = reservations.filter(
    (r) => r.status === "预留" || r.status === "已失效" || r.status === "待恢复",
  ).length;

  const metrics = [
    { label: "音栓数量", value: stops.length, accent: "var(--secondary)" },
    { label: "偏差超限音管", value: overLimit, accent: "var(--danger)" },
    { label: "平均温度", value: avgTemp !== null ? `${avgTemp}℃` : "—", accent: "var(--accent)" },
    { label: "平均湿度", value: avgHum !== null ? `${avgHum}%` : "—", accent: "var(--primary)" },
  ];

  return (
    <div className="tab-stack">
      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label} style={{ borderTopColor: m.accent }}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <div className="dash-grid">
        <Panel title="待办概览">
          <ul className="dash-list">
            <li>
              <span>待核对实测值冲突</span>
              <Badge color={pendingConflicts ? "amber" : "green"}>{pendingConflicts}</Badge>
            </li>
            <li>
              <span>未完成排程</span>
              <Badge color={unfinished ? "red" : "green"}>{unfinished}</Badge>
            </li>
            <li>
              <span>异常音管（按最终确认值重算）</span>
              <Badge color={anomalies.size ? "red" : "green"}>{anomalies.size}</Badge>
            </li>
            <li>
              <span>场馆 / 音管</span>
              <Badge color="sky">
                {venues.length} / {pipes.length}
              </Badge>
            </li>
          </ul>
          <div className="dash-actions">
            <button className="btn btn-accent" onClick={() => onNavigate("schedule")}>
              前往排程台
            </button>
            <button className="btn" onClick={() => onNavigate("report")}>
              查看维护报告
            </button>
          </div>
        </Panel>

        <Panel title="异常音管标记">
          {anomalies.size === 0 ? (
            <p className="empty">暂无异常音管</p>
          ) : (
            <div className="records">
              {pipes
                .filter((p) => anomalies.has(p.id))
                .map((p) => {
                  const venue = venues.find(
                    (v) => v.id === stops.find((s) => s.id === p.stopId)?.venueId,
                  );
                  return (
                    <article key={p.id}>
                      <b>!</b>
                      <div>
                        <h3>
                          {p.number} · {venue?.name}
                        </h3>
                        <p>{anomalies.get(p.id)?.join("；")}</p>
                      </div>
                    </article>
                  );
                })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
