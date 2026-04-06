import * as React from "react";
import { useState, useMemo, useEffect, useCallback } from "react";
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

const toAbsoluteSharePointUrl = (baseUrl: string, path: string): string =>
  new URL(path, baseUrl).toString();

const buildRepoBrowseUrl = (baseUrl: string, folderServerRelative: string): string => {
  const normalized = folderServerRelative.replace(/\/+$/, "");
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  const sharedDocsToken = "/shared documents";
  const sharedDocsIndex = lower.indexOf(sharedDocsToken);

  if (sharedDocsIndex >= 0) {
    const libraryRoot = normalized.slice(0, sharedDocsIndex + sharedDocsToken.length);
    const libraryViewUrl = toAbsoluteSharePointUrl(baseUrl, `${libraryRoot}/Forms/AllItems.aspx`);
    return `${libraryViewUrl}?id=${encodeURIComponent(normalized)}`;
  }

  return toAbsoluteSharePointUrl(baseUrl, normalized);
};

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectRowDashboard: React.FC<ProjectRowDashboardProps> = ({
  project, context, sp, onStatusReady, onCatalogItemSaved,
}) => {
  const listName   = `${project.ProjectId}-List`;
  const repoName   = `${project.ProjectId}-Evidence`;
  const siteUrl    = context.pageContext.web.absoluteUrl;
  const siteRel    = context.pageContext.web.serverRelativeUrl;
  const evidenceFolderServerRelative = buildRepoRelativeUrl(siteRel, repoName);
  const [projectListUrl, setProjectListUrl] = useState<string>(
    `${siteUrl.replace(/\/+$/, "")}/Lists/${encodeURIComponent(listName)}/AllItems.aspx`
  );
  const repoBrowseUrl = useMemo(
    () => buildRepoBrowseUrl(siteUrl, evidenceFolderServerRelative),
    [siteUrl, evidenceFolderServerRelative]
  );

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
    onSaveLogField: _onSaveLogField, onSendEmail, onSearchUsers,
  } = useProjectState({
    context,
    sp,
    projectService,
    projectName:    project.Title,
    sourceName:     listName,
    isPlanner:      false,
    showLog:        false,
    projectURL:     projectListUrl,
    onPatchProperties: noop,
  });

  // Wrap onSaveLogField so the local selectedTask also reflects log changes immediately
  const onSaveLogField = useCallback(async (
    taskId: string,
    field: 'Notes' | 'Evidence' | 'Approvals',
    entries: unknown[]
  ): Promise<void> => {
    console.log("[ProjectRowDashboard] onSaveLogField called", {
      taskId,
      field,
      entriesCount: entries.length,
      entries,
    });
    await _onSaveLogField(taskId, field, entries);
    console.log("[ProjectRowDashboard] useProjectState onSaveLogField resolved", {
      taskId,
      field,
      entriesCount: entries.length,
    });
    setSelectedTask(prev => prev?.Id === taskId ? { ...prev, [field]: entries } : prev);
    console.log("[ProjectRowDashboard] selectedTask patched locally", {
      taskId,
      field,
      entriesCount: entries.length,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_onSaveLogField]);

  const [activeGate,         setActiveGate]         = useState<string | null>(null);
  const [showCard,           setShowCard]           = useState(false);
  const [selectedTask,       setSelectedTask]       = useState<ITaskListItem | null>(null);
  const [statusReported,     setStatusReported]     = useState(false);
  const [showProjectActions, setShowProjectActions] = useState(false);
  // Local copy of catalog fields — updated optimistically after a successful save
  const [localProject,       setLocalProject]       = useState(project);

  useEffect(() => {
    let cancelled = false;

    void sp.web.lists.getByTitle(listName).select("DefaultViewUrl")()
      .then((list: { DefaultViewUrl?: string }) => {
        if (!cancelled && list?.DefaultViewUrl) {
          setProjectListUrl(toAbsoluteSharePointUrl(siteUrl, list.DefaultViewUrl));
        }
      })
      .catch((error: unknown) => {
        console.error("[ProjectRowDashboard] Failed to resolve SharePoint list URL", error);
      });

    return () => {
      cancelled = true;
    };
  }, [sp, listName, siteUrl]);

  // Minimal IProjectListItem shape required by ProjectActionsBar
  const projectListItem = useMemo(() => ({
    Id:             project.ProjectId ?? project.Title,
    Title:          project.Title,
    ListName:       listName,
    RepositoryName: repoName,
    isPlanner:      false,
    Link:           { Url: projectListUrl, Description: project.Title },
  }), [project, listName, repoName, projectListUrl]);

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

  const handleTaskCompleted = (): void => {
    if (!selectedTask) return;
    const payload = JSON.stringify({ ...selectedTask, Complete: 100, ActualFinish: new Date() });
    onUpdateTask?.(selectedTask.Id, 'quick-complete', payload);
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
  const expandedTaskCard = showCard && selectedTask ? (
    <TaskCard
      task={selectedTask}
      isPlanner={false}
      currentUserEmail={context.pageContext.user.email}
      currentUserDisplayName={context.pageContext.user.displayName}
      projectInfo={{
        projectNumber: localProject.ProjectNumber ?? '',
        partNumber: localProject.ProjectNumber && localProject.Title?.startsWith(`${localProject.ProjectNumber}-`)
          ? localProject.Title.slice(localProject.ProjectNumber.length + 1)
          : (localProject.Title ?? ''),
      }}
      onSaveLogField={onSaveLogField}
      onSendEmail={onSendEmail}
      onSearchUsers={onSearchUsers}
      onTaskCompleted={handleTaskCompleted}
      onClose={() => setShowCard(false)}
      onNew={(task) => onNewTask?.(task.Gate)}
      onDelete={(taskId) => { onDeleteTask?.(taskId); setShowCard(false); }}
      onSave={(taskId, payloadJson) => {
        if (payloadJson) {
          try {
            const parsed = JSON.parse(payloadJson) as Partial<ITaskListItem>;
            setSelectedTask(prev => prev?.Id === taskId ? {
              ...prev,
              ...parsed,
              Start: parsed.Start ? new Date(parsed.Start) : prev.Start,
              Finish: parsed.Finish ? new Date(parsed.Finish) : prev.Finish,
              ActualFinish: parsed.ActualFinish ? new Date(parsed.ActualFinish) : prev.ActualFinish,
            } : prev);
          } catch (error) {
            console.error("[ProjectRowDashboard] Failed to parse TaskCard save payload", error);
          }
        }
        onUpdateTask?.(taskId, "full-update", payloadJson);
        setShowCard(true);
      }}
      onUploadEvidenceFile={async (file, taskTitle) => {
        if (!onUploadFile) throw new Error("onUploadFile not provided");
        return onUploadFile(file, taskTitle);
      }}
    />
  ) : undefined;

  return (
    <div className={`${styles.card} ${activeGate !== null ? styles.cardActive : ""}`}>

      {/* ── Row header: project info (left) + gate bar (right) ───────── */}
      <div className={`${styles.header} ${activeGate !== null ? styles.headerActive : ""}`}>
        <div className={styles.projectInfo} onClick={handleOverallClick} style={{ cursor: "pointer" }}>
          <div className={styles.projectTitle}>{localProject.PartNumber}</div>
          <div className={styles.projectSubtitle}>
            {localProject.ProjectNumber}
            {!!localProject.Units && (
              <> (<strong>{localProject.Units} units</strong>)</>
            )}
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
            {tasks.length === 0 ? "No task list found — please verify the SharePoint list exists." : "No gates defined"}
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
            repoUrl={repoBrowseUrl}
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
          <ListTasks
            tasks={visibleTasks}
            isPlanner={false}
            heading={tasksHeading}
            showDetails={true}
            onReload={() => {
              void onReset();
            }}
            selectedTaskId={showCard ? selectedTask?.Id : undefined}
            expandedContent={expandedTaskCard}
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
          />
        </div>
      )}
    </div>
  );
};

export default ProjectRowDashboard;
