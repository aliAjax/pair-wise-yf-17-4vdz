import { useEffect, useMemo, useReducer, useState } from "react";
import "./styles.css";
import { buildSeed } from "./seed";
import type { AppState } from "./types";
import { loadState, reducer, saveState, StoreContext } from "./store";
import { pendingConflicts } from "./domain/measurements";
import { RegistryTab } from "./components/RegistryTab";
import { EnvironmentTab } from "./components/EnvironmentTab";
import { ScheduleTab } from "./components/ScheduleTab";
import { MeasurementsTab } from "./components/MeasurementsTab";
import { ReportTab } from "./components/ReportTab";

type Tab = "registry" | "environment" | "schedule" | "measure" | "report";

const TABS: { key: Tab; label: string }[] = [
  { key: "registry", label: "场馆与音管" },
  { key: "environment", label: "风机与温湿度" },
  { key: "schedule", label: "排程时段" },
  { key: "measure", label: "实测与冲突" },
  { key: "report", label: "单次维护报告" },
];

function init(): AppState {
  return loadState() ?? buildSeed();
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [tab, setTab] = useState<Tab>("schedule");

  useEffect(() => {
    saveState(state);
  }, [state]);

  const pendingCount = useMemo(() => pendingConflicts(state).length, [state]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `organ-scheduler-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppState;
        if (parsed.version !== 1) throw new Error("版本不符");
        dispatch({ type: "REPLACE_ALL", state: parsed });
      } catch {
        window.alert("备份文件无法识别。");
      }
    };
    reader.readAsText(file);
  };

  const resetSeed = () => {
    if (window.confirm("载入演示数据会覆盖本机当前的全部记录，确定继续？")) {
      dispatch({ type: "REPLACE_ALL", state: buildSeed() });
    }
  };

  const wipe = () => {
    if (window.confirm("清空全部本机数据？此操作不可撤销。")) {
      const empty: AppState = {
        version: 1,
        powered: true,
        venues: [],
        pipes: [],
        readings: [],
        blowers: [
          { id: "blower_mobile_1", name: "移动风机 MF-220", capacityCfm: 220, venueId: null, state: "idle" },
        ],
        visits: [],
        reservations: [],
        measurements: [],
        conflicts: [],
        events: [],
        settings: { stabilizeMinutes: 60, toleranceCents: 8, humidityDeltaRh: 10 },
      };
      dispatch({ type: "REPLACE_ALL", state: empty });
    }
  };

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      <main className="app">
        <header className="topbar">
          <div className="brand">
            <h1>管风琴调音排程台</h1>
            <p>移动风机轮转 · 簧片湿度稳定 · 双人实测冲突留痕</p>
          </div>
          <div className="top-actions">
            <label className={"power" + (state.powered ? " power-on" : " power-off")}>
              <input
                type="checkbox"
                checked={state.powered}
                onChange={(e) => dispatch({ type: e.target.checked ? "POWER_ON" : "POWER_OFF" })}
              />
              <span className="power-dot" />
              {state.powered ? "开机中" : "已关机"}
            </label>
            <button onClick={exportJson}>导出备份</button>
            <label className="btn-like">
              导入备份
              <input
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importJson(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button onClick={resetSeed}>演示数据</button>
            <button className="danger-text" onClick={wipe}>
              清空
            </button>
          </div>
        </header>

        {!state.powered && (
          <div className="offline-strip">
            系统已关机（排程中断）：所有预留、实测与冲突版本均保存在本机浏览器存储中，不会丢失；开机后继续未完成的部分。
          </div>
        )}

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={"tab" + (tab === t.key ? " tab-on" : "")}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === "measure" && pendingCount > 0 && <span className="tab-dot">{pendingCount}</span>}
            </button>
          ))}
        </nav>

        {tab === "registry" && <RegistryTab />}
        {tab === "environment" && <EnvironmentTab />}
        {tab === "schedule" && <ScheduleTab />}
        {tab === "measure" && <MeasurementsTab />}
        {tab === "report" && <ReportTab />}

        <footer className="foot">
          数据仅保存于本机（localStorage），可用「导出备份」另存 JSON；单次维护报告按最终值实时重算。
        </footer>
      </main>
    </StoreContext.Provider>
  );
}
