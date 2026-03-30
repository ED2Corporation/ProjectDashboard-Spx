import * as React from "react";
import { useState, useMemo, useEffect } from "react";
import { SPFI } from "@pnp/sp";
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from "@microsoft/sp-http";

import { ITaskListItem } from "../../../models";
import { IProjectCatalogItem } from "../../../models/IProjectService";
import { ProjectService } from "../services/ProjectService";
import { useProjectState } from "../hooks/useProjectState";
import { buildRepoRelativeUrl } from "../services/UploadService";
import { GetBucketStatus } from "../utils/GetGateStatus";
import { IProjectDashboardWebPartProps } from "../../../models";

import GateProgressBar from "./GateProgressBar";
import ListTasks from "./ListTasks";
import TaskCard from "./TaskCard";
import ProjectActionsBar from "./ProjectActionsBar";
import ProjectCatalogEditor from "./ProjectCatalogEditor";
import styles from "./ProjectRowDashboard.module.scss";

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

export interface ProjectRowDashboardProps {
  project: IProjectCatalogItem;
  context: AnyContext;
  sp: SPFI;
  /** Called once gate data is ready so the parent can compute aggregate counts */
  onStatusReady?: (projectId: string, statusKey: "ontime" | "delayed" | "archived") => void;
  /** Called after a catalog item is saved — use to reload the parent catalog list */
  onCatalogItemSaved?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectRowDashboard: React.FC<ProjectRowDashboardProps> = ({
  project, context, sp, onStatusReady, onCatalogItemSaved,
}) => {
  const listName   = `${project.ProjectId}-List`;
  const repoName   = `${project.ProjectId}-Evidence`;
  const siteUrl    = context.pageContext.web.absoluteUrl;
  const siteRel    = context.pageContext.web.serverRelativeUrl;
  const projectURL = `${siteUrl}/Lists/${listName}`;
  const evidenceFolderServerRelative = buildRepoRelativeUrl(siteRel, repoName);

  const projectService = useMemo(
    () => new ProjectService(sp, listName),
    [sp, listName]
  );

  // no-op: properties are fixed per catalog row
  const noop = (_patch: Partial<IProjectDashboardWebPartProps>): void => { return; };

  const {
    tasks, gates, filteredTasks,
    onReset, onGateFilterChange, onSelectItem,
    onNewTask, onDeleteTask, onUpdateTask, onUploadFile,
  } = useProjectState({
    context,
    sp,
    projectService,
    projectName:    project.Title,
    sourceName:     listName,
    isPlanner:      false,
    showLog:        false,
    projectURL,
    onPatchProperties: noop,
  });

  const [activeGate,         setActiveGate]         = useState<string | null>(null);
  const [showCard,           setShowCard]           = useState(false);
  const [selectedTask,       setSelectedTask]       = useState<ITaskListItem | null>(null);
  const [statusReported,     setStatusReported]     = useState(false);
  const [showProjectActions, setShowProjectActions] = useState(false);
  // Local copy of catalog fields — updated optimistically after a successful save
  const [localProject,       setLocalProject]       = useState(project);

  // Minimal IProjectListItem shape required by ProjectActionsBar
  const projectListItem = useMemo(() => ({
    Id:             project.ProjectId ?? project.Title,
    Title:          project.Title,
    ListName:       listName,
    RepositoryName: repoName,
    isPlanner:      false,
    Link:           { Url: projectURL, Description: project.Title },
  }), [project, listName, repoName, projectURL]);

  // Report project status to parent once gates are loaded
  useEffect(() => {
    if (!onStatusReady || statusReported || gates.length === 0) return;
    let key: "ontime" | "delayed" | "archived" = "ontime";
    const s = project.Status?.toLowerCase();
    if (s === "archived" || s === "closed") { // backward compat
      key = "archived";
    } else {
      const overall = GetBucketStatus(gates);
      key = (overall === "red" || overall === "yellow") ? "delayed" : "ontime";
    }
    onStatusReady(project.ProjectId ?? project.Title, key);
    setStatusReported(true);
  }, [gates, project, onStatusReady, statusReported]);

  const handleGateClick = (gate: string): void => {
    const next = activeGate === gate ? null : gate;
    setActiveGate(next);
    setShowCard(false);
    if (next === null) {
      onGateFilterChange?.("all");
      onSelectItem("all", "gate");
    } else {
      onSelectItem(next, "gate");
      onGateFilterChange?.(next);
    }
  };

  const handleOverallClick = (): void => {
    const next = activeGate === "all" ? null : "all";
    setActiveGate(next);
    setShowCard(false);
    onGateFilterChange?.("all");
    onSelectItem("all", "gate");
  };

  const showAllTasks = activeGate === "all";
  const visibleTasks = showAllTasks ? tasks : filteredTasks;
  const tasksHeading = showAllTasks
    ? "All Tasks"
    : filteredTasks[0]?.Gate || activeGate || "";

  return (
    <div className={styles.card}>

      {/* ── Row header: project info (left) + gate bar (right) ───────── */}
      <div className={`${styles.header} ${activeGate !== null ? styles.headerActive : ""}`}>
        <div className={styles.projectInfo} onClick={handleOverallClick} style={{ cursor: "pointer" }}>
          <div className={styles.projectNumber}>{localProject.ProjectNumber}</div>
          <div className={styles.projectTitle}>
            {localProject.ProjectNumber && localProject.Title?.startsWith(`${localProject.ProjectNumber}-`)
              ? localProject.Title.slice(localProject.ProjectNumber.length + 1)
              : localProject.Title}
          </div>
          <div className={styles.projectCustomer}>{localProject.Customer}</div>
        </div>

        {gates.length > 0 ? (
          <GateProgressBar
            gates={gates}
            tasks={tasks}
            activeGate={activeGate}
            onGateClick={handleGateClick}
            onOverallClick={handleOverallClick}
            onSettingsClick={() => setShowProjectActions(prev => !prev)}
            settingsActive={showProjectActions}
          />
        ) : (
          <span className={styles.noGates}>
            {tasks.length === 0 ? "Loading..." : "No gates defined"}
          </span>
        )}
      </div>

      {/* ── Project actions + settings editor — visible when gear is active ── */}
      {showProjectActions && (
        <div className={styles.actionsSection}>
          <ProjectActionsBar
            project={projectListItem}
            projectService={projectService}
            evidenceFolderServerRelative={evidenceFolderServerRelative}
            repositoryName={repoName}
            onReset={onReset}
          />
          <ProjectCatalogEditor
            project={localProject}
            projectService={projectService}
            onSaved={updated => {
              setLocalProject(updated);
              onCatalogItemSaved?.();
            }}
            onCancel={() => setShowProjectActions(false)}
          />
        </div>
      )}

      {/* ── Task section — visible when a gate is active ──────────────── */}
      {activeGate !== null && tasks.length > 0 && (
        <div className={styles.taskSection}>
          {showCard && selectedTask && (
            <TaskCard
              task={selectedTask}
              isPlanner={false}
              currentUserEmail={context.pageContext.user.email}
              onClose={() => setShowCard(false)}
              onNew={(task) => onNewTask?.(task.Gate)}
              onDelete={(taskId) => { onDeleteTask?.(taskId); setShowCard(false); }}
              onSave={(taskId, payloadJson) => {
                onUpdateTask?.(taskId, "full-update", payloadJson);
                setShowCard(true);
              }}
              onUploadEvidenceFile={async (file, taskTitle) => {
                if (!onUploadFile) throw new Error("onUploadFile not provided");
                return onUploadFile(file, taskTitle);
              }}
            />
          )}

          <ListTasks
            tasks={visibleTasks}
            isPlanner={false}
            heading={tasksHeading}
            showDetails={true}
            selectedTaskId={showCard ? selectedTask?.Id : undefined}
            onSave={(taskId, payloadJson) => {
              onUpdateTask?.(taskId, "quick-complete", payloadJson);
            }}
            onSelectItem={(item, group, mode) => {
              if (!item?.Task) return;
              switch (mode) {
                case "list-edit":
                  if (showCard && selectedTask?.Id === item.Id) {
                    setShowCard(false);
                  } else {
                    setSelectedTask(item);
                    setShowCard(true);
                    onSelectItem(item.Task, "task");
                  }
                  break;
                case "list-create":
                  onNewTask?.(item.Gate);
                  break;
                case "list-delete":
                  onDeleteTask?.(item.Id);
                  break;
                default:
                  setSelectedTask(item); setShowCard(true);
                  onSelectItem(item.Task, "task");
                  break;
              }
            }}
            onUploadEvidenceFile={async (file, taskTitle) => {
              if (!onUploadFile) throw new Error("onUploadFile not provided");
              return onUploadFile(file, taskTitle);
            }}
          />

          <button type="button" onClick={() => onReset()} className={styles.reloadBtn}>
            Reload
          </button>
        </div>
      )}
    </div>
  );
};

export default ProjectRowDashboard;
