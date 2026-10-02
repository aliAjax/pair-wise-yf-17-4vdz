// 冲突核对：两名调音师提交同一根音管实测值，按字段选择先到/后到
import { useMemo, useState } from "react";
import type { ConflictRecord } from "../types";
import { fmtDateTime } from "../logic";
import { resolveConflict, useStore } from "../store";
import { Badge, Button, Panel } from "./ui";

export function Conflicts() {
  const conflicts = useStore().conflicts;
  const [choice, setChoice] = useState<
    Record<string, Record<string, "existing" | "incoming">>
  >({});

  const pending = useMemo(
    () => conflicts.filter((c) => c.status === "待核对"),
    [conflicts],
  );
  const resolved = useMemo(
    () => conflicts.filter((c) => c.status === "已确认"),
    [conflicts],
  );

  const current = (c: ConflictRecord) => choice[c.id] ?? {};

  const pick = (c: ConflictRecord, field: string, which: "existing" | "incoming") => {
    setChoice((prev) => ({
      ...prev,
      [c.id]: { ...(prev[c.id] ?? {}), [field]: which },
    }));
  };

  const confirm = (c: ConflictRecord) => {
    const res: Record<string, "existing" | "incoming"> = {};
    for (const d of c.diffs) {
      res[d.field] = current(c)[d.field] ?? "existing"; // 默认保留先到
    }
    resolveConflict(c.id, res);
  };

  return (
    <div className="tab-stack">
      <Panel title={`待核对冲突（${pending.length}）`}>
        {pending.length === 0 ? (
          <p className="empty">没有待核对的实测值冲突</p>
        ) : (
          <div className="conflict-stack">
            {pending.map((c) => (
              <article key={c.id} className="conflict-card">
                <div className="conflict-head">
                  <div>
                    <h3>
                      音管 {c.pipeLabel}
                      <Badge color="amber">后到版本</Badge>
                    </h3>
                    <p className="sub">
                      后到提交人 {c.incomingBy} · {fmtDateTime(c.createdAt)} · 先到记录完整保留，未被覆盖
                    </p>
                  </div>
                </div>

                <table className="table diff-table">
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>先到值（保留）</th>
                      <th>后到值（冲突版本）</th>
                      <th>采用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.diffs.map((d) => {
                      const sel = current(c)[d.field] ?? "existing";
                      return (
                        <tr key={d.field}>
                          <td>{d.label}</td>
                          <td className={sel === "existing" ? "diff-pick" : ""}>{d.existing}</td>
                          <td className={sel === "incoming" ? "diff-pick" : ""}>{d.incoming}</td>
                          <td>
                            <div className="diff-radio">
                              <label>
                                <input
                                  type="radio"
                                  name={`${c.id}-${d.field}`}
                                  checked={sel === "existing"}
                                  onChange={() => pick(c, d.field, "existing")}
                                />
                                先到
                              </label>
                              <label>
                                <input
                                  type="radio"
                                  name={`${c.id}-${d.field}`}
                                  checked={sel === "incoming"}
                                  onChange={() => pick(c, d.field, "incoming")}
                                />
                                后到
                              </label>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="modal-actions">
                  <Button variant="primary" onClick={() => confirm(c)}>
                    确认差异并落为最终值
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`已确认（${resolved.length}）`}>
        {resolved.length === 0 ? (
          <p className="empty">暂无已确认冲突</p>
        ) : (
          <div className="records">
            {resolved.map((c) => (
              <article key={c.id}>
                <b>✓</b>
                <div>
                  <h3>音管 {c.pipeLabel}</h3>
                  <p className="sub">
                    {c.diffs.length} 项差异已确认 · 最终值已重算异常标记
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
