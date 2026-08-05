import { useState, useCallback, useEffect, useRef } from 'react';
import { SPFI } from "@pnp/sp";
import { IList } from "@pnp/sp/lists";
import { MSGraphClientV3, SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { ITaskListItem, IGateListItem, IProjectListItem } from '../../../models';
import { IProjectDashboardWebPartProps } from '../../../models';
import { INoteEntry, IEvidenceEntry, IApprovalEntry } from '../../../models';
import { IReleaseRecord } from '../../../models/IProjectService';
import { GroupByGate } from '../utils/GroupByGate';
import { FilterTasks } from '../utils/FilterTasks';
import { PlannerService } from '../services/PlannerService';
import { ProjectService } from '../services/ProjectService';
import { MessageLog } from '../utils/MessageLog';
import { compareWbs, computeShiftedWbs, computeUnshiftedWbs, nextWbsAfterInsert, reorderWbsEntriesForMove } from '../utils/ParseWBS';
import { ensureFolder, uploadEvidenceFile } from '../services/UploadService';
import { StorageEndpoint } from '../utils/StorageVersionResolver';
import { getTaskSortOrder, getTaskIsRelease, getTaskReleaseUnits } from '../utils/TaskDescriptionBlob';
import { buildTaskSortOrderJsonTable } from '../utils/TaskPersistencePayload';

// ─── Constants ──────────────────────────────────────────────────────────────
const MSG_INFO = 0;
const MSG_ERROR = 2;
const SITE_URL = "https://ed2corp.sharepoint.com";
const REPOSITORY_URL = "ProjectsEvidence";
const REPOSITORY_NAME_DEFAULT = "EvidenceRepository";

// ─── Types ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

export interface UseProjectStateConfig {
  context: AnyContext;
  sp: SPFI;
  projectService: ProjectService;
  // Properties (from WebPart property pane)
  projectName: string;
  sourceName: string;
  isPlanner: boolean;
  showLog: boolean;
  projectURL?: string;
  onPatchProperties: (patch: Partial<IProjectDashboardWebPartProps>) => void;
  onReleaseRegistered?: (release: IReleaseRecord) => void;
  /**
   * Storage endpoint resolved per-project from ProjectDetails.storageVersion.
   * When omitted, falls back to legacy v1 constants (SITE_URL + REPOSITORY_URL).
   */
  storageEndpoint?: StorageEndpoint;
  /** Total units from the WorkOrder — used when registering a Release event */
  projectUnits?: number;
}

export interface UseProjectStateResult {
  // ── State ──
  tasks: ITaskListItem[];
  gates: IGateListItem[];
  filteredTasks: ITaskListItem[];
  // eslint-disable-next-line @rushstack/no-new-null
  selectedTask: ITaskListItem | null;
  currentGate: string;
  sysError: boolean;
  showNewProjectSetup: boolean;
  environmentMessage: string;
  projectSelected: IProjectListItem;

  // ── Actions ──
  onReset: () => Promise<void>;
  onGateFilterChange: (gate: string) => Promise<void>;
  onSelectItem: (item: string, group: string) => void;
  // eslint-disable-next-line @rushstack/no-new-null
  onNewTask: (gate: string, sourceWbs?: string) => Promise<ITaskListItem | null>;
  // eslint-disable-next-line @rushstack/no-new-null
  onDeleteTask: (taskId: string, gate?: string, wbs?: string) => Promise<ITaskListItem | null>;
  onMoveTask: (taskId: string, gate: string, direction: 'first' | 'up' | 'down' | 'last') => Promise<void>;
  onUpdateTask: (taskName: string, action: "quick-complete" | "full-update", payloadJson?: string) => Promise<void>;
  onUploadFile: (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;
  onPopulateAttachements: () => Promise<void>;
  onCreateNewProject: (listName: string, repositoryName: string, projectTitle: string, firstGate: string, mode: "empty" | "from-excel", file?: File) => Promise<void>;
  // eslint-disable-next-line @rushstack/no-new-null
  setSelectedTask: (task: ITaskListItem | null) => void;
  onSaveLogField: (taskId: string, field: 'Notes' | 'Evidence' | 'Approvals', entries: unknown[]) => Promise<void>;
  onSendEmail: (to: string[], subject: string, body: string) => Promise<void>;
  onSearchUsers: (query: string) => Promise<{ displayName: string; email: string }[]>;
  onRegisterRelease: (release: IReleaseRecord) => Promise<void>;
}

// ─── Resilient JSON field parser ──────────────────────────────────────────────
// Returns null (column missing/empty) or the parsed array.
// Never throws — malformed JSON is treated as missing.
function parseLogField<T>(raw: unknown): T[] | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') return undefined;
  try { return JSON.parse(raw) as T[]; }
  catch { return undefined; }
}

function hasMissingFieldError(errorText: string, fieldName: string): boolean {
  const haystack = errorText.toLowerCase();
  const needle = fieldName.toLowerCase();
  return (
    haystack.includes(needle) &&
    (
      haystack.includes('does not exist') ||
      haystack.includes('cannot be found') ||
      haystack.includes('field or property') ||
      haystack.includes('property does not exist')
    )
  );
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function buildProjectInfo(
  projectName: string,
  sourceName: string,
  isPlanner: boolean,
  projectURL?: string
): IProjectListItem {
  return {
    Id: sourceName,
    Title: projectName,
    isPlanner,
    RepositoryName: sourceName.replace(/-List$/, '-Evidence'),
    ListName: sourceName,
    Link: { Url: projectURL || "", Description: projectName }
  };
}

function makeEmptyTask(gate?: string): ITaskListItem {
  return {
    Id: "",
    Gate: gate || "New Gate",
    Complete: 0,
    Title: "",
    Start: new Date(),
    Finish: new Date(),
    Task: "No Task Found..."
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useProjectState(config: UseProjectStateConfig): UseProjectStateResult {
  const { context, sp, showLog } = config;

  // ── State ──────────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<ITaskListItem[]>([]);
  const [gates, setGates] = useState<IGateListItem[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<ITaskListItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<ITaskListItem | null>(null);
  const [currentGate, setCurrentGate] = useState<string>('all');
  const [sysError, setSysError] = useState<boolean>(false);
  const [showNewProjectSetup, setShowNewProjectSetup] = useState<boolean>(false);
  const [environmentMessage, setEnvironmentMessage] = useState<string>('');
  const [projectSelected, setProjectSelected] = useState<IProjectListItem>(() =>
    buildProjectInfo(config.projectName, config.sourceName, config.isPlanner, config.projectURL)
  );

  // Ref to always have the latest tasks value available inside async callbacks
  const tasksRef = useRef<ITaskListItem[]>([]);

  // null = not yet probed; true = columns exist; false = columns absent in this list
  const logFieldsAvailableRef = useRef<boolean | null>(null);
  const jsonTableFieldAvailableRef = useRef<boolean | null>(null);
  const releaseDebugTaskIdRef = useRef<string | null>(null);

  const setLogFieldsAvailable = useCallback((available: boolean): void => {
    logFieldsAvailableRef.current = available;
  }, []);

  const setJsonTableFieldAvailable = useCallback((available: boolean): void => {
    jsonTableFieldAvailableRef.current = available;
  }, []);

  const withAvailableTaskFields = useCallback((
    payload: Record<string, unknown>,
    options?: { includeJsonTableDefault?: boolean }
  ): Record<string, unknown> => {
    const nextPayload = { ...payload };
    const payloadRequiresJsonTable =
      typeof nextPayload.jsonTable === "string" &&
      nextPayload.jsonTable.trim() !== "";
    const includeJsonTable =
      payloadRequiresJsonTable ||
      (jsonTableFieldAvailableRef.current !== false && options?.includeJsonTableDefault !== false);

    if (!includeJsonTable) {
      if (Object.prototype.hasOwnProperty.call(nextPayload, "jsonTable")) {
        console.warn("[useProjectState] jsonTable omitted because the field is unavailable for this list.");
      }
      delete nextPayload.jsonTable;
    }

    return nextPayload;
  }, []);

  const syncTasks = useCallback((newTasks: ITaskListItem[]) => {
    tasksRef.current = newTasks;
    setTasks(newTasks);
  }, []);

  // ── Data loading ───────────────────────────────────────────────────────────

  const _getTaskListItems = useCallback(async (
    project: IProjectListItem
  ): Promise<ITaskListItem[]> => {
    MessageLog("ProjectName : " + project.Title, "_getTaskListItems", MSG_INFO, showLog);

    if (!project.ListName || project.ListName.length === 0) {
      MessageLog("List not found for: " + project.Title, "_getTaskListItems", MSG_ERROR, showLog);
      setSysError(true);
      return [];
    }

    try {
      const siteRelativePath = config.storageEndpoint?.siteRelPath ?? context.pageContext.web.serverRelativeUrl;
      const effectiveSiteUrl = config.storageEndpoint?.siteUrl ?? SITE_URL;
      const LOG_FIELD_NAMES = ['Notes', 'Evidence', 'Approvals'];

      const buildSelect = (withLog: boolean, withJsonTable: boolean): string => {
        const baseFields = [
          'Id', 'Title', 'Gate', 'Task',
          'Complete', 'Start', 'Finish', 'ActualFinish', 'Description',
          ...(withJsonTable ? ['jsonTable'] : [])
        ];
        return withLog ? `${baseFields.join(',')},Notes,Evidence,Approvals` : baseFields.join(',');
      };

      const fetchItems = (withLog: boolean, withJsonTable: boolean): Promise<SPHttpClientResponse> => {
        const queryUrl = `${effectiveSiteUrl}${siteRelativePath}/_api/web/lists/getbytitle('${project.ListName}')/items?$select=${buildSelect(withLog, withJsonTable)}`;
        return context.spHttpClient.get(queryUrl, SPHttpClient.configurations.v1);
      };

      // If we already know optional fields are absent, skip straight to reduced query.
      let tryWithLog = logFieldsAvailableRef.current !== false;
      let includeJsonTable = jsonTableFieldAvailableRef.current !== false;
      let response = await fetchItems(tryWithLog, includeJsonTable);

      // On 400, the issue is typically a missing field in $select, not bad row data.
      // SharePoint error messages are not stable, so fall back progressively even if
      // we cannot parse the exact field name from the response body.
      if (!response.ok && response.status === 400) {
        const errText = await response.text();
        const isLogFieldError = LOG_FIELD_NAMES.some(f => hasMissingFieldError(errText, f));
        const isJsonTableFieldError = hasMissingFieldError(errText, 'jsonTable');
        const attempts: Array<{ withLog: boolean; withJsonTable: boolean }> = [];

        if (isLogFieldError && tryWithLog) {
          attempts.push({ withLog: false, withJsonTable: includeJsonTable });
        }
        if (isJsonTableFieldError && includeJsonTable) {
          attempts.push({ withLog: tryWithLog, withJsonTable: false });
        }

        // Generic fallback sequence when SharePoint returns a 400 without a parsable field name.
        if (!attempts.length) {
          if (tryWithLog) attempts.push({ withLog: false, withJsonTable: includeJsonTable });
          if (includeJsonTable) attempts.push({ withLog: tryWithLog, withJsonTable: false });
          if (tryWithLog && includeJsonTable) attempts.push({ withLog: false, withJsonTable: false });
        }

        let recovered = false;
        for (const attempt of attempts) {
          tryWithLog = attempt.withLog;
          includeJsonTable = attempt.withJsonTable;
          if (!tryWithLog) setLogFieldsAvailable(false);
          if (!includeJsonTable) setJsonTableFieldAvailable(false);

          response = await fetchItems(tryWithLog, includeJsonTable);
          if (response.ok) {
            recovered = true;
            break;
          }
        }

        if (!recovered && !response.ok) {
          console.error("[_getTaskListItems] HTTP error:", response.status, errText);
          setSysError(true);
          setEnvironmentMessage(errText);
          return [];
        }
      }

      if (!response.ok) {
        const txt = await response.text();
        // 404 = list not yet created — expected for projects pending setup, show empty silently
        if (response.status === 404) {
          console.warn("[_getTaskListItems] List not found (404):", project.ListName);
          return [];
        }
        console.error("[_getTaskListItems] HTTP error:", response.status, txt);
        setSysError(true);
        setEnvironmentMessage(txt);
        return [];
      }

      // Mark log fields as available if we didn't already know they were absent
      if (logFieldsAvailableRef.current === null) setLogFieldsAvailable(true);
      if (jsonTableFieldAvailableRef.current === null && includeJsonTable) setJsonTableFieldAvailable(true);

      const responseJson = await response.json();
      const raw: any[] = Array.isArray(responseJson.value) ? responseJson.value : [];  // eslint-disable-line @typescript-eslint/no-explicit-any
      const loaded: ITaskListItem[] = raw.map(r => {
        // Extract task metadata strictly from jsonTable
        const jsonTable = r.jsonTable ?? r.JsonTable ?? undefined;
        const sortOrder = getTaskSortOrder(jsonTable);
        const isRelease = getTaskIsRelease(jsonTable);
        const releaseUnits = getTaskReleaseUnits(jsonTable);
        return {
          Id: String(r.Id),
          Gate: r.Gate ?? "",
          Task: r.Task ?? "",
          Title: r.Title ?? undefined,
          Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
          Start: r.Start ? new Date(r.Start) : undefined,
          Finish: r.Finish ? new Date(r.Finish) : undefined,
          ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
          Description: r.Description ?? undefined,
          jsonTable,
          sortOrder,
          isRelease: isRelease || undefined,
          releaseUnits,
          // Log fields — null if column missing or empty (resilient)
          Notes:     parseLogField<INoteEntry>(r.Notes),
          Evidence:  parseLogField<IEvidenceEntry>(r.Evidence),
          Approvals: parseLogField<IApprovalEntry>(r.Approvals),
        };
      });
      return [...loaded].sort((a, b) => {
        const m = (g: string): string => { const x = g.match(/(\d+(?:\.\d+)*)/); return x ? x[1] : g; };
        return compareWbs(m(a.Gate), m(b.Gate));
      });
    } catch (error) {
      if (showLog) console.error("[_getTaskListItems] Error:", error);
      setSysError(true);
      setEnvironmentMessage(String(error));
      return [];
    }
  }, [context, showLog, config.storageEndpoint?.siteRelPath, config.storageEndpoint?.siteUrl, setJsonTableFieldAvailable, setLogFieldsAvailable]);

  const _getGateListItems = useCallback(async (
    project: IProjectListItem,
    currentTasks: ITaskListItem[]
  ): Promise<IGateListItem[]> => {
    if (!project.ListName || project.ListName.length === 0) {
      MessageLog("Gate- List not found for: " + project.Title, "_getGateListItems", MSG_ERROR, showLog);
      setSysError(true);
      return [];
    }
    try {
      if (currentTasks.length > 0) {
        return GroupByGate(currentTasks);
      }
      MessageLog("Gate- List not found for: " + project.Title, "_getGateListItems", MSG_ERROR, showLog);
      return [];
    } catch (error) {
      if (showLog) console.error("Error fetching gate list items:", error);
      setSysError(true);
      setEnvironmentMessage(String(error));
      return [];
    }
  }, [showLog]);

  const _getPlannerListItems = useCallback(async (
    project: IProjectListItem
  ): Promise<ITaskListItem[]> => {
    const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);
    try {
      if (project.ListName && project.ListName.length > 0) {
        const planDetails = await plannerService.getPlanDetails(project.ListName);
        return planDetails ?? [];
      }
      MessageLog("[_getPlannerListItems] Plan not found: " + project.ListName, "_getPlannerListItems", MSG_ERROR, showLog);
      return [];
    } catch (error) {
      console.error("Error loading plan details:", error);
      return [];
    }
  }, [context, showLog]);

  const _populateAttachements = useCallback(async (
    currentTasks: ITaskListItem[]
  ): Promise<ITaskListItem[]> => {
    const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);
    return plannerService.populateAttachements(currentTasks);
  }, [context]);

  // ── Core reset/load ────────────────────────────────────────────────────────

  /**
   * Central data loader. Equivalent to the old _onReset().
   * Accepts an explicit project snapshot so it can be called right after
   * property changes without waiting for the next render cycle.
   */
  const _loadData = useCallback(async (
    project: IProjectListItem,
    gate: string
  ): Promise<void> => {
    setSysError(false);
    setShowNewProjectSetup(false);
    setProjectSelected(project);

    let currentTasks: ITaskListItem[] = [];

    if (project.isPlanner) {
      currentTasks = await _getPlannerListItems(project);
      currentTasks = await _populateAttachements(currentTasks);
    } else {
      currentTasks = await _getTaskListItems(project);
    }

    syncTasks(currentTasks);

    if (currentTasks.length > 0) {
      const gateItems = await _getGateListItems(project, currentTasks);
      setGates(gateItems);

      const filtered = gate === "all"
        ? currentTasks
        : FilterTasks(currentTasks, "gate", gate);
      setFilteredTasks(filtered);
    } else {
      setShowNewProjectSetup(true);
    }

  }, [_getPlannerListItems, _populateAttachements, _getTaskListItems, _getGateListItems, syncTasks]);

  const onReset = useCallback(async (): Promise<void> => {
    const project = buildProjectInfo(
      config.projectName,
      config.sourceName,
      config.isPlanner,
      config.projectURL
    );
    await _loadData(project, currentGate || "actual");
  }, [config.projectName, config.sourceName, config.isPlanner, config.projectURL, currentGate, _loadData]);

  // ── Reload when key properties change ─────────────────────────────────────
  useEffect(() => {
    if (!config.sourceName) return;   // catalog mode: no single project configured
    const project = buildProjectInfo(
      config.projectName,
      config.sourceName,
      config.isPlanner,
      config.projectURL
    );
    void _loadData(project, "actual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.sourceName, config.projectName, config.isPlanner]);

  // ── Gate filter ────────────────────────────────────────────────────────────
  const onGateFilterChange = useCallback(async (gate: string): Promise<void> => {
    setCurrentGate(gate);
    let currentTasks = tasksRef.current;
    if (currentTasks.length === 0) {
      const project = buildProjectInfo(
        config.projectName, config.sourceName, config.isPlanner, config.projectURL
      );
      currentTasks = await _getTaskListItems(project);
      syncTasks(currentTasks);
    }
    const filtered = gate === "all"
      ? currentTasks
      : FilterTasks(currentTasks, "gate", gate);
    setFilteredTasks(filtered);
  }, [config, _getTaskListItems, syncTasks]);

  // ── Select item ────────────────────────────────────────────────────────────
  const onSelectItem = useCallback((item: string, group: string): void => {
    const currentTasks = tasksRef.current;
    if (group === "task") {
      const found = currentTasks.find(t => t.Task === item);
      if (found) {
        setSelectedTask(found);
        MessageLog("[onSelectItem] Selected: " + item, "onSelectItem", MSG_INFO, showLog);
      } else {
        MessageLog("[onSelectItem] Not found: " + item, "onSelectItem", MSG_ERROR, showLog);
      }
    }
  }, [showLog]);

  // ── Upload file ────────────────────────────────────────────────────────────
  const onUploadFile = useCallback(async (
    file: File,
    taskTitle: string
  ): Promise<{ fileUrl: string; fileName: string }> => {
    const siteRelativePath = config.storageEndpoint?.siteRelPath ?? context.pageContext.web.serverRelativeUrl;
    const effectiveSiteUrl = config.storageEndpoint?.siteUrl ?? SITE_URL;
    const evidenceLib      = config.storageEndpoint?.evidenceLibrary ?? REPOSITORY_URL;
    const evidenceBase     = config.storageEndpoint?.evidenceBasePath ?? undefined;
    const folderPath       = evidenceLib + "/";
    const folderName       = config.sourceName.replace(/-List$/, '-Evidence') || REPOSITORY_NAME_DEFAULT;

    // Ensure the evidence folder exists before attempting the upload
    await ensureFolder(
      context.spHttpClient,
      effectiveSiteUrl,
      siteRelativePath,
      evidenceLib,
      folderName,
      evidenceBase
    );

    const { fileUrl, fileName } = await uploadEvidenceFile(
      context.spHttpClient,
      context,
      effectiveSiteUrl.trim(),
      siteRelativePath.trim(),
      folderPath.trim(),
      folderName.trim(),
      file,
      evidenceBase
    );
    return { fileUrl, fileName };
  }, [context, config.sourceName, config.storageEndpoint?.siteRelPath, config.storageEndpoint?.siteUrl, config.storageEndpoint?.evidenceLibrary, config.storageEndpoint?.evidenceBasePath]);

  // ── Populate attachments (Planner) ─────────────────────────────────────────
  const onPopulateAttachements = useCallback(async (): Promise<void> => {
    const updated = await _populateAttachements(tasksRef.current);
    syncTasks(updated);
  }, [_populateAttachements, syncTasks]);

  // ── WBS helper ────────────────────────────────────────────────────────────
  const _getNextWbsForGate = useCallback(async (
    listTitle: string,
    gate: string
  ): Promise<string> => {
    const existing = await sp.web.lists
      .getByTitle(listTitle)
      .items.select("Title", "Gate")
      .filter(`Gate eq '${gate.replace(/'/g, "''")}'`)();

    if (!existing.length) return "1";

    const titles = existing.map((e: any) => e.Title as string).filter(t => !!t); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!titles.length) return "1";

    titles.sort(compareWbs);
    const last = titles[titles.length - 1];
    const parts = last.split(".");
    const lastNum = Number(parts[parts.length - 1]) || 0;
    parts[parts.length - 1] = String(lastNum + 1);
    return parts.join(".");
  }, [sp]);

  // ── Create task ────────────────────────────────────────────────────────────
  const _createListTask = useCallback(async (gate: string): Promise<ITaskListItem | null> => {
    const listTitle = config.sourceName;
    const today = new Date();

    const nextWbs = await _getNextWbsForGate(listTitle, gate);

    const addResult: any = await sp.web.lists.getByTitle(listTitle).items.add(withAvailableTaskFields({ // eslint-disable-line @typescript-eslint/no-explicit-any
      Gate: gate,
      Title: nextWbs,
      Task: "New task...",
      Start: today.toISOString(),
      Finish: today.toISOString(),
      Complete: 0
    }));

    const addedId = addResult.Id as number | undefined;
    if (!addedId) { setSelectedTask(makeEmptyTask()); return null; }

    const r: any = await sp.web.lists.getByTitle(listTitle).items.getById(addedId)(); // eslint-disable-line @typescript-eslint/no-explicit-any

    const task: ITaskListItem = {
      Id: String(r.Id),
      Gate: r.Gate ?? gate,
      Task: r.Task ?? "New task...",
      Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
      Start: r.Start ? new Date(r.Start) : today,
      Finish: r.Finish ? new Date(r.Finish) : today,
      ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
      Title: r.Title ?? nextWbs
    };
    setSelectedTask(task);
    return task;
  }, [config.sourceName, sp, _getNextWbsForGate, withAvailableTaskFields]);

  // ── Insert task after a specific WBS (with cascade shift) ─────────────────
  const _insertTaskAfter = useCallback(async (gate: string, sourceWbs: string): Promise<ITaskListItem | null> => {
    const listTitle = config.sourceName;
    const today = new Date();
    const newWbs = nextWbsAfterInsert(sourceWbs);
    const gateTasks = tasksRef.current
      .filter(t => t.Gate === gate && !!t.Title)
      .slice()
      .sort((a, b) =>
        (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) ||
        compareWbs(a.Title || "", b.Title || "")
      );
    const sourceIndex = gateTasks.findIndex(t => t.Title === sourceWbs);
    const insertSortOrder = sourceIndex >= 0 ? sourceIndex + 2 : gateTasks.length + 1;
    const nextSortOrders = new Map<string, number>();
    gateTasks.forEach((task, index) => {
      const currentOrder = index + 1;
      const nextOrder = sourceIndex >= 0 && index > sourceIndex ? currentOrder + 1 : currentOrder;
      nextSortOrders.set(task.Id, nextOrder);
    });

    // Identify tasks that need to shift, using the in-memory list (avoids extra SP query)
    const toShift = tasksRef.current
      .filter(t => t.Gate === gate && !!t.Title)
      .map(t => ({
        id: t.Id,
        wbs: t.Title as string,
        jsonTable: t.jsonTable,
        sortOrder: t.sortOrder,
        newWbs: computeShiftedWbs(sourceWbs, t.Title as string),
        newSortOrder: nextSortOrders.get(t.Id),
      }))
      .filter((t): t is {
        id: string;
        wbs: string;
        jsonTable: string | undefined;
        sortOrder: number | undefined;
        newWbs: string;
        newSortOrder: number;
      } => typeof t.newWbs === "string" && typeof t.newSortOrder === "number");

    // Patch from highest WBS to lowest to avoid transient collisions in SP
    toShift.sort((a, b) => -compareWbs(a.wbs, b.wbs));
    for (const t of toShift) {
      await sp.web.lists.getByTitle(listTitle).items.getById(Number(t.id)).update(withAvailableTaskFields({
        Title: t.newWbs,
        jsonTable: buildTaskSortOrderJsonTable(t.jsonTable, t.newSortOrder)
      })); // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    const shiftedIds = new Set(toShift.map(t => t.id));
    const sortOnlyUpdates = gateTasks
      .filter(t => !shiftedIds.has(t.Id))
      .map(t => ({
        id: t.Id,
        jsonTable: t.jsonTable,
        sortOrder: t.sortOrder,
        newSortOrder: nextSortOrders.get(t.Id),
      }))
      .filter((t): t is {
        id: string;
        jsonTable: string | undefined;
        sortOrder: number | undefined;
        newSortOrder: number;
      } => typeof t.newSortOrder === "number" && t.sortOrder !== t.newSortOrder);

    for (const t of sortOnlyUpdates) {
      await sp.web.lists.getByTitle(listTitle).items.getById(Number(t.id)).update(withAvailableTaskFields({
        jsonTable: buildTaskSortOrderJsonTable(t.jsonTable, t.newSortOrder)
      }));
    }

    // Create the new task at the freed WBS slot
    const addResult: any = await sp.web.lists.getByTitle(listTitle).items.add(withAvailableTaskFields({ // eslint-disable-line @typescript-eslint/no-explicit-any
      Gate: gate,
      Title: newWbs,
      Task: "New task...",
      Start: today.toISOString(),
      Finish: today.toISOString(),
      Complete: 0,
      jsonTable: buildTaskSortOrderJsonTable(undefined, insertSortOrder)
    }));

    const addedId = addResult.Id as number | undefined;
    if (!addedId) { setSelectedTask(makeEmptyTask()); return null; }

    const r: any = await sp.web.lists.getByTitle(listTitle).items.getById(addedId)(); // eslint-disable-line @typescript-eslint/no-explicit-any

    const newTask: ITaskListItem = {
      Id: String(r.Id),
      Gate: r.Gate ?? gate,
      Task: r.Task ?? "New task...",
      Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
      Start: r.Start ? new Date(r.Start) : today,
      Finish: r.Finish ? new Date(r.Finish) : today,
      ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
      Title: r.Title ?? newWbs,
      jsonTable: r.jsonTable ?? r.JsonTable ?? buildTaskSortOrderJsonTable(undefined, insertSortOrder),
      sortOrder: getTaskSortOrder(r.jsonTable ?? r.JsonTable) ?? insertSortOrder
    };
    setSelectedTask(newTask);
    return newTask;
  }, [config.sourceName, sp, tasksRef, withAvailableTaskFields]);

  const _createPlannerTask = useCallback(async (gate: string): Promise<void> => {
    const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);
    await plannerService.createEmptyTask(projectSelected.Id, gate);
  }, [context, projectSelected]);

  const onNewTask = useCallback(async (gate: string, sourceWbs?: string): Promise<ITaskListItem | null> => {
    try {
      let created: ITaskListItem | null = null;
      if (config.isPlanner) {
        await _createPlannerTask(gate);
      } else if (sourceWbs) {
        created = await _insertTaskAfter(gate, sourceWbs);
      } else {
        created = await _createListTask(gate);
      }
      await onReset();
      return created;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error("[onNewTask] Error:", error);
      MessageLog(`[onNewTask] Error: ${error.message}`, "error");
      return null;
    }
  }, [config.isPlanner, _createPlannerTask, _createListTask, _insertTaskAfter, onReset]);

  const onMoveTask = useCallback(async (
    taskId: string,
    gate: string,
    direction: 'first' | 'up' | 'down' | 'last'
  ): Promise<void> => {
    if (!taskId || !gate) return;

    const listTitle = config.sourceName;
    const gateTasks = tasksRef.current.filter(t => t.Gate === gate && !!t.Title);
    const reordered = reorderWbsEntriesForMove(
      gateTasks.map(task => ({
        id: task.Id,
        wbs: task.Title,
        sortOrder: task.sortOrder,
        task,
      })),
      taskId,
      direction
    );

    const updates: Array<{ id: number; title: string; jsonTable: string }> = [];
    reordered.forEach(({ item, wbs: nextWbs, sortOrder }) => {
      const currentTask = item.task;
      if (currentTask.Title !== nextWbs || currentTask.sortOrder !== sortOrder) {
        updates.push({
          id: Number(currentTask.Id),
          title: nextWbs,
          jsonTable: buildTaskSortOrderJsonTable(currentTask.jsonTable, sortOrder),
        });
      }
    });

    if (!updates.length) return;

    const list = sp.web.lists.getByTitle(listTitle);
    await Promise.all(
      updates.map(update =>
        list.items.getById(update.id).update(withAvailableTaskFields({
          Title: update.title,
          jsonTable: update.jsonTable,
        }))
      )
    );

    await onReset();
  }, [config.sourceName, sp, tasksRef, withAvailableTaskFields, onReset]);

  // ── Delete task ────────────────────────────────────────────────────────────
  const _deleteListTask = useCallback(async (itemId: string): Promise<void> => {
    await sp.web.lists.getByTitle(config.sourceName).items.getById(Number(itemId)).delete();
  }, [sp, config.sourceName]);

  const _deletePlannerTask = useCallback(async (taskId: string): Promise<void> => {
    const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);
    await plannerService.deleteTask(taskId);
  }, [context]);

  /**
   * Deletes a task by WBS, cascade-deletes its children, then shifts all subsequent
   * sibling tasks (and their children) down by one to close the WBS gap.
   * Returns the task that now occupies the deleted slot (previously the next sibling),
   * or null if there was no following sibling.
   */
  const _deleteTaskAndShift = useCallback(async (
    taskId: string, gate: string, wbs: string
  ): Promise<ITaskListItem | null> => {
    const listTitle = config.sourceName;
    const depth = wbs.split(".").length;

    // Children of the deleted task (deeper WBS under the same prefix)
    const children = tasksRef.current.filter(t =>
      t.Gate === gate &&
      t.Id !== taskId &&
      (t.Title || "").startsWith(wbs + ".")
    );

    // Tasks to shift: same gate, strictly after sourceWbs, excluding children of deleted task
    const childIds = new Set(children.map(c => c.Id));
    const toShift = tasksRef.current
      .filter(t => t.Gate === gate && !!t.Title && t.Id !== taskId && !childIds.has(t.Id))
      .map(t => ({ id: t.Id, origWbs: t.Title as string, newWbs: computeUnshiftedWbs(wbs, t.Title as string) }))
      .filter((t): t is { id: string; origWbs: string; newWbs: string } => t.newWbs !== null);

    // Identify the immediate next sibling (lowest WBS > sourceWbs at same depth)
    const immediateNext = toShift
      .filter(t => t.origWbs.split(".").length === depth)
      .sort((a, b) => compareWbs(a.origWbs, b.origWbs))[0] ?? null;

    // 1. Delete the source task
    await sp.web.lists.getByTitle(listTitle).items.getById(Number(taskId)).delete();

    // 2. Delete its children (cascade)
    for (const child of children) {
      await sp.web.lists.getByTitle(listTitle).items.getById(Number(child.Id)).delete();
    }

    // 3. Shift subsequent tasks LOW → HIGH (ascending) to avoid collisions
    toShift.sort((a, b) => compareWbs(a.origWbs, b.origWbs));
    for (const t of toShift) {
      await sp.web.lists.getByTitle(listTitle).items.getById(Number(t.id)).update({ Title: t.newWbs });
    }

    // 4. Return the task that now occupies the deleted slot (was immediateNext, now has newWbs = wbs)
    if (!immediateNext) return null;
    const nextTask = tasksRef.current.find(t => t.Id === immediateNext.id);
    if (!nextTask) return null;
    return { ...nextTask, Title: immediateNext.newWbs };
  }, [config.sourceName, sp, tasksRef]);

  const onDeleteTask = useCallback(async (taskId: string, gate?: string, wbs?: string): Promise<ITaskListItem | null> => {
    if (!taskId) return null;
    try {
      let nextTask: ITaskListItem | null = null;
      if (config.isPlanner) {
        await _deletePlannerTask(taskId);
      } else if (gate && wbs) {
        nextTask = await _deleteTaskAndShift(taskId, gate, wbs);
      } else {
        await _deleteListTask(taskId);
      }
      await onReset();
      return nextTask;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      MessageLog(`[onDeleteTask] Error: ${error.message}`, "error");
      return null;
    }
  }, [config.isPlanner, _deletePlannerTask, _deleteListTask, _deleteTaskAndShift, onReset]);

  // ── Register a release record in ED2-Projects.ProjectDetails ───────────────
  const onRegisterRelease = useCallback(async (release: IReleaseRecord): Promise<void> => {
    if (!config.projectName) return;
    try {
      await config.projectService.upsertReleaseRecord(config.projectName, release);
      config.onReleaseRegistered?.(release);
    } catch (err) {
      console.error('[useProjectState] Failed to register release', err);
      throw err;
    }
  }, [config]);

  // ── Update task ────────────────────────────────────────────────────────────
  const _updateListTask = useCallback(async (
    data: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    action: "quick-complete" | "full-update",
    completeSafe?: number
  ): Promise<void> => {
    const listTitle = config.sourceName;
    releaseDebugTaskIdRef.current = String(data.Id);
    const curr = completeSafe ?? data.Complete;
    const actualFinishValue = curr === 100 ? new Date() : null;
    const finishValue = curr === 100 && !data.Finish ? new Date() : data.Finish;
    const itemRef = sp.web.lists.getByTitle(listTitle).items.getById(Number(data.Id));

    if (action === "quick-complete") {
      await itemRef.update({
        Task: data.Task,
        Complete: curr,
        Finish: finishValue,
        ActualFinish: actualFinishValue,
      });
    } else {
      await itemRef.update(withAvailableTaskFields({
        Gate: data.Gate,
        Task: data.Task,
        Complete: curr,
        Start: data.Start,
        Finish: finishValue,
        ActualFinish: actualFinishValue,
        Description: data.Description,
        jsonTable: data.jsonTable
      }));

      // Rename gate for all other tasks in the same gate
      if (data.renameGate && data.originalGate && data.Gate !== data.originalGate) {
        const list = sp.web.lists.getByTitle(listTitle);
        const siblings: any[] = await list.items // eslint-disable-line @typescript-eslint/no-explicit-any
          .select("Id")
          .filter(`Gate eq '${data.originalGate.replace(/'/g, "''")}'`)
          .top(5000)();
        await Promise.all(
          siblings
            .filter((i: any) => String(i.Id) !== String(data.Id)) // eslint-disable-line @typescript-eslint/no-explicit-any
            .map((i: any) => list.items.getById(i.Id).update({ Gate: data.Gate })) // eslint-disable-line @typescript-eslint/no-explicit-any
        );
      }
    }

    const r: any = await itemRef(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const jsonTable = r.jsonTable ?? r.JsonTable ?? data.jsonTable ?? undefined;
    const taskIsRelease = getTaskIsRelease(jsonTable);
    const taskReleaseUnits = getTaskReleaseUnits(jsonTable);
    const task: ITaskListItem = {
      Id: String(r.Id),
      Gate: r.Gate ?? data.Gate,
      Task: r.Task ?? "New task",
      Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
      Start: r.Start ? new Date(r.Start) : undefined,
      Finish: r.Finish ? new Date(r.Finish) : undefined,
      ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
      Title: r.Title ?? undefined,
      Description: r.Description ?? data.Description ?? undefined,
      jsonTable,
      sortOrder: getTaskSortOrder(jsonTable),
      isRelease: taskIsRelease || undefined,
      releaseUnits: taskReleaseUnits,
    };
    const nextTasks = tasksRef.current.map(existing =>
      existing.Id === task.Id
        ? {
            ...existing,
            ...task,
          }
        : existing
    );
    syncTasks(nextTasks);
    setFilteredTasks(
      (currentGate === "all" || !currentGate)
        ? nextTasks
        : FilterTasks(nextTasks, "gate", currentGate)
    );
    setSelectedTask(task);

    // ── Auto-register release when task reaches 100% and isRelease is flagged ──
    if (taskIsRelease && task.Complete === 100 && config.projectName && taskReleaseUnits && taskReleaseUnits > 0) {
      const release: IReleaseRecord = {
        id:         `release-task-${task.Id}`,   // stable — idempotent via upsertReleaseRecord
        date:       new Date().toISOString(),
        units:      taskReleaseUnits,
        approvedBy: context.pageContext?.user?.displayName ?? 'Unknown',
        taskId:     task.Id,
        taskTitle:  task.Task ?? task.Id,
      };
      onRegisterRelease(release).catch(err =>
        console.error('[useProjectState] Auto-release registration failed', err)
      );
    }
  }, [config.sourceName, config.projectName, context, sp, withAvailableTaskFields, onRegisterRelease, syncTasks, currentGate]);

  const _updatePlannerTask = useCallback(async (
    data: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    action: "quick-complete" | "full-update",
    completeSafe?: number
  ): Promise<void> => {
    const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);
    const finishValue = completeSafe === 100 && !data.Finish ? new Date() : data.Finish;
    if (action === "quick-complete") {
      await plannerService.updateTaskStatus({
        taskId: data.Id,
        percentComplete: completeSafe,
        finish: finishValue,
        evidenceUrl: data.EvidenceOfCompletion?.Url,
        evidenceDesc: data.EvidenceOfCompletion?.Description,
      });
    } else {
      await plannerService.updateTaskFull({
        Id: data.Id,
        Description: data.Description,
        Complete: completeSafe,
        EvidenceOfCompletion: {
          Url: data.EvidenceOfCompletion?.Url,
          Description: data.EvidenceOfCompletion?.Description,
        },
        Start: data.Start,
        Finish: finishValue,
      });
    }
  }, [context]);

  const onUpdateTask = useCallback(async (
    taskName: string,
    action: "quick-complete" | "full-update",
    payloadJson?: string
  ): Promise<void> => {
    if (!payloadJson) return;
    try {
      const data = JSON.parse(payloadJson) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const completeSafe =
        typeof data.Complete === "number"
          ? data.Complete
          : Number.isFinite(Number(data.Complete))
            ? Number(data.Complete)
            : undefined;

      if (config.isPlanner) {
        await _updatePlannerTask(data, action, completeSafe);
      } else {
        await _updateListTask(data, action, completeSafe);
      }

      const touchesReleaseBlob =
        action === "full-update" &&
        (
          typeof data?.jsonTable === "string" ||
          typeof data?.Description === "string" ||
          Object.prototype.hasOwnProperty.call(data ?? {}, "isRelease") ||
          Object.prototype.hasOwnProperty.call(data ?? {}, "releaseUnits")
        );
      const requiresReload = action === "quick-complete" || data?.renameGate === true || touchesReleaseBlob;

      if (requiresReload) {
        await new Promise<void>(resolve => setTimeout(resolve, 650));
        await onReset();
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      MessageLog(`[onUpdateTask] Error: ${error.message}`, "error");
      throw error;
    }
  }, [config.isPlanner, _updatePlannerTask, _updateListTask, onReset]);

  // ── Create new project ────────────────────────────────────────────────────
  const _ensureTextField = useCallback(async (list: IList, name: string) => {
    const fields = await list.fields.select("InternalName")();
    const exists = fields.some((f: any) => f.InternalName === name); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!exists) await list.fields.addText(name);
  }, []);

  const _ensureNumberField = useCallback(async (list: IList, name: string) => {
    const fields = await list.fields.select("InternalName")();
    const exists = fields.some((f: any) => f.InternalName === name); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!exists) await list.fields.addNumber(name);
  }, []);

  const _ensureDateField = useCallback(async (list: IList, name: string) => {
    const fields = await list.fields.select("InternalName")();
    const exists = fields.some((f: any) => f.InternalName === name); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!exists) await list.fields.addDateTime(name);
  }, []);

  const _ensureMultilineField = useCallback(async (list: IList, name: string) => {
    const fields = await list.fields.select("InternalName")();
    const exists = fields.some((f: any) => f.InternalName === name); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!exists) await list.fields.addMultilineText(name);
  }, []);

  const _ensureDefaultViewFields = useCallback(async (list: IList, fieldInternalNames: string[]) => {
    const view = await list.defaultView;
    const viewFieldsResult = await view.fields.select("Items")();
    const currentFields: string[] = (viewFieldsResult as any).Items?.results || (viewFieldsResult as any).Items || []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const current = new Set<string>(currentFields);
    const toAdd = fieldInternalNames.filter(f => !current.has(f));
    for (const field of toAdd) {
      await view.fields.add(field);
    }
  }, []);

  const _ensureTaskList = useCallback(async (listTitle: string): Promise<void> => {
    const web = sp.web;
    const ensureResult = await web.lists.ensure(listTitle, "Project tasks list", 100, true);
    const list: IList = ensureResult.list;

    await _ensureTextField(list, "Gate");
    await _ensureTextField(list, "Task");
    await _ensureNumberField(list, "Complete");
    await _ensureDateField(list, "Start");
    await _ensureDateField(list, "Finish");
    await _ensureDateField(list, "ActualFinish");

    // Log fields — multiline text storing JSON arrays
    await _ensureMultilineField(list, "Notes");
    await _ensureMultilineField(list, "Evidence");
    await _ensureMultilineField(list, "Approvals");
    await _ensureMultilineField(list, "jsonTable");

    await _ensureDefaultViewFields(list, ["Title","Gate","Task","Complete","Start","Finish","ActualFinish"]);
  }, [sp, _ensureTextField, _ensureNumberField, _ensureDateField, _ensureMultilineField, _ensureDefaultViewFields]);

  const _ensureEvidenceRepository = useCallback(async (repositoryName: string): Promise<void> => {
    const siteUrl          = config.storageEndpoint?.siteUrl ?? SITE_URL;
    const siteRelativePath = config.storageEndpoint?.siteRelPath ?? context.pageContext.web.serverRelativeUrl;
    const evidenceLib      = config.storageEndpoint?.evidenceLibrary ?? REPOSITORY_URL;
    const evidenceBase     = config.storageEndpoint?.evidenceBasePath ?? undefined;
    const folderName       = repositoryName || REPOSITORY_NAME_DEFAULT;
    await ensureFolder(context.spHttpClient, siteUrl, siteRelativePath, evidenceLib, folderName, evidenceBase);
  }, [context, config.storageEndpoint]);

  const _createInitialTask = useCallback(async (listTitle: string, gate: string): Promise<void> => {
    const today = new Date();
    const nextWbs = await _getNextWbsForGate(listTitle, gate || "Gate 1");

    const addResult: any = await sp.web.lists.getByTitle(listTitle).items.add(withAvailableTaskFields({ // eslint-disable-line @typescript-eslint/no-explicit-any
      Gate: gate || "Gate 1",
      Title: nextWbs,
      Task: (gate || "Gate 1") + ". Task",
      Start: today.toISOString(),
      Finish: today.toISOString(),
      Complete: 0
    }));

    const addedId = addResult.Id as number | undefined;
    if (!addedId) return;

    const r: any = await sp.web.lists.getByTitle(listTitle).items.getById(addedId)(); // eslint-disable-line @typescript-eslint/no-explicit-any

    const task: ITaskListItem = {
      Id: String(r.Id),
      Gate: r.Gate ?? gate,
      Task: r.Task ?? "New task",
      Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
      Start: r.Start ? new Date(r.Start) : today,
      Finish: r.Finish ? new Date(r.Finish) : today,
      ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
      Title: r.Title ?? nextWbs
    };
    setSelectedTask(task);
  }, [sp, _getNextWbsForGate, withAvailableTaskFields]);

  const _importTasksFromExcel = useCallback(async (
    listName: string,
    file: File,
    defaultGate?: string
  ): Promise<void> => {
    const XLSX = await import(/* webpackChunkName: "xlsx" */ "xlsx");
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true, cellText: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!rows.length) { alert("Excel plan is empty."); return; }

    const requiredCols = ["Gate", "Task", "Complete", "Finish"];
    const headers = Object.keys(rows[0]);
    const missing = requiredCols.filter(c => !headers.includes(c));
    if (missing.length > 0) {
      alert("Excel template missing required columns: " + missing.join(", ") + "\nPlease include at least: " + requiredCols.join(", "));
      return;
    }

    const list = sp.web.lists.getByTitle(listName);
    for (const row of rows) {
      const gate = row.Gate || defaultGate || "0. New Gate";
      const taskTitle = row.Task;
      if (!taskTitle) continue;

      const toIso = (v: any): string | undefined => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!v) return undefined;
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d.toISOString();
      };

      const complete = row.Complete !== undefined && row.Complete !== "" ? Number(row.Complete) || 0 : 0;
      if (complete < 0 || complete > 100) { console.warn("Skipping row: invalid Complete value", row); continue; }

      const nextWbs = await _getNextWbsForGate(listName, gate);
      await list.items.add(withAvailableTaskFields({
        Gate: gate,
        Task: taskTitle,
        Title: nextWbs,
        Complete: complete,
        Start: toIso(row.Start),
        Finish: toIso(row.Finish),
        ActualFinish: toIso(row.ActualFinish)
      }));
    }
  }, [sp, _getNextWbsForGate, withAvailableTaskFields]);

  const onCreateNewProject = useCallback(async (
    listName: string,
    repositoryName: string,
    projectTitle: string,
    firstGate: string,
    mode: "empty" | "from-excel",
    file?: File
  ): Promise<void> => {
    try {
      await _ensureTaskList(listName);
      await _ensureEvidenceRepository(repositoryName);

      if (mode === "from-excel" && file) {
        await _importTasksFromExcel(listName, file, firstGate);
      } else {
        await _createInitialTask(listName, firstGate);
      }

      // Build the SharePoint list URL for the new project
      const list = await sp.web.lists.getByTitle(listName).select("DefaultViewUrl")();
      const webUrl = context.pageContext.web.absoluteUrl.replace(/\/+$/, "");
      const projectUrl = `${webUrl.replace(context.pageContext.web.serverRelativeUrl, "")}${list.DefaultViewUrl}`;

      // No WebPart properties to patch — catalog is the source of truth

      // Load the new project
      const newProject = buildProjectInfo(projectTitle, listName, false, projectUrl);
      setCurrentGate(firstGate);
      await _loadData(newProject, firstGate);
    } catch (error) {
      console.error("[onCreateNewProject] Error:", error);
      MessageLog(`[onCreateNewProject] Error: ${error}`, "onCreateNewProject", MSG_ERROR, showLog);
    }
  }, [
    _ensureTaskList, _ensureEvidenceRepository, _importTasksFromExcel, _createInitialTask,
    sp, context, showLog, _loadData
  ]);

  // ── Log field save ─────────────────────────────────────────────────────────

  const onSaveLogField = useCallback(async (
    taskId: string,
    field: 'Notes' | 'Evidence' | 'Approvals',
    entries: unknown[]
  ): Promise<void> => {
    const listTitle = config.sourceName;
    const value = JSON.stringify(entries);
    const tryUpdate = async (): Promise<void> => {
      await sp.web.lists.getByTitle(listTitle).items.getById(Number(taskId)).update({ [field]: value });
    };
    const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    try {
      try {
        await tryUpdate();
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (String(err?.message ?? err).includes("409")) {
          console.warn("[useProjectState] Save conflict detected, retrying log field update", {
            listTitle,
            taskId,
            field,
          });
          await wait(450);
          await tryUpdate();
        } else {
          throw err;
        }
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error("[useProjectState] SharePoint update failed", {
        listTitle,
        taskId,
        field,
        error: err,
      });
      // If the column does not exist, create it and retry once
      if (logFieldsAvailableRef.current === false || String(err?.message ?? err).includes('does not exist')) {
        const list = sp.web.lists.getByTitle(listTitle);
        const existing = await list.fields.select('InternalName')();
        for (const f of ['Notes', 'Evidence', 'Approvals']) {
          if (!existing.some((x: any) => x.InternalName === f)) { // eslint-disable-line @typescript-eslint/no-explicit-any
            await list.fields.addMultilineText(f);
          }
        }
        setLogFieldsAvailable(true);
        console.log("[useProjectState] Log fields ensured, retrying update", {
          listTitle,
          taskId,
          field,
        });
        await tryUpdate();
      } else {
        throw err;
      }
    }
    // Update in-memory state so UI reflects the change without reload
    const patchTask = (t: ITaskListItem): ITaskListItem =>
      t.Id === taskId ? { ...t, [field]: entries } : t;
    const nextTasks = tasksRef.current.map(patchTask);
    syncTasks(nextTasks);
    setFilteredTasks(current =>
      current.map(patchTask)
    );
    setSelectedTask(prev => (prev?.Id === taskId ? { ...prev, [field]: entries } : prev));

  }, [config.sourceName, sp, syncTasks, setLogFieldsAvailable]);

  // ── Send email via Graph ────────────────────────────────────────────────────
  const onSendEmail = useCallback(async (
    to: string[],
    subject: string,
    body: string
  ): Promise<void> => {
    try {
      const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient('3');
      await graphClient.api('/me/sendMail').post({
        message: {
          subject,
          body: { contentType: 'HTML', content: body },
          toRecipients: to.map(address => ({ emailAddress: { address } }))
        },
        saveToSentItems: false
      });
    } catch (error) {
      console.error('[onSendEmail] Failed to send email:', error);
    }
  }, [context]);

  // ── Search users via Graph ──────────────────────────────────────────────────
  const onSearchUsers = useCallback(async (
    query: string
  ): Promise<{ displayName: string; email: string }[]> => {
    try {
      const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient('3');
      const q = query.replace(/'/g, "''");
      const response = await graphClient.api('/users')
        .filter(`startsWith(displayName,'${q}') or startsWith(mail,'${q}')`)
        .select('displayName,mail')
        .top(8)
        .get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (response.value || []).map((u: any) => ({
        displayName: u.displayName || u.mail || '',
        email: u.mail || ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })).filter((u: any) => !!u.email);
    } catch (err) {
      console.error('[onSearchUsers] Failed:', err);
      return [];
    }
  }, [context]);

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    tasks,
    gates,
    filteredTasks,
    selectedTask,
    currentGate,
    sysError,
    showNewProjectSetup,
    environmentMessage,
    projectSelected,
    onReset,
    onGateFilterChange,
    onSelectItem,
    onNewTask,
    onDeleteTask,
    onMoveTask,
    onUpdateTask,
    onUploadFile,
    onPopulateAttachements,
    onCreateNewProject,
    setSelectedTask,
    onSaveLogField,
    onSendEmail,
    onSearchUsers,
    onRegisterRelease,
  };
}

