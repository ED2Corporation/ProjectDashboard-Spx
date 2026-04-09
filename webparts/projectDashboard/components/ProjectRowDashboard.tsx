import * as React from "react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/presets/all";
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from "@microsoft/sp-http";
import { getStorageEndpoint, getProjectWebUrl, parseWorkOrder, buildListName, buildRepoName } from "../utils/StorageVersionResolver";

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
  onStatusReady?: (projectId: string, statusKey: "ontime" | "stalled" | "delayed" | "archived") => void;
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
  // ── Storage version resolution ─────────────────────────────────────────────
  const storageVersion = project.resolvedStorageVersion ?? 'v1';
  const fallbackWebUrl = context.pageContext.web.absoluteUrl;
  const fallbackRelPath = context.pageContext.web.serverRelativeUrl;

  // SPFI bound to the correct web (v2 → WO-Plans, v1 → current site)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projectSp = useMemo(() => {
    const targetWebUrl = getProjectWebUrl(storageVersion, fallbackWebUrl);
    return storageVersion === 'v2'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? spfi(targetWebUrl).using(SPFx(context as any))
      : sp;
  }, [storageVersion, fallbackWebUrl, sp]);

  // Storage endpoint (siteRelPath, evidenceLibrary, evidenceBasePath)
  const storageEndpoint = useMemo(
    () => getStorageEndpoint(storageVersion, fallbackRelPath),
    [storageVersion, fallbackRelPath]
  );

  // ── List / repo names — same convention for v1 and v2 ────────────────────
  const _prefix  = project.Title ?? project.ProjectNumber ?? '';
  const listName = buildListName(_prefix);
  const repoName = buildRepoName(_prefix);

  // For v1 use the current web URL; for v2 use the resolved web URL
  const siteUrl = getProjectWebUrl(storageVersion, fallbackWebUrl);
  const siteRel = storageEndpoint.siteRelPath;

  const evidenceFolderServerRelative = buildRepoRelativeUrl(siteRel, repoName);
  const projectListUrl = `${siteUrl.replace(/\/+$/, "")}/Lists/${encodeURIComponent(listName)}/AllItems.aspx`;
  const repoBrowseUrl = useMemo(
    () => buildRepoBrowseUrl(siteUrl, evidenceFolderServerRelative),
    [siteUrl, evidenceFolderServerRelative]
  );

  // projectSp → task lists (may target WO-Plans for v2)
  // sp        → catalog (ED2-Projects always lives in ED2-Team)
  const projectService = useMemo(
    () => new ProjectService(projectSp, listName, sp),
    [projectSp, listName, sp]
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
    sp:             projectSp,
    projectService,
    projectName:    project.Title,
    sourceName:     listName,
    isPlanner:      false,
    showLog:        false,
    projectURL:     projectListUrl,
    onPatchProperties: noop,
    storageEndpoint,
  });

  // Wrap onSaveLogField so the local selectedTask also reflects log changes immediately
  const onSaveLogField = useCallback(async (
    taskId: string,
    field: 'Notes' | 'Evidence' | 'Approvals',
    entries: unknown[]
  ): Promise<void> => {
    await _onSaveLogField(taskId, field, entries);
    setSelectedTask(prev => prev?.Id === taskId ? { ...prev, [field]: entries } : prev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_onSaveLogField]);

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
    Link:           { Url: projectListUrl, Description: project.Title },
  }), [project, listName, repoName, projectListUrl]);

  // Report project status to parent once gates are loaded
  useEffect(() => {
    if (!onStatusReady || statusReported || gates.length === 0) return;
    let key: "ontime" | "stalled" | "delayed" | "archived" = "ontime";
    const s = project.Status?.toLowerCase();
    if (s === "archived" || s === "closed") {
      key = "archived";
    } else {
      const overall = GetBucketStatus(gates);
      if (overall === "red")    key = "delayed";
      else if (overall === "yellow") key = "stalled";
      else key = "ontime";
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
          <div className={styles.projectTitle}>
            {storageVersion === 'v1' && (
              <span className={styles.storageAlert} title="Legacy storage v1">⚠</span>
            )}
            {localProject.PartNumber}
            {!!localProject.Units && (
              <span className={styles.unitsTag}> ({localProject.Units} units)</span>
            )}
          </div>
          <div className={styles.projectSubtitle}>
            {(() => {
              const wo = parseWorkOrder(localProject);
              return wo ? <><span className={styles.woTag}>WO# {wo}</span>{' '}</> : null;
            })()}
            {localProject.ProjectNumber}
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
            onSelectItem={(item, _group, mode) => {
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
