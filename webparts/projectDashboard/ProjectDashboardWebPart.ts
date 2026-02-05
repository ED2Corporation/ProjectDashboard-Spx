import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneCheckbox,
  //  PropertyPaneDropdown,
  PropertyPaneToggle
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import { MSGraphClientV3 } from '@microsoft/sp-http';
//import * as MicrosoftGraph from '@microsoft/microsoft-graph-types';

import { PlannerService } from "./components/PlannerService";

import ProjectDashboard from './components/ProjectDashboard';
import ErrorPage from './components/ErrorPage';
import { MessageLog } from './components/MessageLog';

import { GroupByGate, FilterTasks, IProjectDashboardProps } from './components';
import { SPHttpClient } from '@microsoft/sp-http';
import { IProjectListItem, ITaskListItem, IGateListItem, IProjectDashboardWebPartProps } from '../../models';

import { IDynamicDataPropertyDefinition } from '@microsoft/sp-dynamic-data';
import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/presets/all";

interface ErrorPageProps {
  project: string;
  errorMsg: string;
}

export default class ProjectDashboardWebPart extends BaseClientSideWebPart<IProjectDashboardWebPartProps> {

  //private _projects: IProjectListItem[] = [];
  private _tasks: ITaskListItem[] = [];
  private _filteredTasks: ITaskListItem[] = [];
  private _selectedTask?: ITaskListItem | null = null;
  private _gates: IGateListItem[] = [];
  private _environmentMessage: string = '';
  private _projectSelected: IProjectListItem;
  private _sysError: boolean = false;
  private _siteUrl: string = "https://ed2corp.sharepoint.com";
  private _repositoryUrl: string = "/Shared Documents/ProjectsEvidence";
  private _repositoryName: string = "EvidenceRepository";
  private MsgInfo = 0;
  private MsgError = 2;
  private _sp: SPFI;
  private _currentGate: string = "all";

