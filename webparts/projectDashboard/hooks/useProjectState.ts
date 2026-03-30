import { useState, useCallback, useEffect, useRef } from 'react';
import { SPFI } from "@pnp/sp";
import { IList } from "@pnp/sp/lists";
import { MSGraphClientV3, SPHttpClient } from '@microsoft/sp-http';
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { ITaskListItem, IGateListItem, IProjectListItem } from '../../../models';
import { IProjectDashboardWebPartProps } from '../../../models';
import { GroupByGate } from '../utils/GroupByGate';
import { FilterTasks } from '../utils/FilterTasks';
import { PlannerService } from '../services/PlannerService';
import { ProjectService } from '../services/ProjectService';
import { MessageLog } from '../utils/MessageLog';
import { compareWbs } from '../utils/ParseWBS';
import { ensureFolder, uploadEvidenceFile } from '../services/UploadService';

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
}

export interface UseProjectStateResult {
  // ── State ──
  tasks: ITaskListItem[];
  gates: IGateListItem[];
  filteredTasks: ITaskListItem[];
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
  onNewTask: (gate: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onUpdateTask: (taskName: string, action: "quick-complete" | "full-update", payloadJson?: string) => Promise<void>;
  onUploadFile: (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;
  onPopulateAttachements: () => Promise<void>;
  onCreateNewProject: (listName: string, repositoryName: string, projectTitle: string, firstGate: string, mode: "empty" | "from-excel", file?: File) => Promise<void>;
  setSelectedTask: (task: ITaskListItem | null) => void;
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
    Deliverable: "",
    Title: "",
    Start: new Date(),
    Finish: new Date(),
    Description: "",
    Task: "No Task Found..."
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useProjectState(config: UseProjectStateConfig): UseProjectStateResult {
  const { context, sp, showLog, onPatchProperties } = config;

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
      const siteRelativePath = context.pageContext.web.serverRelativeUrl;
      const querySelect = `Id,Gate,Task,Deliverable,Complete,Start,Finish,ActualFinish,Description,EvidenceOfCompletion,EvidenceDescription`;
      const queryUrl = SITE_URL + siteRelativePath + `/_api/web/lists/getbytitle('` + project.ListName + `')/items?$select=` + querySelect;

      const response = await context.spHttpClient.get(queryUrl, SPHttpClient.configurations.v1);
      if (!response.ok) {
        const txt = await response.text();
        console.error("[_getTaskListItems] HTTP error:", response.status, txt);
        setSysError(true);
        setEnvironmentMessage(txt);
        return [];
      }
      const responseJson = await response.json();
      const raw: any[] = Array.isArray(responseJson.value) ? responseJson.value : [];  // eslint-disable-line @typescript-eslint/no-explicit-any

      const loaded: ITaskListItem[] = raw.map(r => ({
        Id: String(r.Id),
        Gate: r.Gate ?? "",
        Task: r.Task ?? "",
        Title: r.Title ?? undefined,
        Deliverable: r.Deliverable ?? "",
        Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
        Start: r.Start ? new Date(r.Start) : undefined,
        Finish: r.Finish ? new Date(r.Finish) : undefined,
        ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
        Description: r.Description ?? "",
        EvidenceOfCompletion: r.EvidenceOfCompletion
          ? { Url: r.EvidenceOfCompletion, Description: r.EvidenceDescription ?? "" }
          : undefined,
      }));

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
  }, [context, showLog]);

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
    let currentTasks = tasksRef.current;
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
    const siteRelativePath = context.pageContext.web.serverRelativeUrl;
    const folderPath = REPOSITORY_URL + "/";
    const folderName = config.sourceName.replace(/-List$/, '-Evidence') || REPOSITORY_NAME_DEFAULT;

    const { fileUrl, fileName } = await uploadEvidenceFile(
      context.spHttpClient,
      context,
      SITE_URL.trim(),
      siteRelativePath.trim(),
      folderPath.trim(),
      folderName.trim(),
      file
    );
    return { fileUrl, fileName };
  }, [context, config.sourceName]);

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
  const _createListTask = useCallback(async (gate: string): Promise<void> => {
    const listTitle = config.sourceName;
    const today = new Date();

    const nextWbs = await _getNextWbsForGate(listTitle, gate);

    const addResult: any = await sp.web.lists.getByTitle(listTitle).items.add({ // eslint-disable-line @typescript-eslint/no-explicit-any
      Gate: gate,
      Title: nextWbs,
      Deliverable: gate + ". Deliverable",
      Task: gate + ". Task",
      Start: today.toISOString(),
      Finish: today.toISOString(),
      Complete: 0
    });

    const addedId = addResult.Id as number | undefined;
    if (!addedId) {
      setSelectedTask(makeEmptyTask());
      return;
    }

    const r: any = await sp.web.lists.getByTitle(listTitle).items.getById(addedId) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("Id","Gate","Task","Deliverable","Complete","Start","Finish","ActualFinish","Description","EvidenceOfCompletion","EvidenceDescription","Title")();

    const task: ITaskListItem = {
      Id: String(r.Id),
      Gate: r.Gate ?? gate,
      Task: r.Task ?? "New task",
      Deliverable: r.Deliverable ?? "",
      Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
      Start: r.Start ? new Date(r.Start) : today,
      Finish: r.Finish ? new Date(r.Finish) : today,
      ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
      Description: r.Description ?? "",
      EvidenceOfCompletion: r.EvidenceOfCompletion
        ? { Url: r.EvidenceOfCompletion, Description: r.EvidenceDescription ?? "" }
        : undefined,
      Title: r.Title ?? nextWbs
    };
    setSelectedTask(task);
  }, [config.sourceName, sp, _getNextWbsForGate]);

  const _createPlannerTask = useCallback(async (gate: string): Promise<void> => {
    const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);
    await plannerService.createEmptyTask(projectSelected.Id, gate);
  }, [context, projectSelected]);

  const onNewTask = useCallback(async (gate: string): Promise<void> => {
    try {
      if (config.isPlanner) {
        await _createPlannerTask(gate);
      } else {
        await _createListTask(gate);
      }
      await onReset();
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error("[onNewTask] Error:", error);
      MessageLog(`[onNewTask] Error: ${error.message}`, "error");
    }
  }, [config.isPlanner, _createPlannerTask, _createListTask, onReset]);

  // ── Delete task ────────────────────────────────────────────────────────────
  const _deleteListTask = useCallback(async (itemId: string): Promise<void> => {
    await sp.web.lists.getByTitle(config.sourceName).items.getById(Number(itemId)).delete();
  }, [sp, config.sourceName]);

  const _deletePlannerTask = useCallback(async (taskId: string): Promise<void> => {
    const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);
    await plannerService.deleteTask(taskId);
  }, [context]);

  const onDeleteTask = useCallback(async (taskId: string): Promise<void> => {
    if (!taskId) return;
    try {
      if (config.isPlanner) {
        await _deletePlannerTask(taskId);
      } else {
        await _deleteListTask(taskId);
      }
      await onReset();
      setSelectedTask(null);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      MessageLog(`[onDeleteTask] Error: ${error.message}`, "error");
    }
  }, [config.isPlanner, _deletePlannerTask, _deleteListTask, onReset]);

  // ── Update task ────────────────────────────────────────────────────────────
  const _updateListTask = useCallback(async (
    data: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    action: "quick-complete" | "full-update",
    completeSafe?: number
  ): Promise<void> => {
    const listTitle = config.sourceName;
    const curr = completeSafe ?? data.Complete;
    const actualFinishValue = curr === 100 ? new Date() : null;
    const itemRef = sp.web.lists.getByTitle(listTitle).items.getById(Number(data.Id));

    if (action === "quick-complete") {
      await itemRef.update({
        Task: data.Task,
        Complete: curr,
        Finish: data.Finish,
        ActualFinish: actualFinishValue,
        EvidenceOfCompletion: data.EvidenceOfCompletion?.Url,
        EvidenceDescription: data.EvidenceOfCompletion?.Description
      });
    } else {
      await itemRef.update({
        Deliverable: data.Deliverable,
        Gate: data.Gate,
        Task: data.Task,
        Description: data.Description,
        Complete: curr,
        Start: data.Start,
        Finish: data.Finish,
        EvidenceOfCompletion: data.EvidenceOfCompletion?.Url,
        EvidenceDescription: data.EvidenceOfCompletion?.Description,
        ActualFinish: actualFinishValue
      });
    }

    const r: any = await itemRef.select( // eslint-disable-line @typescript-eslint/no-explicit-any
      "Id","Gate","Task","Deliverable","Complete","Start","Finish","ActualFinish","Description","EvidenceOfCompletion","EvidenceDescription","Title"
    )();

    const task: ITaskListItem = {
      Id: String(r.Id),
      Gate: r.Gate ?? data.Gate,
      Task: r.Task ?? "New task",
      Deliverable: r.Deliverable ?? "",
      Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
      Start: r.Start ? new Date(r.Start) : undefined,
      Finish: r.Finish ? new Date(r.Finish) : undefined,
      ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
      Description: r.Description ?? "",
      EvidenceOfCompletion: r.EvidenceOfCompletion
        ? { Url: r.EvidenceOfCompletion, Description: r.EvidenceDescription ?? "" }
        : undefined,
      Title: r.Title ?? undefined
    };
    setSelectedTask(task);
  }, [config.sourceName, sp]);

  const _updatePlannerTask = useCallback(async (
    data: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    action: "quick-complete" | "full-update",
    completeSafe?: number
  ): Promise<void> => {
    const graphClient: MSGraphClientV3 = await context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);
    if (action === "quick-complete") {
      await plannerService.updateTaskStatus({
        taskId: data.Id,
        percentComplete: completeSafe,
        finish: data.Finish,
        evidenceUrl: data.EvidenceOfCompletion?.Url,
        evidenceDesc: data.EvidenceOfCompletion?.Description,
      });
    } else {
      await plannerService.updateTaskFull({
        Id: data.Id,
        Deliverable: data.Deliverable,
        Description: data.Description,
        Complete: completeSafe,
        EvidenceOfCompletion: {
          Url: data.EvidenceOfCompletion?.Url,
          Description: data.EvidenceOfCompletion?.Description,
        },
        Start: data.Start,
        Finish: data.Finish,
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
      await onReset();
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      MessageLog(`[onUpdateTask] Error: ${error.message}`, "error");
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
    await _ensureTextField(list, "Deliverable");
    await _ensureNumberField(list, "Complete");
    await _ensureDateField(list, "Start");
    await _ensureDateField(list, "Finish");
    await _ensureDateField(list, "ActualFinish");
    await _ensureTextField(list, "Description");
    await _ensureTextField(list, "EvidenceOfCompletion");
    await _ensureTextField(list, "EvidenceDescription");

    await _ensureDefaultViewFields(list, ["Title","Gate","Task","Deliverable","Complete","Start","Finish","ActualFinish"]);
  }, [sp, _ensureTextField, _ensureNumberField, _ensureDateField, _ensureDefaultViewFields]);

  const _ensureEvidenceRepository = useCallback(async (repositoryName: string): Promise<void> => {
    const siteUrl = SITE_URL || context.pageContext.web.absoluteUrl;
    const siteRelativePath = context.pageContext.web.serverRelativeUrl;
    const folderName = repositoryName || REPOSITORY_NAME_DEFAULT;
    await ensureFolder(context.spHttpClient, siteUrl, siteRelativePath, REPOSITORY_URL, folderName);
  }, [context]);

  const _createInitialTask = useCallback(async (listTitle: string, gate: string): Promise<void> => {
    const today = new Date();
    const nextWbs = await _getNextWbsForGate(listTitle, gate || "Gate 1");

    const addResult: any = await sp.web.lists.getByTitle(listTitle).items.add({ // eslint-disable-line @typescript-eslint/no-explicit-any
      Gate: gate || "Gate 1",
      Title: nextWbs,
      Deliverable: (gate || "Gate 1") + ". Deliverable",
      Task: (gate || "Gate 1") + ". Task",
      Start: today.toISOString(),
      Finish: today.toISOString(),
      Complete: 0
    });

    const addedId = addResult.Id as number | undefined;
    if (!addedId) return;

    const r: any = await sp.web.lists.getByTitle(listTitle).items.getById(addedId) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("Id","Gate","Task","Deliverable","Complete","Start","Finish","ActualFinish","Description","EvidenceOfCompletion","EvidenceDescription","Title")();

    const task: ITaskListItem = {
      Id: String(r.Id),
      Gate: r.Gate ?? gate,
      Task: r.Task ?? "New task",
      Deliverable: r.Deliverable ?? "",
      Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
      Start: r.Start ? new Date(r.Start) : today,
      Finish: r.Finish ? new Date(r.Finish) : today,
      ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
      Description: r.Description ?? "",
      EvidenceOfCompletion: r.EvidenceOfCompletion
        ? { Url: r.EvidenceOfCompletion, Description: r.EvidenceDescription ?? "" }
        : undefined,
      Title: r.Title ?? nextWbs
    };
    setSelectedTask(task);
  }, [sp, _getNextWbsForGate]);

  const _importTasksFromExcel = useCallback(async (
    listName: string,
    file: File,
    defaultGate?: string
  ): Promise<void> => {
    const XLSX = await import("xlsx");
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
      await list.items.add({
        Gate: gate,
        Task: taskTitle,
        Title: nextWbs,
        Deliverable: row.Deliverable || "",
        Description: row.Description || "",
        Complete: complete,
        Start: toIso(row.Start),
        Finish: toIso(row.Finish),
        ActualFinish: toIso(row.ActualFinish),
        EvidenceOfCompletion: row.EvidenceOfCompletion || null,
        EvidenceDescription: row.EvidenceDescription || null
      });
    }
  }, [sp, _getNextWbsForGate]);

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
    sp, context, onPatchProperties, showLog, _loadData
  ]);

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
    onUpdateTask,
    onUploadFile,
    onPopulateAttachements,
    onCreateNewProject,
    setSelectedTask,
  };
}
