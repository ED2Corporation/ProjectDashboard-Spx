import * as React from "react";
import { useState } from "react";
import { compareWbs } from "../utils/ParseWBS";
import { ITaskStepEntry } from "../utils/TaskDescriptionBlob";
import dashboardStyles from "./ProjectDashboard.module.scss";
import styles from "./TaskCard.module.scss";

type StepTaskSortCol = "wbs" | "task" | "complete" | "start" | "finish";
type StepTaskSortDir = "asc" | "desc";

interface ITaskStepsTableProps {
  steps: ITaskStepEntry[];
  selectedTaskStepId?: string;
  isTaskStepWorkspaceExpanded: boolean;
  getStepComplete: (step: ITaskStepEntry) => number;
  onMoveStep?: (stepId: string, direction: "first" | "up" | "down" | "last") => void;
  onToggleWorkspace: (step: ITaskStepEntry) => void;
  renderWorkspace: (step: ITaskStepEntry) => React.ReactNode;
}

const SortIcon = ({ active, dir }: { active: boolean; dir: StepTaskSortDir }): JSX.Element => (
  <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
    {active ? (dir === "asc" ? "\u25B2" : "\u25BC") : "\u25B2"}
  </span>
);

const clampPercentValue = (value: number): number =>
  Math.max(0, Math.min(100, Math.floor(Number.isFinite(value) ? value : 0)));

const toMs = (value?: string): number => {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
};

// Display YYYY-MM-DD as MM/DD/YYYY without Date object (avoids UTC timezone shift)
const formatDateDisplay = (value?: string): string => {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  const [y, m, d] = parts;
  return `${m}/${d}/${y}`;
};

