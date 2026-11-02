import * as React from "react";
import { IGateListItem, ITaskListItem } from "../../../models";
import { GetBucketStatusFromTasks, StatusToColor } from "../utils/GetGateStatus";
import { GroupByProject } from "../utils/GroupByProject";
import styles from "./GateProgressBar.module.scss";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface GateProgressBarProps {
  gates: IGateListItem[];
  tasks: ITaskListItem[];
  /** Executive-filtered subset — when provided, gate colors are derived from this set only. */
  execTasks?: ITaskListItem[];
  activeGate?: string;      // gate name | "all" | null
  onGateClick: (gate: string) => void;
  onOverallClick: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const GateProgressBar: React.FC<GateProgressBarProps> = ({
  gates, tasks, execTasks, activeGate, onGateClick, onOverallClick,
}) => {
  const indicatorTasks = execTasks ?? tasks;
  if (gates.length === 0) return null;

  const overall = GroupByProject(gates).Complete;

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>

        {/* ── Gate segments ─────────────────────────────────────────────── */}
        {gates.map((gate, idx) => {
          const gateTasks = indicatorTasks.filter(t => t.Gate === gate.Gate);
          const status    = GetBucketStatusFromTasks(gateTasks);
          const barColor  = StatusToColor(status, true);
          const isActive  = activeGate === gate.Gate;
          const textColor = status === "white" ? "#444" : "#fff";

          return (
            <div
              key={idx}
              onClick={() => onGateClick(gate.Gate)}
              title={`${gate.Gate} — ${Math.floor(gate.Complete)}% complete`}
              className={styles.gateSegment}
            >
              <div
                className={`${styles.gateBar} ${isActive ? styles.gateBarActive : ""}`}
                style={{ background: barColor, color: textColor }}
              >
                {Math.floor(gate.Complete)}%
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


      </div>
    </div>
  );
};

export default GateProgressBar;
