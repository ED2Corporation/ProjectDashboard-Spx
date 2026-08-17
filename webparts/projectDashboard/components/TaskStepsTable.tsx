import * as React from "react";
import { useState } from "react";
import { IEvidenceEntry } from "../../../models/ITaskLogFields";
import { compareWbs } from "../utils/ParseWBS";
import { ITaskStepEntry } from "../utils/TaskDescriptionBlob";
import EvidenceUploadButton from "./EvidenceUploadButton";
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
  onAddStepAfter?: (stepId: string) => void;
  onRemoveStep?: (stepId: string) => void;
  onCompleteStepAction?: (step: ITaskStepEntry) => void;
  onSaveStepEvidenceEntries?: (stepId: string, entries: IEvidenceEntry[]) => Promise<void>;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
  currentUserDisplayName?: string;
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
  onAddStepAfter,
  onRemoveStep,
  onCompleteStepAction,
  onSaveStepEvidenceEntries,
  onUploadEvidenceFile,
  currentUserDisplayName,
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
              const isComplete = stepComplete >= 100;
              const isCompleteLocked = (step.subprocess?.subTasks.length ?? 0) > 0 && !isComplete;
              const completeActionTitle = isComplete
                ? "Open quick update"
                : isCompleteLocked
                  ? "Complete is calculated from this Batch subprocess."
                  : "Mark complete";

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
                        title={isSelectedStep && isTaskStepWorkspaceExpanded ? "Collapse batch" : "Expand batch"}
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
                          <button
                            type="button"
                            className={dashboardStyles.toolbarIconButton}
                            onClick={(e) => { e.stopPropagation(); onAddStepAfter?.(step.id); }}
                            title="Add Batch below"
                            aria-label="Add Batch below"
                            disabled={!onAddStepAfter}
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
                          </button>
                          <button
                            type="button"
                            className={dashboardStyles.toolbarIconButton}
                            onClick={(e) => { e.stopPropagation(); onRemoveStep?.(step.id); }}
                            title="Remove Batch"
                            aria-label="Remove Batch"
                            disabled={!onRemoveStep}
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5h6M6 5v8h4V5M4 5h8M7 3h2" /></svg>
                          </button>
                          <span className={dashboardStyles.toolbarSeparator} />
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
                          {onUploadEvidenceFile && onSaveStepEvidenceEntries ? (
                            <EvidenceUploadButton
                              evidence={step.evidence ?? []}
                              taskTitle={step.title || "Batch"}
                              currentUser={currentUserDisplayName ?? ""}
                              onUploadFile={onUploadEvidenceFile}
                              onSave={(entries) => onSaveStepEvidenceEntries(step.id, entries)}
                              isEvidenceOfCompletion={true}
                              label={
                                <svg viewBox="0 0 16 16" aria-hidden="true">
                                  <path d="M8 10V3" />
                                  <path d="M5 6l3-3 3 3" />
                                  <path d="M3 13h10" />
                                </svg>
                              }
                              className={`${dashboardStyles.toolbarIconButton} ${dashboardStyles.actionEvidenceUploadTrigger}`}
                            />
                          ) : (
                            <button
                              type="button"
                              className={`${dashboardStyles.toolbarIconButton} ${dashboardStyles.actionEvidenceUploadTrigger}`}
                              title="Upload Evidence of Completion"
                              aria-label="Upload Evidence of Completion"
                              disabled
                            >
                              <svg viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M8 10V3" />
                                <path d="M5 6l3-3 3 3" />
                                <path d="M3 13h10" />
                              </svg>
                            </button>
                          )}
                          <button
                            type="button"
                            className={[
                              dashboardStyles.toolbarIconButton,
                              dashboardStyles.actionCompleteTrigger,
                              isComplete ? dashboardStyles.actionCompleteTriggerDone : "",
                            ].filter(Boolean).join(" ")}
                            onClick={(e) => { e.stopPropagation(); onCompleteStepAction?.(step); }}
                            title={completeActionTitle}
                            aria-label={completeActionTitle}
                            disabled={!onCompleteStepAction || isCompleteLocked}
                          >
                            {isComplete ? (
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11.5 2.5l2 2-7.5 7.5H4v-2l7.5-7.5z" />
                                <path d="M3 14h10" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className={dashboardStyles.actionButtonsRow}>
                          {onUploadEvidenceFile && onSaveStepEvidenceEntries ? (
                            <EvidenceUploadButton
                              evidence={step.evidence ?? []}
                              taskTitle={step.title || "Batch"}
                              currentUser={currentUserDisplayName ?? ""}
                              onUploadFile={onUploadEvidenceFile}
                              onSave={(entries) => onSaveStepEvidenceEntries(step.id, entries)}
                              isEvidenceOfCompletion={true}
                              label={
                                <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M8 10V3" />
                                  <path d="M5 6l3-3 3 3" />
                                  <path d="M3 13h10" />
                                </svg>
                              }
                              className={`${dashboardStyles.iconButton} ${dashboardStyles.actionEvidenceUploadTrigger}`}
                            />
                          ) : (
                            <button
                              type="button"
                              className={`${dashboardStyles.iconButton} ${dashboardStyles.actionEvidenceUploadTrigger}`}
                              title="Upload Evidence of Completion"
                              aria-label="Upload Evidence of Completion"
                              disabled
                            >
                              <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M8 10V3" />
                                <path d="M5 6l3-3 3 3" />
                                <path d="M3 13h10" />
                              </svg>
                            </button>
                          )}
                          <button
                            type="button"
                            className={[
                              dashboardStyles.iconButton,
                              dashboardStyles.actionAddTrigger,
                              dashboardStyles.actionCompleteTrigger,
                              isComplete ? dashboardStyles.actionCompleteTriggerDone : "",
                            ].filter(Boolean).join(" ")}
                            onClick={(e) => { e.stopPropagation(); onCompleteStepAction?.(step); }}
                            title={completeActionTitle}
                            aria-label={completeActionTitle}
                            disabled={!onCompleteStepAction || isCompleteLocked}
                          >
                            {isComplete ? (
                              <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11.5 2.5l2 2-7.5 7.5H4v-2l7.5-7.5z" />
                                <path d="M3 14h10" />
                              </svg>
                            ) : (
                              <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
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
                  No batches available.
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
