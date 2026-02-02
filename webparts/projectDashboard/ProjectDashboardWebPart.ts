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

  protected async onInit(): Promise<void> {
    this._sysError = false;

    this.context.dynamicDataSourceManager.initializeSource(this);
    //this._projects = await this._getProjectListItems();
    this._projectSelected = this._getProjectInfo(this.properties.projectName);

    await this._onReset();
    this._sp = spfi().using(SPFx(this.context));

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

  /** */
  private _onReset = async (): Promise<void> => {
    this._sysError = false;

    console.log("[_onReset] Resetting data...\nActualTask:" + this._selectedTask?.Task);
    if (this._projectSelected.isPlanner) {
      await this._onGetPlannerListItems();
      await this._onPopulateAttachements();
    } else {
      await this._onGetTaskListItems();
    }

    if (this._tasks.length > 0) {
      await this._onGetGateListItems();
      this._filteredTasks = FilterTasks(this._tasks, "gate", "actual");
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
    // Aquí puedes agregar la lógica personalizada que necesites ejecutar.
    //if(this.properties.showLog) console.log(`Handling project change: ${projectName}`);
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
    } else {
      this._filteredTasks = FilterTasks(this._tasks, group, item);
      MessageLog("[_onSelectedItem] Received: Value: " + item + " Group: " + group + " Total: " + this._tasks.length + " Filtered: " + this._filteredTasks.length, "_onSelectedItem", this.MsgInfo, this.properties.showLog);
    }
    //if(this.properties.showLog) console.log("Received: Value: " + item + " Group: " + group+ " Total: "+ response.length + " Filtered: " + this._tasks.length );
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
      //var folderPath = siteRelativePath + this._repositoryUrl + "/" + repoName;

      //console.log(`Uploading file to repository: ${siteUrl + siteRelativePath + folderPath + folderName} for task: ${taskTitle}`);
      // console.log(`siteUrl : ${siteUrl} `);
      // console.log(`siteRelativePath : ${siteRelativePath} `);
      // console.log(`folderPath : ${folderPath} `);
      // console.log(`folderName : ${folderName} `);
      // console.log(`file : ${file.name} `);

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
    console.log("[_onNewTask] Creating new task in gate:", gate);
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
    console.log("[_onDeleteTask] Deleting task:", taskId);

    try {
      if (this.properties.isPlanner) {
        await this._deletePlannerTask(taskId);
      } else {
        await this._deleteListTask(taskId);
      }

      this._onReset();
      this._selectedTask = null;
    } catch (error: any) {
      console.error("[_onDeleteTask] Error:", error);
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
      console.error("[_onUpdateTask] Error:", error);
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

      console.log("[_createListTask] addResult:", addResult);

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

      console.log(`[_createListTask] New List Task created: ${r.Id} - ${r.Task} in Gate: ${r.Gate}`);

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
      console.log(" New Task created for: " + task.Gate + " - " + task.Task);
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
    console.log(`[_updateListTask] Updating List Task: ${data.Task} - Action: ${action} - Complete: ${curr} \n ${data} `);
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

      console.log(`[_updateListTask] List Task updated: ${r.Id} - ${r.Task} in Gate: ${r.Gate}`);

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
      console.log(" Task updated for: " + task.Gate + " - " + task.Task);

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
    //console.log("[_onGetTaskListItems] Fetching task list items...");
    const response: ITaskListItem[] = await this._getTaskListItems();
    this._tasks = response;

    //this.render();
  }

  private async _getTaskListItems(): Promise<ITaskListItem[]> {

    //if(this.properties.showLog) console.log("ProjectName : "+ this.properties.projectName);
    MessageLog("ProjectName : " + this.properties.projectName, "_getTaskListItems", this.MsgInfo, this.properties.showLog);

    //this._projectSelected = this._getProjectInfo(this.properties.projectName);
    if (this._projectSelected.ListName.length > 0) {
      try {
        const siteRelativePath = this.context.pageContext.web.serverRelativeUrl;
        //, Responsible, Title, Barriers,  Effort, ActionableStatus
        const querySelect = `Id,Gate,Task,Deliverable,Complete,Start,Finish,ActualFinish,Description,EvidenceOfCompletion,EvidenceDescription`;
        const queryUrl = this._siteUrl + siteRelativePath + `/_api/web/lists/getbytitle('` + this._projectSelected.ListName + `')/items?$select=` + querySelect;
        console.log("[_getTaskListItems] Fetching tasks from: " + queryUrl);

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
        //console.log(groupedArray);  
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
    //this.render();
  }

  private async _getGateListItems(): Promise<IGateListItem[]> {
    //const baseUrl = this.getBaseUrl();
    //this._projectSelected = this._getProjectInfo(this.properties.projectName);
    if (this._projectSelected.ListName.length > 0) {
      try {
        if (this._tasks.length === 0) {
          console.log("[_getGateListItems] Fetching task list items first... VALIDATE CASE");
          const response: ITaskListItem[] = await this._getTaskListItems();
          this._tasks = response;
        } else {
          if (this._tasks.length > 0) {
            console.log("[_getGateListItems] Grouping tasks by gate...");
            return GroupByGate(this._tasks);
          }
        }
        MessageLog("Gate- List not found for: " + this.properties.projectName, "_getGateListItems", this.MsgError, this.properties.showLog);
        return []; //Error State      
        //console.log(groupedArray);  
      } catch (error) {
        if (this.properties.showLog) console.error("Error fetching gate list items:", error);
        this._sysError = true;
        this._environmentMessage = error;
        //this.render();  
        return [];
      }
    } else {
      //if(this.properties.showLog) console.error("Gate- List not found for: ", this.properties.projectName);
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
    //if(this.properties.showLog) console.log("findTaskByName  taskName: " + taskName+ " lenght: "+ taskList.length + " filter: "+  task?.Task);

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