  protected async onInit(): Promise<void> {
    this._sysError = false;

    this.context.dynamicDataSourceManager.initializeSource(this);
    //this._projects = await this._getProjectListItems();
    this._projectSelected = this._getProjectInfo(this.properties.projectName);

    await this._onReset();
    this._sp = spfi().using(SPFx(this.context));
    this._filteredTasks = FilterTasks(this._tasks, "gate", "actual");

    return super.onInit();
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  public render(): void {

    const projectDashboard: React.ReactElement<IProjectDashboardProps> = React.createElement(
      ProjectDashboard,
      {

        description: this.properties.description,
        refreshInterval: this.properties.refreshInterval,
        project: this._projectSelected,
        repositoryName: this.properties.repositoryName,
        projectName: this.properties.projectName,

        showLog: this.properties.showLog,
        showButtons: this.properties.showButtons,
        currentGate: this._currentGate,
        onGateFilterChange: this._onGateFilterChange,
        onCreateNewProject: this._onCreateNewProject,

        filterValue: this.properties.filterValue,

        isDashboard: this.properties.isDashboard,
        isPlanner: this.properties.isPlanner,
        environmentMessage: this._environmentMessage,
        hasTeamsContext: !!this.context.sdks.microsoftTeams,
        userDisplayName: this.context.pageContext.user.displayName,

        spGateListItems: this._gates,
        spTaskListItems: this._tasks,
        spFilteredTaskItems: this._filteredTasks,
        selectedTask: this._selectedTask,

        onReset: this._onReset,
        onPopulateAttachements: this._onPopulateAttachements,
        onSelectItem: this._onSelectedItem,
        onUpdateTask: this._onUpdateTask,
        onDeleteTask: this._onDeleteTask,
        onNewTask: this._onNewTask,
        onUploadFile: this._onUploadFile
      }
    );

    const errorPage: React.ReactElement<ErrorPageProps> = React.createElement(
      ErrorPage,
      {
        project: this.properties.projectName,
        errorMsg: this._environmentMessage
      }
    );

    if (this._sysError) {
      ReactDom.render(errorPage, this.domElement);
    }
    else {
      ReactDom.render(projectDashboard, this.domElement);

    }
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: "ED2 dashboard for internal projects..."
          },
          groups: [
            {
              groupName: "Setup Project",
              groupFields: [

                PropertyPaneToggle('isDashboard', {
                  label: 'Is Dashboard',
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneTextField('projectName', {
                  label: "Project Name:",
                  description: "Define the name to be shown in the header..."
                }),
                PropertyPaneTextField('sourceName', {
                  label: "Source Name:",
                  description: "Register the Plan or List name linked to the project..."
                }),
                PropertyPaneTextField('projectURL', {
                  label: "Project URL:",
                  description: "Register the URL to be opened clicking on project name..."

                }),
                PropertyPaneTextField("repositoryName", {
                  label: "Repository Name",
                  description: "SharePoint folder where evidence files will be uploaded."
                }),
                PropertyPaneToggle('isPlanner', {
                  label: 'Is Planner?',
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('showButtons', {
                  label: 'Show Controls',
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneTextField('description', {
                  label: "Description",
                  description: "Project Description to be shared with user..."
                }),
                PropertyPaneTextField('refreshInterval', {
                  label: 'Refresh Interval'
                }),
                PropertyPaneCheckbox('showLog', {
                  text: 'Write Log on browser Console...'
                })
              ]
            }
          ]
        }
      ]
    };
  }

  /** Dynamic data: to connect with external webpart */
  public getPropertyDefinitions(): ReadonlyArray<IDynamicDataPropertyDefinition> {
    return [
      {
        id: 'filterValue',
        title: 'Filter Value'
      }
    ];
  }

  public getPropertyValue(propertyId: string): string {
    if (propertyId === 'filterValue') {
      return this.properties.filterValue || '';
    }
    return '';
  }

  protected async onPropertyPaneFieldChanged(propertyPath: string, oldValue: string, newValue: string): Promise<void> {
    if (propertyPath === 'projectUrl' && newValue !== oldValue) {
      if (!newValue || !newValue.startsWith("https://")) {
        alert("Please, register a valid URL to the SharePoint or Planner.");
        this.properties.projectURL = oldValue; // Restaurar el valor anterior
      }
    }
    if (propertyPath === 'sourceName' && newValue !== oldValue) {
      //MessageLog(`sourceName Changed: ${newValue}`, "", this.MsgInfo, this.properties.showLog);
      super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
      await this._onProjectChange(this.properties.projectName); // Dispara tu función personalizada
    }
    if (propertyPath === 'projectName' && newValue !== oldValue) {
      //MessageLog(`projectName Changed: ${newValue}`, "", this.MsgInfo, this.properties.showLog);
      super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
      await this._onProjectChange(newValue);
    }
    if (propertyPath === 'repositoryName' && newValue !== oldValue) {
      //MessageLog(`repositoryName Changed: ${newValue}`, "", this.MsgInfo, this.properties.showLog);
      super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
    }
    if (propertyPath === 'isPlanner' && newValue !== oldValue) {
      MessageLog(`isPlanner Changed: ${newValue}`, "", this.MsgInfo, this.properties.showLog);
      super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
      await this._onReset();
    }
    if (propertyPath === 'isDashboard' && newValue !== oldValue) {
      MessageLog(`isDashboard Changed: ${newValue}`, "", this.MsgInfo, this.properties.showLog);
      super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
    }
  }

  /*** New Project ****    */
  private _onGateFilterChange = async (gate: string): Promise<void> => {
    this._currentGate = gate;
    if (this._tasks.length === 0) {
      this._tasks = await this._getTaskListItems();
    }
    if (gate === "all") {
      this._filteredTasks = this._tasks;
    } else {
      this._filteredTasks = FilterTasks(this._tasks, "gate", gate);
    }
    this.render();
  };

  private _onCreateNewProject = async (
    listName: string,
    repositoryName: string,
    projectName: string,
    firstGate: string
  ): Promise<void> => {
    try {
      // 1) Crear lista de tareas si no existe
      await this._ensureTaskList(listName);

      // 2) Crear repositorio (carpeta) para EvidenceOfCompletion
      await this._ensureEvidenceRepository(repositoryName);

      // 3) Crear tarea por defecto
      await this._createInitialTask(listName, firstGate);

      // 4) Actualizar propiedades y recargar datos
      this.properties.sourceName = listName;
      this.properties.repositoryName = repositoryName;
      this.properties.projectName = projectName;
      this.properties.isPlanner = false;
      this._projectSelected = this._getProjectInfo(this.properties.projectName);
      this._currentGate = firstGate;

      await this._onReset();
    } catch (error) {
      console.error("[_onCreateNewProject] Error:", error);
      MessageLog(`[_onCreateNewProject] Error: ${error}`, "_onCreateNewProject", this.MsgError, this.properties.showLog);
    }
  };

  private async _ensureTaskList(listTitle: string): Promise<void> {
    const web = this._sp.web;

    try {
      console.log(`Ensuring task list exists: ${listTitle}`);
      const exists = await web.lists.getByTitle(listTitle).select("Id")().then(() => true).catch(() => false);
      if (exists) return;

      await web.lists.add(listTitle, "Project tasks list", 100, true);
      const list = web.lists.getByTitle(listTitle);

      // Campos mínimos según tu ITaskListItem
      await list.fields.addText("Gate");
      await list.fields.addText("Task");
      await list.fields.addText("Deliverable");
      await list.fields.addNumber("Complete");
      await list.fields.addDateTime("Start");
      await list.fields.addDateTime("Finish");
      await list.fields.addDateTime("ActualFinish");
      await list.fields.addText("Description");
      await list.fields.addText("EvidenceOfCompletion");
      await list.fields.addText("EvidenceDescription");
    } catch (error) {
      console.error("[_ensureTaskList] Error:", error);
      throw error;
    }
  }

  private async _ensureEvidenceRepository(repositoryName: string): Promise<void> {
    try {
      console.log(`Ensuring evidence repository exists: ${repositoryName}`);

      const siteUrl = this._siteUrl || this.context.pageContext.web.absoluteUrl;
      const siteRelativePath = this.context.pageContext.web.serverRelativeUrl; // p.ej. "/sites/ED2-Team"
      const folderPath = this._repositoryUrl;                                  // "/Shared Documents/ProjectsEvidence/"
      const folderName = repositoryName || this._repositoryName;

      const { ensureFolder } = await import("./components/UploadService");
      await ensureFolder(
        this.context.spHttpClient,
        siteUrl,
        siteRelativePath,
        folderPath,
        folderName
      );
    } catch (error) {
      console.error("[_ensureEvidenceRepository] Error:", error);
      throw error;
    }
  }

  private async _createInitialTask(listName: string, gate: string): Promise<void> {
    try {
      console.log(`Creating initial task in list: ${listName} with gate: ${gate}`);
      const today = new Date();

      const addResult: any = await this._sp.web.lists
        .getByTitle(listName)
        .items.add({
          Gate: gate || "Gate 1",
          Deliverable: (gate || "Gate 1") + ". Deliverable",
          Task: (gate || "Gate 1") + ". Task",
          Start: today.toISOString(),
          Finish: today.toISOString(),
          Complete: 0
        });

      const addedId = addResult.Id as number | undefined;
      if (!addedId) return;

      const r: any = await this._sp.web.lists
        .getByTitle(listName)
        .items.getById(addedId)
        .select(
          "Id",
          "Gate",
          "Task",
          "Deliverable",
          "Complete",
          "Start",
          "Finish",
          "ActualFinish",
          "Description",
          "EvidenceOfCompletion",
          "EvidenceDescription"
        )();

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
          ? {
            Url: r.EvidenceOfCompletion,
            Description: r.EvidenceDescription ?? ""
          }
          : undefined,
      };

      this._selectedTask = task;
    } catch (error) {
      console.error("[_createInitialTask] Error:", error);
      throw error;
    }

  }

  /** */
  private _onReset = async (): Promise<void> => {
    this._sysError = false;

    if (this._projectSelected.isPlanner) {
      await this._onGetPlannerListItems();
      await this._onPopulateAttachements();
    } else {
      await this._onGetTaskListItems();
    }

    if (this._tasks.length > 0) {
      await this._onGetGateListItems();
      this._filteredTasks = FilterTasks(this._tasks, "gate", this._currentGate || "actual");
    }
    console.log("[_onReset] Data reset completed. Total tasks: " + this._tasks.length + "\nSelected Task: " + this._selectedTask?.Task);
    this.render();
  }

  private _onGetPlannerListItems = async (): Promise<void> => {

    // Obtener el cliente de Microsoft Graph (versión V3)
    const graphClient: MSGraphClientV3 = await this.context.msGraphClientFactory.getClient("3");

    // Crear una instancia del servicio de Planner
    const plannerService = new PlannerService(graphClient);

    // Obtener los detalles del plan y almacenarlos en _plan
    try {
      //const groupId = await this.getGroupId(); // Obtener el ID del grupo
      //const planName = "PlanCascade";
      //const planId = await plannerService.getPlanId(groupId, planName);
      if (this._projectSelected.ListName.length > 0) {
        const planId = this._projectSelected.ListName;
        const planDetails = await plannerService.getPlanDetails(planId);
        this._tasks = planDetails ? planDetails : [];

        //MessageLog(" Plan: " + planId + " Bucket. " + planDetails[0].Title + " task. " + planDetails[0].Task, "_onGetPlannerListItems", this.MsgInfo, this.properties.showLog);
      } else {
        MessageLog("[_onGetPlannerListItems] Plan : " + this._projectSelected.ListName + " was not found... ", "_onGetPlannerListItems", this.MsgError, this.properties.showLog);
        this._projectSelected = this._getProjectInfo(this.properties.projectName);
      }

    } catch (error) {
      console.error("Error loading plan details:", error);
    }

    //this.render();
  }

  // Updating planner details when project changes
  private async _onProjectChange(projectName: string): Promise<void> {
    MessageLog(`Handling project change: ${projectName}`, "_onProjectChange", this.MsgInfo, this.properties.showLog);

    this._projectSelected = this._getProjectInfo(this.properties.projectName);

    // if (this._projectSelected.isPlanner) {
    //   await this._onGetPlannerListItems();
    // } else {
    //   await this._onGetTaskListItems();
    // }

    // Ejemplo: Recargar datos específicos según el proyecto
    //await this._onReset();
  }

  private _getProjectInfo(planName: string): IProjectListItem {

    let projectInfo: IProjectListItem = {
      Id: this.properties.sourceName,
      Title: this.properties.projectName,
      isPlanner: this.properties.isPlanner,
      RepositoryName: this.properties.repositoryName,
      ListName: this.properties.sourceName,
      Link: { Url: this.properties.projectURL, Description: this.properties.projectName }
    };
    this._projectSelected = projectInfo;
    MessageLog("IsPlanner: " + this._projectSelected.isPlanner + " - " + this._projectSelected.Id + " - " + this._projectSelected.Link.Description + " - " + this._projectSelected.Link.Url + " - " + this._projectSelected.ListName + " - " + this._projectSelected.Title + " - " + this._projectSelected.isPlanner, "_getProjectInfo", this.MsgInfo, this.properties.showLog);
    return projectInfo;

  }

  private _onSelectedItem = async (item: string, group: string): Promise<void> => {

    if (this._tasks.length === 0) {
      this._tasks = await this._getTaskListItems();
    }

    if (group === "task") {
      this._selectedTask = this.findTaskByName(
        this._tasks,
        item
      );
      MessageLog("[_onSelectedItem] Received: Value: " + item + " Group: " + group + " Total: " + this._tasks.length + " Filtered: " + this._selectedTask.Task, "_onSelectedItem", this.MsgInfo, this.properties.showLog);
    }
    this.render();

  }
  ///**** Controllers   */
  private _onUploadFile = async (file: File, taskTitle: string) => {
    try {
      const { uploadEvidenceFile } = await import("./components/UploadService");
      const siteUrl = this._siteUrl || this.context.pageContext.web.absoluteUrl;
      const siteRelativePath = this.context.pageContext.web.serverRelativeUrl
      const folderPath = this._repositoryUrl + "/";
      var folderName = this.properties.repositoryName || this._repositoryName;

      const { fileUrl, fileName } = await uploadEvidenceFile(
        this.context.spHttpClient,
        this.context,
        siteUrl.trim(),
        siteRelativePath.trim(),
        folderPath.trim(),
        folderName.trim(),
        file
      );

      console.log(`File uploaded: ${fileName} -> ${fileUrl}`);
      return { fileUrl, fileName };
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    }
  };

  private _onNewTask = async (
    gate: string
  ): Promise<void> => {
    try {
      //const newTask = this.newTask(gate);

      if (this.properties.isPlanner) {
        await this._createPlannerTask(gate);
      } else {
        await this._createListTask(gate);
      }

      this._onReset();

    } catch (error: any) {
      console.error("[_onNewTask] Error:", error);
      MessageLog(`[_onNewTask] Error: ${error.message}`, "error");
    }
  };

  private _onDeleteTask = async (taskId: string): Promise<void> => {
    if (!taskId) return;

    try {
      if (this.properties.isPlanner) {
        await this._deletePlannerTask(taskId);
      } else {
        await this._deleteListTask(taskId);
      }

      this._onReset();
      this._selectedTask = null;
    } catch (error: any) {
      MessageLog(`[_onDeleteTask] Error: ${error.message}`, "error");
    }
  };


  private _onUpdateTask = async (
    taskName: string,
    action: "quick-complete" | "full-update",
    payloadJson?: string
  ): Promise<void> => {
    if (!payloadJson) return;

    try {
      const data = JSON.parse(payloadJson) as any;

      const completeSafe =
        typeof data.Complete === "number"
          ? data.Complete
          : Number.isFinite(Number(data.Complete))
            ? Number(data.Complete)
            : undefined;

      if (this.properties.isPlanner) {
        await this._updatePlannerTask(data, action, completeSafe);
      } else {
        await this._updateListTask(data, action, completeSafe);
      }

      this._onReset();
    } catch (error: any) {
      MessageLog(`[_onUpdateTask] Error: ${error.message}`, "error");
    }
  };

  ///****** Interaction with Lists */
  // Planner: POST /planner/tasks (Graph) [web:80][web:85]
  // List: POST /_api/web/lists/getbytitle('...')/items [web:87]
  private _createListTask = async (gate: string): Promise<void> => {
    const listTitle = this.properties.sourceName;
    const today = new Date();

    try {
      const addResult: any = await this._sp.web.lists
        .getByTitle(listTitle)
        .items.add({
          Gate: gate,
          Deliverable: gate + ". Deliverable",
          Task: gate + ". Task",
          Start: today.toISOString(),
          Finish: today.toISOString()
        });

      const addedId = addResult.Id as number | undefined; // NO .data
      if (!addedId) {
        console.warn("[_createListTask] No Id on addResult, cannot select new task");
        this._selectedTask = this.newTask();
        return;
      }

      const r: any = await this._sp.web.lists
        .getByTitle(listTitle)
        .items.getById(addedId)
        .select(
          "Id",
          "Gate",
          "Task",
          "Deliverable",
          "Complete",
          "Start",
          "Finish",
          "ActualFinish",
          "Description",
          "EvidenceOfCompletion",
          "EvidenceDescription"
        )();

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
          ? {
            Url: r.EvidenceOfCompletion,
            Description: r.EvidenceDescription ?? ""
          }
          : undefined,
      };

      this._selectedTask = task;
    } catch (error) {
      console.error("[_createListTask] Error creating task:", error);
      throw error;
    }
  };



  private _updateListTask = async (
    data: any,
    action: "quick-complete" | "full-update",
    completeSafe?: number
  ): Promise<void> => {
    const listTitle = this.properties.sourceName;
    const curr = completeSafe ?? data.Complete;
    try {
      const actualFinishValue =
        curr === 100
          ? new Date()
          : null;

      const itemRef = this._sp.web.lists
        .getByTitle(listTitle)
        .items.getById(Number(data.Id));

      // 1) Hacer el update
      if (action === "quick-complete") {
        await itemRef.update({
          Task: data.Task,
          Title: data.Gate + " - " + data.Task,
          Complete: curr,
          Finish: data.Finish,
          ActualFinish: actualFinishValue,
          EvidenceOfCompletion: data.EvidenceOfCompletion?.Url,
          EvidenceDescription: data.EvidenceOfCompletion?.Description
        });
      } else {
        await itemRef.update({
          Deliverable: data.Deliverable,
          Title: data.Gate + " - " + data.Task,
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

      // 2) Leer el item actualizado
      const r: any = await itemRef.select(
        "Id",
        "Gate",
        "Task",
        "Deliverable",
        "Complete",
        "Start",
        "Finish",
        "ActualFinish",
        "Description",
        "EvidenceOfCompletion",
        "EvidenceDescription"
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
          ? {
            Url: r.EvidenceOfCompletion,
            Description: r.EvidenceDescription ?? ""
          }
          : undefined,
      };

      this._selectedTask = task;

    } catch (error) {
      console.error("[_updateListTask] Error updating task:", error);
      throw error;
    }

  };


  // List: DELETE item por ID [web:84][web:87]
  private _deleteListTask = async (itemId: string): Promise<void> => {
    const listTitle = this.properties.sourceName;

    try {
      await this._sp.web.lists
        .getByTitle(listTitle)
        .items
        .getById(Number(itemId))
        .delete();
    } catch (error) {
      console.error("[_deleteListTask] Error deleting task:", error);
      throw error;
    }
  };


  ////****** Interaction with Planner */
  private async _createPlannerTask(gate: string): Promise<void> {
    const graphClient: MSGraphClientV3 =
      await this.context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);

    // Crea tarea vacía en el plan/bucket actual
    const newTaskId = await plannerService.createEmptyTask(
      this._projectSelected.Id,
      gate
    );

    console.log("[_createEmptyPlannerTask] New planner task:", newTaskId);
  }

  private async _deletePlannerTask(taskId: string): Promise<void> {
    const graphClient: MSGraphClientV3 =
      await this.context.msGraphClientFactory.getClient("3");
    const plannerService = new PlannerService(graphClient);

    await plannerService.deleteTask(taskId);

    console.log("[_deletePlannerTask] Deleted planner task:", taskId);
  }

  private _updatePlannerTask = async (
    data: any,
    action: "quick-complete" | "full-update",
    completeSafe?: number
  ): Promise<void> => {
    const graphClient: MSGraphClientV3 =
      await this.context.msGraphClientFactory.getClient("3");
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
  };

  /****** */
  private _onGetTaskListItems = async (): Promise<void> => {
    const response: ITaskListItem[] = await this._getTaskListItems();
    this._tasks = response;

    //this.render();
  }

  private async _getTaskListItems(): Promise<ITaskListItem[]> {

    MessageLog("ProjectName : " + this.properties.projectName, "_getTaskListItems", this.MsgInfo, this.properties.showLog);

    //this._projectSelected = this._getProjectInfo(this.properties.projectName);
    if (this._projectSelected.ListName.length > 0) {
      try {
        const siteRelativePath = this.context.pageContext.web.serverRelativeUrl;
        //, Responsible, Title, Barriers,  Effort, ActionableStatus
        const querySelect = `Id,Gate,Task,Deliverable,Complete,Start,Finish,ActualFinish,Description,EvidenceOfCompletion,EvidenceDescription`;
        const queryUrl = this._siteUrl + siteRelativePath + `/_api/web/lists/getbytitle('` + this._projectSelected.ListName + `')/items?$select=` + querySelect;

        const response = await this.context.spHttpClient.get(queryUrl, SPHttpClient.configurations.v1);
        if (!response.ok) {
          const txt = await response.text();
          console.error("[_getTaskListItems] HTTP error:", response.status, txt);
          this._sysError = true;
          this._environmentMessage = txt;
          return [];
        }
        const responseJson = await response.json();
        const raw: any[] = Array.isArray(responseJson.value) ? responseJson.value : [];

        const tasks: ITaskListItem[] = raw.map(r => ({
          Id: String(r.Id),
          Gate: r.Gate ?? "",
          Task: r.Task ?? "",
          Deliverable: r.Deliverable ?? "",
          Complete: typeof r.Complete === "number" ? r.Complete : Number(r.Complete) || 0,
          Start: r.Start ? new Date(r.Start) : undefined,
          Finish: r.Finish ? new Date(r.Finish) : undefined,
          ActualFinish: r.ActualFinish ? new Date(r.ActualFinish) : undefined,
          Description: r.Description ?? "",
          EvidenceOfCompletion: r.EvidenceOfCompletion
            ? {
              Url: r.EvidenceOfCompletion,
              Description: r.EvidenceDescription ?? ""
            }
            : undefined,
        }));
        const sortedItems = [...tasks].sort((a, b) => b.Gate.localeCompare(a.Gate));

        return sortedItems;
      } catch (error) {
        if (this.properties.showLog) console.error("[_getTaskListItems] Error fetching gate list items:", error);
        //MessageLog("ProjectName : "+ this.properties.projectName,"_getTaskListItems",this.MsgInfo,this.properties.showLog);

        this._sysError = true;
        this._environmentMessage = error;
        return [];
      }
    } else {
      //if(this.properties.showLog) console.error("List not found for:", this.properties.projectName);
      MessageLog("List not found for: " + this.properties.projectName, "_getTaskListItems", this.MsgError, this.properties.showLog);
      this._sysError = true;
      return [];
    }
  }
  // Uploading files to SharePoint document library

  // Retrieving information about attachments for tasks
  private _onPopulateAttachements = async (): Promise<void> => {
    // Obtener el cliente de Microsoft Graph (versión V3)
    const graphClient: MSGraphClientV3 = await this.context.msGraphClientFactory.getClient("3");
    // Crear una instancia del servicio de Planner
    const plannerService = new PlannerService(graphClient);
    this._tasks = await plannerService.populateAttachements(this._tasks);
    this.render();
  }

  private _onGetGateListItems = async (): Promise<void> => {
    this._gates = await this._getGateListItems();

    const gate = this._currentGate || "all";
    if (gate === "all") {
      this._filteredTasks = this._tasks;
    } else {
      this._filteredTasks = FilterTasks(this._tasks, "gate", gate);
    }
    //this.render();
  }

  private async _getGateListItems(): Promise<IGateListItem[]> {
    //const baseUrl = this.getBaseUrl();
    //this._projectSelected = this._getProjectInfo(this.properties.projectName);
    if (this._projectSelected.ListName.length > 0) {
      try {
        if (this._tasks.length === 0) {
          const response: ITaskListItem[] = await this._getTaskListItems();
          this._tasks = response;
        } else {
          if (this._tasks.length > 0) {
            return GroupByGate(this._tasks);
          }
        }
        MessageLog("Gate- List not found for: " + this.properties.projectName, "_getGateListItems", this.MsgError, this.properties.showLog);
        return []; //Error State      
      } catch (error) {
        if (this.properties.showLog) console.error("Error fetching gate list items:", error);
        this._sysError = true;
        this._environmentMessage = error;
        //this.render();  
        return [];
      }
    } else {
      MessageLog("Gate- List not found for: " + this.properties.projectName, "_getGateListItems", this.MsgError, this.properties.showLog);
      this._sysError = true;
      //this.render();  
      return [];
    }

  }

  private findTaskByName(
    taskList: ITaskListItem[],
    taskName: string
  ): ITaskListItem {

    const task = taskList.find((task) => task.Task === taskName);

    if (task !== undefined) {
      MessageLog("Found: " + taskName + " lenght: " + taskList.length + " filter: " + task?.Task, "findTaskByName", this.MsgInfo, this.properties.showLog);
      return task;
    } else {
      MessageLog("Item not found: " + taskName + " Array Count: " + taskList.length, "findTaskByName", this.MsgError, this.properties.showLog);
    }

    return this.newTask();
  }

  private newTask(gate?: string): ITaskListItem {

    return {
      Id: "",
      Gate: gate || "New Gate",
      Complete: 0,
      Deliverable: "",
      Task: "No Task Found..."
    };
  }

}
