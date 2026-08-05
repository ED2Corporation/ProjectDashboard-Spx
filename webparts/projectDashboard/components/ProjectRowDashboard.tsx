import * as React from "react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/presets/all";
import "@pnp/sp/lists";
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from "@microsoft/sp-http";
import { getStorageEndpoint, getProjectWebUrl, buildListName, buildRepoName, resolveStorageVersion } from "../utils/StorageVersionResolver";

import { ITaskListItem } from "../../../models";
import { IProjectCatalogItem } from "../../../models/IProjectService";
import { ProjectService } from "../services/ProjectService";
import { useProjectState } from "../hooks/useProjectState";
import { GetBucketStatus } from "../utils/GetGateStatus";
import { IProjectDashboardWebPartProps } from "../../../models";

import GateProgressBar from "./GateProgressBar";
import ListTasks from "./ListTasks";
import TaskCard from "./TaskCard";
import ProjectActionsBar from "./ProjectActionsBar";
import ProjectCatalogEditor from "./ProjectCatalogEditor";
import styles from "./ProjectRowDashboard.module.scss";
import { getTaskCompleteLockMessageFromJsonTable } from "../utils/TaskPersistencePayload";

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

export interface ProjectRowDashboardProps {
  project: IProjectCatalogItem;
  context: AnyContext;
  sp: SPFI;
  catalogSp: SPFI;
  /** Called once gate data is ready so the parent can compute aggregate counts */
  onStatusReady?: (projectId: string, statusKey: "ontime" | "stalled" | "delayed" | "archived") => void;
  /** Called after a catalog item is saved — use to reload the parent catalog list */
  onCatalogItemSaved?: () => void;
  // ── Sort-order controls (visible when ProjectCatalogEditor is open) ──
  isMoveFirst?: boolean;
  isMoveLast?: boolean;
  isReordering?: boolean;
  onMoveFirst?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveLast?: () => void;
}

const toAbsoluteSharePointUrl = (baseUrl: string, path: string): string =>
  new URL(path, baseUrl).toString();

const buildEvidenceLibraryRootServerRelative = (
  siteRel: string,
  evidenceLibrary: string,
  evidenceBasePath?: string
): string => {
  if (evidenceBasePath) return evidenceBasePath.replace(/\/+$/, "");

  if (siteRel === "/") {
    return `/ED2 Repository Internal/Engineering/ProjectDashboard/${evidenceLibrary}`.replace(/\/+$/, "");
  }

  return `${siteRel.replace(/\/+$/, "")}/Shared Documents/${evidenceLibrary}`.replace(/\/+$/, "");
};

const buildRepoBrowseUrl = (
  baseUrl: string,
  folderServerRelative: string,
  libraryRootServerRelative?: string
): string => {
  const normalized = folderServerRelative.replace(/\/+$/, "");
  if (!normalized) return "";

  const normalizedLibraryRoot = (libraryRootServerRelative || "").replace(/\/+$/, "");
  const lower = normalized.toLowerCase();
  const sharedDocsToken = "/shared documents";
  const sharedDocsIndex = lower.indexOf(sharedDocsToken);

  let documentLibraryRoot = "";
  if (sharedDocsIndex >= 0) {
    documentLibraryRoot = normalized.slice(0, sharedDocsIndex + sharedDocsToken.length);
  } else if (normalizedLibraryRoot && !normalizedLibraryRoot.toLowerCase().includes(`${sharedDocsToken}/`)) {
    documentLibraryRoot = normalizedLibraryRoot;
  } else {
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length > 0) {
      documentLibraryRoot = `/${parts[0]}`;
      if (parts[0].toLowerCase() === "sites" && parts.length > 2) {
        documentLibraryRoot = `/${parts.slice(0, 3).join("/")}`;
      }
    }
  }

  if (documentLibraryRoot) {
    const libraryViewUrl = toAbsoluteSharePointUrl(baseUrl, `${documentLibraryRoot}/Forms/AllItems.aspx`);
    return `${libraryViewUrl}?id=${encodeURIComponent(normalized)}`;
  }

  return toAbsoluteSharePointUrl(baseUrl, normalized);
};

const SettingsIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectRowDashboard: React.FC<ProjectRowDashboardProps> = ({
  project, context, sp, catalogSp, onStatusReady, onCatalogItemSaved,
  isMoveFirst, isMoveLast, isReordering, onMoveFirst, onMoveUp, onMoveDown, onMoveLast,
}) => {
  const [localProject, setLocalProject] = useState(project);
  // ── Storage version resolution ─────────────────────────────────────────────
  const storageVersion = localProject.resolvedStorageVersion ?? resolveStorageVersion(localProject);
  const fallbackWebUrl = context.pageContext.web.absoluteUrl;
  const fallbackRelPath = context.pageContext.web.serverRelativeUrl;

  // SPFI bound to the correct web (v2 → WO-Plans, v1 → current site)
  const projectSp = useMemo(() => {
    const targetWebUrl = getProjectWebUrl(storageVersion, fallbackWebUrl);
    return storageVersion === 'v2'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? spfi(targetWebUrl).using(SPFx(context as any))
      : sp;
  }, [storageVersion, fallbackWebUrl, sp, context]);

  // Storage endpoint (siteRelPath, evidenceLibrary, evidenceBasePath)
  const storageEndpoint = useMemo(
    () => getStorageEndpoint(storageVersion, fallbackRelPath),
    [storageVersion, fallbackRelPath]
  );

  // ── List / repo names — same convention for v1 and v2 ────────────────────
  const listName = buildListName(localProject.Title ?? localProject.ProjectNumber ?? '');
  const repoName = buildRepoName(localProject.Title ?? localProject.ProjectNumber ?? '');

  // For v1 use the current web URL; for v2 use the resolved web URL
  const siteUrl = getProjectWebUrl(storageVersion, fallbackWebUrl);
  const siteRel = storageEndpoint.siteRelPath;

  const evidenceLibraryRootServerRelative = buildEvidenceLibraryRootServerRelative(
    siteRel,
    storageEndpoint.evidenceLibrary,
    storageEndpoint.evidenceBasePath ?? undefined
  );
  const evidenceFolderServerRelative = `${evidenceLibraryRootServerRelative}/${repoName}`.replace(/\/{2,}/g, "/");
  const projectListUrlFallback = `${siteUrl.replace(/\/+$/, "")}/Lists/${encodeURIComponent(listName)}/AllItems.aspx`;
  const [resolvedProjectListUrl, setResolvedProjectListUrl] = useState(projectListUrlFallback);
  const repoBrowseUrl = useMemo(
    () => buildRepoBrowseUrl(siteUrl, evidenceFolderServerRelative, evidenceLibraryRootServerRelative),
    [siteUrl, evidenceFolderServerRelative, evidenceLibraryRootServerRelative]
  );

  useEffect(() => {
    setLocalProject(project);
  }, [project]);

  useEffect(() => {
    let disposed = false;

    const resolveProjectListUrl = async (): Promise<void> => {
      try {
        const data = await projectSp.web.lists
          .getByTitle(listName)
          .select("DefaultViewUrl", "RootFolder/ServerRelativeUrl")
          .expand("RootFolder")();

        const defaultViewUrl =
          (data.DefaultViewUrl as string | undefined) ||
          `${data.RootFolder?.ServerRelativeUrl || ""}/AllItems.aspx`;

        if (!disposed) {
          setResolvedProjectListUrl(
            defaultViewUrl ? toAbsoluteSharePointUrl(siteUrl, defaultViewUrl) : projectListUrlFallback
          );
        }
      } catch {
        if (!disposed) setResolvedProjectListUrl(projectListUrlFallback);
      }
    };

    void resolveProjectListUrl();
    return () => { disposed = true; };
  }, [projectSp, siteUrl, listName, projectListUrlFallback]);

  // projectSp -> task lists (may target WO-Plans for v2)
  // catalogSp -> ED2-Projects catalog (environment-specific)
  const projectService = useMemo(
    () => new ProjectService(projectSp, listName, catalogSp),
    [projectSp, listName, catalogSp]
  );

  // no-op: properties are fixed per catalog row
  const noop = (_patch: Partial<IProjectDashboardWebPartProps>): void => { return; };

  const [activeGate,         setActiveGate]         = useState<string | null>(null);
  const [showCard,           setShowCard]           = useState(false);
  const [selectedTask,       setSelectedTask]       = useState<ITaskListItem | null>(null);
  const [creatingId,         setCreatingId]         = useState<string | null>(null);
  const [deletingId,         setDeletingId]         = useState<string | null>(null);
  const [navTasks,           setNavTasks]           = useState<ITaskListItem[]>([]);
  const [statusReported,     setStatusReported]     = useState(false);
  const [showProjectActions, setShowProjectActions] = useState(false);

  const {
    tasks, gates, filteredTasks,
    onReset, onGateFilterChange, onSelectItem,
    onNewTask, onDeleteTask, onMoveTask: onMoveTaskPersist, onUpdateTask, onUploadFile,
    onSaveLogField: _onSaveLogField, onSendEmail, onSearchUsers,
  } = useProjectState({
    context,
    sp:             projectSp,
    projectService,
    projectName:    localProject.Title,
    sourceName:     listName,
    isPlanner:      false,
    showLog:        false,
    projectURL:     resolvedProjectListUrl,
    onPatchProperties: noop,
    onReleaseRegistered: (release) => {
      setLocalProject(prev => {
        const existing = prev.releases ?? [];
        const nextReleases = existing.some(r => r.id === release.id)
          ? existing.map(r => r.id === release.id ? release : r)
          : [...existing, release];
        return {
          ...prev,
          releases: nextReleases,
        };
      });
    },
    storageEndpoint,
    projectUnits: localProject.Units ?? 0,
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

  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  const handleMoveTask = useCallback(async (
    taskId: string,
    gate: string,
    direction: 'first' | 'up' | 'down' | 'last'
  ): Promise<void> => {
    if (movingTaskId) return;
    setMovingTaskId(taskId);
    try {
      await onMoveTaskPersist(taskId, gate, direction);

      // Assign sequential sortOrders — only update changed items
    } catch (e) {
      console.error('[handleMoveTask] Error:', e);
    } finally {
      setMovingTaskId(null);
    }
  }, [movingTaskId, onMoveTaskPersist]);

  // Local copy of catalog fields — updated optimistically after a successful save


  // Minimal IProjectListItem shape required by ProjectActionsBar
  const projectListItem = useMemo(() => ({
    Id:             localProject.Title,
    Title:          localProject.Title,
    ListName:       listName,
    RepositoryName: repoName,
    isPlanner:      false,
    Link:           { Url: resolvedProjectListUrl, Description: localProject.Title },
  }), [localProject, listName, repoName, resolvedProjectListUrl]);

  // Report project status to parent once gates are loaded
  useEffect(() => {
    if (!onStatusReady || statusReported || gates.length === 0) return;
    let key: "ontime" | "stalled" | "delayed" | "archived" = "ontime";
    const s = localProject.Status?.toLowerCase();
    if (s === "archived" || s === "closed") {
      key = "archived";
    } else {
      const overall = GetBucketStatus(gates);
      if (overall === "red")    key = "delayed";
      else if (overall === "yellow") key = "stalled";
      else key = "ontime";
    }
    onStatusReady(localProject.Title, key);
    setStatusReported(true);
  }, [gates, localProject, onStatusReady, statusReported]);

  const handleGateClick = (gate: string): void => {
    const next = activeGate === gate ? null : gate;
    setActiveGate(next);
    setShowCard(false);
    if (next === null) {
      void onGateFilterChange?.("all");
      onSelectItem("all", "gate");
    } else {
      onSelectItem(next, "gate");
      void onGateFilterChange?.(next);
    }
  };

  const handleTaskCompleted = (): void => {
    if (!selectedTask) return;
    const completeLockMessage = getTaskCompleteLockMessageFromJsonTable(selectedTask.jsonTable);
    if (completeLockMessage) {
      alert(completeLockMessage);
      return;
    }

    const payload = JSON.stringify({ ...selectedTask, Complete: 100, ActualFinish: new Date() });
    void onUpdateTask?.(selectedTask.Id, 'quick-complete', payload);
  };

  const handleOverallClick = (): void => {
    const next = activeGate === "all" ? null : "all";
    setActiveGate(next);
    setShowCard(false);
    void onGateFilterChange?.("all");
    onSelectItem("all", "gate");
  };

  const showAllTasks = activeGate === "all";
  const visibleTasks = showAllTasks ? tasks : filteredTasks;
  const tasksHeading = showAllTasks
    ? "All Tasks"
    : filteredTasks[0]?.Gate || activeGate || "";

  // ── Task navigation (prev / next in the visible sorted list) ───────────────
  const currentNavIdx = selectedTask ? navTasks.findIndex(t => t.Id === selectedTask.Id) : -1;
  const prevNavTask   = currentNavIdx > 0 ? navTasks[currentNavIdx - 1] : null;
  const nextNavTask   = currentNavIdx >= 0 && currentNavIdx < navTasks.length - 1 ? navTasks[currentNavIdx + 1] : null;

  const handleNavigate = useCallback((dir: 'prev' | 'next'): void => {
    const target = dir === 'prev' ? prevNavTask : nextNavTask;
    if (!target) return;
    setSelectedTask(target);
    setShowCard(true);
    // Scroll to the target row after render
    setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-task-id="${target.Id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }, [prevNavTask, nextNavTask]);

  const remainingReleaseUnits = Math.max(
    0,
    (localProject.Units ?? 0) - (localProject.releases ?? []).reduce((sum, release) => sum + (release.units ?? 0), 0)
  );

  const resolveFreshTaskById = useCallback((taskId: string): ITaskListItem | null => {
    return tasks.find(task => task.Id === taskId)
      ?? filteredTasks.find(task => task.Id === taskId)
      ?? navTasks.find(task => task.Id === taskId)
      ?? null;
  }, [tasks, filteredTasks, navTasks]);

  useEffect(() => {
    if (!selectedTask?.Id) return;
    const freshTask = resolveFreshTaskById(selectedTask.Id);
    if (!freshTask) return;

    setSelectedTask(prev => {
      if (!prev || prev.Id !== freshTask.Id) return prev;
      return prev === freshTask ? prev : freshTask;
    });
  }, [selectedTask?.Id, resolveFreshTaskById]);

  const expandedTaskCard = showCard && selectedTask ? (
    <TaskCard
      task={selectedTask}
      isPlanner={false}
      currentUserEmail={context.pageContext.user.email}
      currentUserDisplayName={context.pageContext.user.displayName}
      projectInfo={{
        projectNumber: localProject.ProjectNumber ?? '',
        partNumber: localProject.PartNumber ?? localProject.Title ?? '',
      }}
      projectUnits={localProject.Units ?? 0}
      remainingReleaseUnits={remainingReleaseUnits}
      onSaveLogField={onSaveLogField}
      onSendEmail={onSendEmail}
      onSearchUsers={onSearchUsers}
      onTaskCompleted={handleTaskCompleted}
      onClose={() => setShowCard(false)}
      hasPrev={!!prevNavTask}
      hasNext={!!nextNavTask}
      onNavigate={handleNavigate}
      onNew={(task) => {
        if (creatingId) return;
        setCreatingId(task.Id);
        void (async () => {
          try {
            const newTask = await (onNewTask?.(task.Gate, task.Title || undefined) ?? Promise.resolve(null));
            if (newTask) { setSelectedTask(newTask); setShowCard(true); }
          } finally {
            setCreatingId(null);
          }
        })();
      }}
      isCreating={!!creatingId}
      isDeleting={!!deletingId}
      onDelete={(taskId) => {
        if (deletingId) return;
        setDeletingId(taskId);
        void (async () => {
          try {
            const nextTask = await onDeleteTask?.(taskId, selectedTask?.Gate, selectedTask?.Title || undefined);
            if (nextTask) { setSelectedTask(nextTask); setShowCard(true); }
            else { setShowCard(false); }
          } finally {
            setDeletingId(null);
          }
        })();
      }}
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
        setShowCard(true);
        return onUpdateTask?.(taskId, "full-update", payloadJson);
      }}
      onUploadEvidenceFile={async (file, taskTitle) => {
        if (!onUploadFile) throw new Error("onUploadFile not provided");
        return onUploadFile(file, taskTitle);
      }}
      isMoving={movingTaskId === selectedTask?.Id}
      isMoveFirst={(() => {
        if (!selectedTask) return true;
        const g = navTasks.filter(t => t.Gate === selectedTask.Gate);
        return g.length === 0 || g[0].Id === selectedTask.Id;
      })()}
      isMoveLast={(() => {
        if (!selectedTask) return true;
        const g = navTasks.filter(t => t.Gate === selectedTask.Gate);
        return g.length === 0 || g[g.length - 1].Id === selectedTask.Id;
      })()}
      onMoveFirst={() => { handleMoveTask(selectedTask!.Id, selectedTask!.Gate, 'first').catch(() => undefined); }}
      onMoveUp={() => { handleMoveTask(selectedTask!.Id, selectedTask!.Gate, 'up').catch(() => undefined); }}
      onMoveDown={() => { handleMoveTask(selectedTask!.Id, selectedTask!.Gate, 'down').catch(() => undefined); }}
      onMoveLast={() => { handleMoveTask(selectedTask!.Id, selectedTask!.Gate, 'last').catch(() => undefined); }}
    />
  ) : undefined;

  return (
    <div className={`${styles.card} ${activeGate !== null ? styles.cardActive : ""} ${showProjectActions ? styles.cardActionsOpen : ""}`}>

      {/* ── Row header: project info (left) + gate bar (right) ───────── */}
      <div className={`${styles.header} ${activeGate !== null ? styles.headerActive : ""}`}>
        <div className={styles.projectInfo} onClick={handleOverallClick} style={{ cursor: "pointer" }}>
          <div className={styles.projectTitle}>
            {storageVersion === 'v1' && (
              <span className={styles.storageAlert} title="Legacy storage v1">⚠</span>
            )}
            {localProject.PartNumber}
          </div>
          <div className={styles.projectSubtitle}>
            {localProject.ProjectNumber && <><span className={styles.woTag}>WO# {localProject.ProjectNumber}</span></>}
            {!!localProject.Units && (
              <span className={styles.unitsTag}> ({localProject.Units} units)</span>
            )}
          </div>
          <div className={styles.projectCustomer}>{localProject.Customer}</div>
        </div>

        {gates.length > 0 ? (
          <GateProgressBar
            gates={gates}
            tasks={tasks}
            activeGate={activeGate ?? undefined}
            onGateClick={handleGateClick}
            onOverallClick={handleOverallClick}
            onSettingsClick={() => setShowProjectActions(prev => !prev)}
            settingsActive={showProjectActions}
          />
        ) : (
          <div className={styles.noGatesRow}>
            <span className={styles.noGates}>
              {tasks.length === 0 ? "No task list found — please verify the SharePoint list exists." : "No gates defined"}
            </span>
            <button
              type="button"
              className={`${styles.settingsFallbackBtn} ${showProjectActions ? styles.settingsFallbackBtnActive : ""}`}
              onClick={() => setShowProjectActions(prev => !prev)}
              title={showProjectActions ? "Hide project options" : "Show project options"}
            >
              <SettingsIcon />
              <span>Options</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Project actions + settings editor — visible when gear is active ── */}
      {showProjectActions && (
        <div className={styles.actionsSection}>
          <ProjectActionsBar
            project={projectListItem}
            projectService={projectService}
            evidenceFolderServerRelative={evidenceLibraryRootServerRelative}
            repoUrl={repoBrowseUrl}
            repositoryName={repoName}
            projectMetadata={localProject}
            onReset={onReset}
            onCatalogRefresh={onCatalogItemSaved}
          />
          {(onMoveFirst || onMoveUp || onMoveDown || onMoveLast) && (
            <div className={styles.reorderBar}>
              <button
                className={styles.reorderBtn}
                title="Move First"
                disabled={!!isMoveFirst || !!isReordering}
                onClick={onMoveFirst}
              >⏫</button>
              <button
                className={styles.reorderBtn}
                title="Move Up"
                disabled={!!isMoveFirst || !!isReordering}
                onClick={onMoveUp}
              >▲</button>
              <button
                className={styles.reorderBtn}
                title="Move Down"
                disabled={!!isMoveLast || !!isReordering}
                onClick={onMoveDown}
              >▼</button>
              <button
                className={styles.reorderBtn}
                title="Move Last"
                disabled={!!isMoveLast || !!isReordering}
                onClick={onMoveLast}
              >⏬</button>
              {isReordering && <span className={styles.reorderSpinner}>saving…</span>}
            </div>
          )}
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
            showGateSeparators={showAllTasks}
            onReload={() => {
              void onReset();
            }}
            selectedTaskId={selectedTask?.Id}
            expandedContent={expandedTaskCard}
            creatingTaskId={creatingId ?? undefined}
            deletingTaskId={deletingId ?? undefined}
            onSortedTasksChange={setNavTasks}
            onSave={(taskId, payloadJson) => {
              return onUpdateTask?.(taskId, "quick-complete", payloadJson);
            }}
            onSelectItem={(item, _group, mode) => {
              if (!item?.Task) return;
              switch (mode) {
                case "list-edit":
                  {
                    const freshItem = resolveFreshTaskById(item.Id) ?? item;
                  if (showCard && selectedTask?.Id === item.Id) {
                    setShowCard(false);
                  } else {
                    setSelectedTask(freshItem);
                    setShowCard(true);
                    onSelectItem(item.Task, "task");
                  }
                  }
                  break;
                case "list-create":
                  if (creatingId) break;
                  setSelectedTask(resolveFreshTaskById(item.Id) ?? item);
                  setShowCard(false);
                  setCreatingId(item.Id);
                  void (async () => {
                    try {
                      const newTask = await (onNewTask?.(item.Gate, item.Title || undefined) ?? Promise.resolve(null));
                      if (newTask) { setSelectedTask(newTask); setShowCard(false); }
                    } finally {
                      setCreatingId(null);
                    }
                  })();
                  break;
                case "list-delete":
                  if (deletingId) break;
                  setSelectedTask(resolveFreshTaskById(item.Id) ?? item);
                  setShowCard(false);
                  setDeletingId(item.Id);
                  void (async () => {
                    try {
                      const nextTask = await onDeleteTask?.(item.Id, item.Gate, item.Title || undefined);
                      if (nextTask) { setSelectedTask(nextTask); setShowCard(false); }
                      else { setShowCard(false); }
                    } finally {
                      setDeletingId(null);
                    }
                  })();
                  break;
                case "list-pivot":
                  setSelectedTask(resolveFreshTaskById(item.Id) ?? item);
                  setShowCard(false);
                  onSelectItem(item.Task, "task");
                  break;
                default:
                  {
                    const freshItem = resolveFreshTaskById(item.Id) ?? item;
                    setSelectedTask(freshItem); setShowCard(true);
                  }
                  onSelectItem(item.Task, "task");
                  break;
              }
            }}
            currentUserDisplayName={context.pageContext.user.displayName}
            onUploadFile={onUploadFile ? (file, taskTitle) => onUploadFile(file, taskTitle) : undefined}
            onSaveEvidence={onSaveLogField
              ? async (taskId, entries) => { await onSaveLogField(taskId, 'Evidence', entries); }
              : undefined}
            onMoveTask={handleMoveTask}
          />
        </div>
      )}
    </div>
  );
};

export default ProjectRowDashboard;
