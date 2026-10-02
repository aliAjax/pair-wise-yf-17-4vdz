// 关机 / 风机故障恢复提示条：数据留在本机，接着补没完成的部分
import { useMemo } from "react";
import { confirmReservation, useStore } from "../store";
import { Badge, Button } from "./ui";

export function RecoveryBanner({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const reservations = useStore().reservations;
  const venues = useStore().venues;
  const conflicts = useStore().conflicts;

  const unfinished = useMemo(
    () =>
      reservations.filter(
        (r) => r.status === "预留" || r.status === "已失效" || r.status === "待恢复",
      ),
    [reservations],
  );
  const pendingConflicts = useMemo(
    () => conflicts.filter((c) => c.status === "待核对"),
    [conflicts],
  );

  if (unfinished.length === 0 && pendingConflicts.length === 0) return null;

  const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? "—";

  return (
    <section className="recovery">
      <div className="recovery-head">
        <strong>检测到未完成的排程 / 实测值</strong>
        <span>所有预留与实测值已保存在本机，可接着补全</span>
      </div>

      {pendingConflicts.length > 0 && (
        <div className="recovery-row">
          <Badge color="amber">冲突 {pendingConflicts.length}</Badge>
          <span className="recovery-msg">
            {pendingConflicts.length} 份实测值有两个版本待核对，先到记录未被覆盖
          </span>
          <Button variant="accent" onClick={() => onNavigate("conflicts")}>
            去核对
          </Button>
        </div>
      )}

      {unfinished.map((r) => (
        <div key={r.id} className="recovery-row">
          <Badge
            color={
              r.status === "待恢复" ? "red" : r.status === "已失效" ? "amber" : "sky"
            }
          >
            {r.status}
          </Badge>
          <span className="recovery-msg">
            {venueName(r.venueId)} · {r.tuner} ·{" "}
            {r.status === "已失效"
              ? "湿度变化，原预留失效"
              : r.status === "待恢复"
                ? "风机故障 / 关机后待恢复"
                : "预留待确认"}
          </span>
          {r.status === "预留" && (
            <Button onClick={() => confirmReservation(r.id)}>确认预留</Button>
          )}
          {r.status === "待恢复" && (
            <Button variant="accent" onClick={() => onNavigate("schedule")}>
              恢复并排程
            </Button>
          )}
          {r.status === "已失效" && (
            <Button variant="accent" onClick={() => onNavigate("schedule")}>
              重新安排
            </Button>
          )}
        </div>
      ))}

      <div className="recovery-foot">
        <Button variant="primary" onClick={() => onNavigate("schedule")}>
          继续补全未完成排程
        </Button>
      </div>
    </section>
  );
}
