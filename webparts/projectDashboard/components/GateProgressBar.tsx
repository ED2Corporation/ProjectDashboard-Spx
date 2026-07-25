import * as React from "react";
import { IGateListItem, ITaskListItem } from "../../../models";
import { GetBucketStatusFromTasks, StatusToColor } from "../utils/GetGateStatus";
import { GroupByProject } from "../utils/GroupByProject";
import styles from "./GateProgressBar.module.scss";

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
  activeGate?: string;      // gate name | "all" | null
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
    <div className={styles.wrapper}>
      <div className={styles.row}>

        {/* ── Gate segments ─────────────────────────────────────────────── */}
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
              className={styles.gateSegment}
            >
              <div
                className={`${styles.gateBar} ${isActive ? styles.gateBarActive : ""}`}
                style={{ background: barColor, color: textColor }}
              >
                {gate.Complete.toFixed(0)}%
              </div>
              <span className={`${styles.gateLabel} ${isActive ? styles.gateLabelActive : ""}`}>
                {gate.Gate}
              </span>
            </div>
          );
        })}

        {/* ── Overall badge ──────────────────────────────────────────────── */}
        <div
          onClick={onOverallClick}
          title="Show / hide all tasks"
          className={styles.overallWrapper}
        >
          <div className={`${styles.overallBar} ${activeGate === "all" ? styles.overallBarActive : ""}`}>
            {overall.toFixed(0)}%
          </div>
          <span className={`${styles.overallLabel} ${activeGate === "all" ? styles.overallLabelActive : ""}`}>
            Overall
          </span>
        </div>

        {/* ── Settings (gear) button — optional ─────────────────────────── */}
        {onSettingsClick && (
          <div className={styles.settingsWrapper}>
            <button
              type="button"
              onClick={onSettingsClick}
              title={settingsActive ? "Hide project options" : "Show project options"}
              className={`${styles.settingsBtn} ${settingsActive ? styles.settingsBtnActive : ""}`}
            >
              <GearIcon size={13} />
            </button>
            <span className={`${styles.settingsLabel} ${settingsActive ? styles.settingsLabelActive : ""}`}>
              Options
            </span>
          </div>
        )}

      </div>
    </div>
  );
};

export default GateProgressBar;
