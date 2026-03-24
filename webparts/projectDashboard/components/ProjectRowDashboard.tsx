import * as React from "react";
import { useState, useMemo, useEffect } from "react";
import { SPFI } from "@pnp/sp";
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from "@microsoft/sp-http";

import { ITaskListItem } from "../../../models";
import { IProjectCatalogItem } from "../../../models/IProjectService";
import { ProjectService } from "../services/ProjectService";
import { buildRepoRelativeUrl } from "../services/UploadService";
import { useProjectState } from "../hooks/useProjectState";
import { GetBucketStatus } from "../utils/GetGateStatus";
import { IProjectDashboardWebPartProps } from "../../../models";

import GateProgressBar from "./GateProgressBar";
import ListTasks from "./ListTasks";
import TaskCard from "./TaskCard";
import ProjectActionsBar from "./ProjectActionsBar";

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

export interface ProjectRowDashboardProps {
  project: IProjectCatalogItem;
  context: AnyContext;
  sp: SPFI;
  /** Called once gate data is ready so the parent can compute aggregate counts */
  onStatusReady?: (projectId: string, statusKey: "ontime" | "delayed" | "closed") => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectRowDashboard: React.FC<ProjectRowDashboardProps> = ({
  project, context, sp, onStatusReady,
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
    evidenceFolderServerRelative,
    projectName:    project.Title,
    sourceName:     listName,
    isPlanner:      false,
    repositoryName: repoName,
    showLog:        false,
    projectURL,
    onPatchProperties: noop,
  });

  const [activeGate,        setActiveGate]        = useState<string | null>(null);
  const [showCard,          setShowCard]          = useState(false);
  const [selectedTask,      setSelectedTask]      = useState<ITaskListItem | null>(null);
  const [statusReported,    setStatusReported]    = useState(false);
  const [showProjectActions, setShowProjectActions] = useState(false);

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
    let key: "ontime" | "delayed" | "closed" = "ontime";
    if (project.Status?.toLowerCase() === "closed") {
      key = "closed";
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
    <div style={{
      border: "0.5px solid #D3D1C7",
      borderRadius: 8,
      marginBottom: 6,
      overflow: "hidden",
      background: "white",
    }}>
      {/* ── Row header: project info (left) + gate bar (right) ───────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 12px",
        gap: 12,
        background: "#faf9f8",
        borderBottom: activeGate !== null ? "0.5px solid #E8E6E0" : "none",
      }}>
        <div style={{ width: 160, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#2C2C2A" }}>
            {project.ProjectNumber}
          </div>
          <div style={{
            fontSize: 11, fontWeight: 500, color: "#323130",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {project.Title}
          </div>
          <div style={{ fontSize: 10, color: "#888780" }}>
            {project.Customer}
          </div>
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
          <span style={{ fontSize: 11, color: "#B4B2A9", fontStyle: "italic" }}>
            {tasks.length === 0 ? "Loading..." : "No gates defined"}
          </span>
        )}
      </div>

      {/* ── Project actions — visible when gear is active ────────────── */}
      {showProjectActions && (
        <div style={{ padding: "4px 12px 8px 12px", borderBottom: "0.5px solid #E8E6E0" }}>
          <ProjectActionsBar
            project={projectListItem}
            projectService={projectService}
            evidenceFolderServerRelative={evidenceFolderServerRelative}
            repositoryName={repoName}
            onReset={onReset}
          />
        </div>
      )}

      {/* ── Task section — visible when a gate is active ─────────────── */}
      {activeGate !== null && tasks.length > 0 && (
        <div style={{ padding: "8px 12px" }}>
          {showCard && selectedTask && (
            <TaskCard
              task={selectedTask}
              isPlanner={false}
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
            onSave={(taskId, payloadJson) => {
              onUpdateTask?.(taskId, "quick-complete", payloadJson);
            }}
            onSelectItem={(item, group, mode) => {
              if (!item?.Task) return;
              switch (mode) {
                case "list-edit":
                  setSelectedTask(item); setShowCard(true);
                  onSelectItem(item.Task, "task");
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

          <button
            type="button"
            onClick={() => onReset()}
            style={{
              marginTop: 6, padding: "2px 10px", fontSize: 11,
              border: "1px solid #D3D1C7", borderRadius: 12,
              background: "white", cursor: "pointer", color: "#888780",
            }}
          >
            Reload
          </button>
        </div>
      )}
    </div>
  );
};

export default ProjectRowDashboard;
