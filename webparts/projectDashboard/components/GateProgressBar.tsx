import * as React from "react";
import { IGateListItem, ITaskListItem } from "../../../models";
import { GetBucketStatusFromTasks, StatusToColor } from "../utils/GetGateStatus";
import { GroupByProject } from "../utils/GroupByProject";

// ─── Gear icon (inline SVG — Bootstrap Icons "gear-fill", no external dep) ────

const GearIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
  </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface GateProgressBarProps {
  gates: IGateListItem[];
  tasks: ITaskListItem[];
  activeGate: string | null;      // gate name | "all" | null
  onGateClick: (gate: string) => void;
  onOverallClick: () => void;
  /** Optional gear/settings button — shown to the right of Overall */
  onSettingsClick?: () => void;
  settingsActive?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const GateProgressBar: React.FC<GateProgressBarProps> = ({
  gates, tasks, activeGate, onGateClick, onOverallClick,
  onSettingsClick, settingsActive,
}) => {
  if (gates.length === 0) return null;

  const overall = GroupByProject(gates).Complete;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 3, width: "100%", alignItems: "stretch" }}>

        {/* ── Gate segments ───────────────────────────────────────────── */}
        {gates.map((gate, idx) => {
          const gateTasks = tasks.filter(t => t.Gate === gate.Gate);
          const status    = GetBucketStatusFromTasks(gateTasks);
          const barColor  = StatusToColor(status, true);
          const isActive  = activeGate === gate.Gate;
          const textColor = status === "white" ? "#444" : "#fff";

          return (
            <div
              key={idx}
              onClick={() => onGateClick(gate.Gate)}
              title={`${gate.Gate} — ${gate.Complete.toFixed(0)}% complete`}
              style={{ flex: 1, minWidth: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
            >
              <div style={{
                width: "100%", height: 22, borderRadius: 4,
                background: barColor,
                border: isActive ? "2px solid #0078d4" : "0.5px solid #D3D1C7",
                boxShadow: isActive ? "0 0 0 2px #cce5ff" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 600, color: textColor,
                overflow: "hidden", padding: "0 4px",
                transition: "border 0.15s, box-shadow 0.15s",
              }}>
                {gate.Complete.toFixed(0)}%
              </div>
              <span style={{
                fontSize: 9, color: isActive ? "#0078d4" : "#888780",
                fontWeight: isActive ? 600 : 400,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: "100%", textAlign: "center",
              }}>
                {gate.Gate.substring(0, 14)}
              </span>
            </div>
          );
        })}

        {/* ── Overall badge ────────────────────────────────────────────── */}
        <div
          onClick={onOverallClick}
          title="Show / hide all tasks"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, marginLeft: 6, cursor: "pointer" }}
        >
          <div style={{
            height: 22, padding: "0 10px", borderRadius: 4,
            background: activeGate === "all" ? "#E6F1FB" : "#f3f2f1",
            border: activeGate === "all" ? "2px solid #0078d4" : "0.5px solid #D3D1C7",
            boxShadow: activeGate === "all" ? "0 0 0 2px #cce5ff" : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700,
            color: activeGate === "all" ? "#0078d4" : "#323130",
            whiteSpace: "nowrap", transition: "all 0.15s",
          }}>
            {overall.toFixed(0)}%
          </div>
          <span style={{ fontSize: 9, color: activeGate === "all" ? "#0078d4" : "#B4B2A9", fontWeight: activeGate === "all" ? 600 : 400 }}>
            Overall
          </span>
        </div>

        {/* ── Settings (gear) button — optional ────────────────────────── */}
        {onSettingsClick && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, marginLeft: 4 }}>
            <button
              type="button"
              onClick={onSettingsClick}
              title={settingsActive ? "Hide project options" : "Show project options"}
              style={{
                width: 26, height: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 4,
                border: settingsActive ? "2px solid #0078d4" : "0.5px solid #D3D1C7",
                background: settingsActive ? "#E6F1FB" : "#f3f2f1",
                color: settingsActive ? "#0078d4" : "#605e5c",
                cursor: "pointer",
                padding: 0,
                transition: "all 0.15s",
                flexShrink: 0,
              }}
            >
              <GearIcon size={13} />
            </button>
            <span style={{ fontSize: 9, color: settingsActive ? "#0078d4" : "#B4B2A9", fontWeight: settingsActive ? 600 : 400 }}>
              Options
            </span>
          </div>
        )}

      </div>
    </div>
  );
};

export default GateProgressBar;