const TaskStepsTable: React.FC<ITaskStepsTableProps> = ({
  steps,
  selectedTaskStepId,
  isTaskStepWorkspaceExpanded,
  getStepComplete,
  onMoveStep,
  onToggleWorkspace,
  renderWorkspace,
}) => {
  const [sortCol, setSortCol] = useState<StepTaskSortCol>("wbs");
  const [sortDir, setSortDir] = useState<StepTaskSortDir>("asc");
  const [actionsExpanded, setActionsExpanded] = useState(false);

  const handleSort = (col: StepTaskSortCol): void => {
    if (sortCol === col) {
      setSortDir(dir => dir === "asc" ? "desc" : "asc");
      return;
    }

    setSortCol(col);
    setSortDir("asc");
  };

  const sortedSteps = steps.slice().sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case "wbs":
        cmp = (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || compareWbs(a.wbs || "", b.wbs || "");
        break;
      case "task":
        cmp = (a.title || "").localeCompare(b.title || "");
        break;
      case "complete":
        cmp = clampPercentValue(getStepComplete(a)) - clampPercentValue(getStepComplete(b));
        break;
      case "start":
        cmp = toMs(a.start) - toMs(b.start);
        break;
      case "finish":
        cmp = toMs(a.finish) - toMs(b.finish);
        break;
    }

    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className={styles.taskStepsPreview}>
      <div className={dashboardStyles.tableViewport}>
        <table className={`${dashboardStyles.ed2Table} ${dashboardStyles.ed2TableStepTasks} ${actionsExpanded ? dashboardStyles.ed2TableActionsExpanded : ""}`}>
          <thead>
            <tr>
              <th className={`${dashboardStyles.colWbs} ${dashboardStyles.colSortable}`} onClick={() => handleSort("wbs")} title="Sort by WBS">
                WBS<SortIcon active={sortCol === "wbs"} dir={sortDir} />
              </th>
              <th className={dashboardStyles.colText}>
                <div className={dashboardStyles.colTextHeader}>
                  <span className={dashboardStyles.colSortable} onClick={() => handleSort("task")} title="Sort by Task">
                    Task<SortIcon active={sortCol === "task"} dir={sortDir} />
                  </span>
                </div>
              </th>
              <th className={`${dashboardStyles.colDate} ${dashboardStyles.colSortable}`} onClick={() => handleSort("complete")} title="Sort by Completed">
                Completed<SortIcon active={sortCol === "complete"} dir={sortDir} />
              </th>
              <th className={`${dashboardStyles.colDateNarrow} ${dashboardStyles.colSortable}`} onClick={() => handleSort("start")} title="Sort by Start">
                Start<SortIcon active={sortCol === "start"} dir={sortDir} />
              </th>
              <th className={`${dashboardStyles.colDateNarrow} ${dashboardStyles.colSortable}`} onClick={() => handleSort("finish")} title="Sort by Finish">
                Finish<SortIcon active={sortCol === "finish"} dir={sortDir} />
              </th>
              <th className={`${dashboardStyles.colActions} ${dashboardStyles.actionsFixed}`}>
                <div className={dashboardStyles.actionsHeader}>
                  <button
                    type="button"
                    className={`${dashboardStyles.actionsToggle} ${actionsExpanded ? dashboardStyles.actionsToggleOn : ""}`}
                    onClick={(e) => { e.stopPropagation(); setActionsExpanded(prev => !prev); }}
                    aria-pressed={actionsExpanded}
                    aria-label={actionsExpanded ? "Hide action toolbar" : "Show action toolbar"}
                    title={actionsExpanded ? "Hide action toolbar" : "Show action toolbar"}
                  >
                    <span />
                  </button>
                  <span>Actions</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedSteps.map(step => {
              const isSelectedStep = step.id === selectedTaskStepId;
              const stepComplete = clampPercentValue(getStepComplete(step));
              const visualIndex = steps.findIndex(entry => entry.id === step.id);
              const isFirstStep = visualIndex <= 0;
              const isLastStep = visualIndex < 0 || visualIndex >= steps.length - 1;

              return (
                <React.Fragment key={step.id}>
                  <tr className={[dashboardStyles.taskRowSubprocess, isSelectedStep ? dashboardStyles.taskRowActive : ""].filter(Boolean).join(" ")}>
                    <td className={dashboardStyles.colWbs}>
                      <span className={dashboardStyles.wbsCell}>{step.wbs}</span>
                    </td>
                    <td className={dashboardStyles.colText}>
                      <button
                        type="button"
                        className={styles.taskStepNameButton}
                        onClick={() => onToggleWorkspace(step)}
                        title={isSelectedStep && isTaskStepWorkspaceExpanded ? "Collapse step task" : "Expand step task"}
                      >
                        {`${step.title} (${step.units || 0} units)`}
                      </button>
                    </td>
                    <td className={dashboardStyles.colDate}>{stepComplete}%</td>
                    <td className={dashboardStyles.colDateNarrow}>{formatDateDisplay(step.start)}</td>
                    <td className={dashboardStyles.colDateNarrow}>{formatDateDisplay(step.finish)}</td>
                    <td className={`${dashboardStyles.colActions} ${dashboardStyles.actionsFixed}`}>
                      {actionsExpanded ? (
                        <div className={dashboardStyles.actionsToolbar}>
                          {onMoveStep && (["first", "up", "down", "last"] as const).map(direction => {
                            const disabled =
                              (direction === "first" || direction === "up") ? isFirstStep : isLastStep;
                            return (
                              <button
                                key={direction}
                                type="button"
                                className={dashboardStyles.toolbarIconButton}
                                disabled={disabled}
                                onClick={(e) => { e.stopPropagation(); onMoveStep(step.id, direction); }}
                                title={`Move ${direction}`}
                                aria-label={`Move ${direction}`}
                              >
                                {direction === "first" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h8M8 5l-4 4h3v4h2V9h3L8 5z" /></svg>}
                                {direction === "up" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4l-4 5h3v4h2V9h3L8 4z" /></svg>}
                                {direction === "down" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12l4-5H9V3H7v4H4l4 5z" /></svg>}
                                {direction === "last" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 13h8M8 11l4-4H9V3H7v4H4l4 4z" /></svg>}
                              </button>
                            );
                          })}
                          <span className={dashboardStyles.toolbarSeparator} />
                          <button
                            type="button"
                            className={dashboardStyles.toolbarIconButton}
                            onClick={(e) => { e.stopPropagation(); onToggleWorkspace(step); }}
                            title={isSelectedStep && isTaskStepWorkspaceExpanded ? "Collapse step workspace" : "Expand step workspace"}
                            aria-label={isSelectedStep && isTaskStepWorkspaceExpanded ? "Collapse step workspace" : "Expand step workspace"}
                          >
                            {isSelectedStep && isTaskStepWorkspaceExpanded ? (
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 10l5-5 5 5" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6l5 5 5-5" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className={dashboardStyles.actionButtonsRow}>
                          <button
                            type="button"
                            className={dashboardStyles.iconButton}
                            onClick={(e) => { e.stopPropagation(); onToggleWorkspace(step); }}
                            title={isSelectedStep && isTaskStepWorkspaceExpanded ? "Collapse step workspace" : "Expand step workspace"}
                            aria-label={isSelectedStep && isTaskStepWorkspaceExpanded ? "Collapse step workspace" : "Expand step workspace"}
                          >
                            {isSelectedStep && isTaskStepWorkspaceExpanded ? (
                              <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 10l5-5 5 5" />
                              </svg>
                            ) : (
                              <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6l5 5 5-5" />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {isSelectedStep && isTaskStepWorkspaceExpanded && (
                    <tr className={styles.taskStepDetailRow}>
                      <td colSpan={6} className={styles.taskStepDetailCell}>
                        {renderWorkspace(step)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {sortedSteps.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.taskStepsEmptyState}>
                  No step tasks available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaskStepsTable;
