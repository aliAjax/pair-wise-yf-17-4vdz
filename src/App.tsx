import { useState } from "react";
import "./styles.css";
import { shutdown, useStore } from "./store";
import { Dashboard } from "./components/Dashboard";
import { Pipes } from "./components/Pipes";
import { Venues } from "./components/Venues";
import { Scheduling } from "./components/Scheduling";
import { Conflicts } from "./components/Conflicts";
import { Report } from "./components/Report";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { Button } from "./components/ui";

const TABS = [
  { id: "dashboard", label: "总览" },
  { id: "pipes", label: "音管台账" },
  { id: "venues", label: "场馆音栓" },
  { id: "schedule", label: "排程台" },
  { id: "conflicts", label: "冲突核对" },
  { id: "report", label: "维护报告" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [poweredOff, setPoweredOff] = useState(false);
  const conflicts = useStore().conflicts;
  const unfinished = useStore().reservations.filter(
    (r) => r.status === "预留" || r.status === "已失效" || r.status === "待恢复",
  ).length;
  const pendingConflicts = conflicts.filter((c) => c.status === "待核对").length;

  const doShutdown = () => {
    shutdown(); // 未完成预留转待恢复，数据写入本机
    setPoweredOff(true);
  };

  if (poweredOff) {
    return (
      <div className="poweroff">
        <div className="poweroff-card">
          <h1>已关机</h1>
          <p>排程与实测值已保存在本机浏览器中。</p>
          <p className="sub">重新开机后可接着补全未完成的排程与冲突核对。</p>
          <Button
            variant="primary"
            onClick={() => {
              // 重新开机：刷新页面，从本机恢复
              window.location.reload();
            }}
          >
            重新开机
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar-id">
          <span className="topbar-project">hxyfront-62005 · 管风琴维护</span>
          <h1>调音排程台</h1>
          <p className="topbar-sub">
            移动风机轮转排程 · 簧片管湿度稳定时长 · 双调音师实测冲突核对 · 本机持久化与故障恢复
          </p>
        </div>
        <div className="topbar-actions">
          <Button variant="danger" onClick={doShutdown}>
            模拟关机
          </Button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab tab-on" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "conflicts" && pendingConflicts > 0 && (
              <span className="tab-badge">{pendingConflicts}</span>
            )}
            {t.id === "schedule" && unfinished > 0 && (
              <span className="tab-badge tab-badge-red">{unfinished}</span>
            )}
          </button>
        ))}
      </nav>

      <RecoveryBanner onNavigate={setTab} />

      <div className="tab-content">
        {tab === "dashboard" && <Dashboard onNavigate={setTab} />}
        {tab === "pipes" && <Pipes onNavigate={setTab} />}
        {tab === "venues" && <Venues />}
        {tab === "schedule" && <Scheduling onShutdown={doShutdown} />}
        {tab === "conflicts" && <Conflicts />}
        {tab === "report" && <Report />}
      </div>

      <footer className="foot">
        数据保存在本机 localStorage · 关机或风机故障后恢复时，预留与实测值不丢失
      </footer>
    </main>
  );
}
