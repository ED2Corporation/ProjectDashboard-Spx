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


export interface ISPLists {
  value: ISPList[];
}

export interface ISPList {
  Title: string;
  Id: string;
}

interface ErrorPageProps {
  project: string;
  errorMsg: string;
}

export default class ProjectDashboardWebPart extends BaseClientSideWebPart<IProjectDashboardWebPartProps> {

  //private _projects: IProjectListItem[] = [];
  private _tasks: ITaskListItem[] = [];
  private _filteredTasks: ITaskListItem[] = [];
  private _selectedTask: ITaskListItem;
  private _gates: IGateListItem[] = [];
  private _environmentMessage: string = '';
  private _projectSelected: IProjectListItem;
  private _sysError: boolean = false;
  private _siteUrl: string = "https://ed2corp.sharepoint.com/sites/ed2team";
  private MsgInfo = 0;
  private MsgError = 2;

  protected async onInit(): Promise<void> {
    this._sysError = false;

    this.context.dynamicDataSourceManager.initializeSource(this);
    //this._projects = await this._getProjectListItems();
    this._projectSelected = this._getProjectInfo(this.properties.projectName);

    await this._onReset();

    return super.onInit();
    //await super.onInit();    
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  public render(): void {

    const progressBar: React.ReactElement<IProjectDashboardProps> = React.createElement(
      ProjectDashboard,
      {
        spGateListItems: this._gates,
        onReset: this._onReset,
        spTaskListItems: this._tasks,
        spFilteredTaskItems: this._filteredTasks,
        onGetTaskListItems: this._onGetTaskListItems,
        onPopulateAttachements: this._onPopulateAttachements,
        selectedTask: this._selectedTask,
        //spProjectListItems: this._projects,
        //onGetProjectListItems: this._onGetProjectListItems,
        //spPlannerListItems: this._plans,
        //onGetPlannerListItems: this._onGetPlannerListItems,
        onSelectItem: this._onSelectedItem,
        onUpdateTask: this._onUpdateTask,

        description: this.properties.description,
        refreshInterval: this.properties.refreshInterval,
        project: this._projectSelected,

        showLog: this.properties.showLog,
        showButtons: this.properties.showButtons,

        filterValue: this.properties.filterValue,

        isDashboard: this.properties.isDashboard,
        environmentMessage: this._environmentMessage,
        hasTeamsContext: !!this.context.sdks.microsoftTeams,
        userDisplayName: this.context.pageContext.user.displayName
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
      ReactDom.render(progressBar, this.domElement);

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
    if (propertyPath === 'projectUrl') {
      if (!newValue.startsWith("https://")) {
        alert("Please, register a valid URL to the SharePoint or Planner.");
        this.properties.projectURL = oldValue; // Restaurar el valor anterior
      }
    }
    if (propertyPath === 'sourceName' && newValue !== oldValue) {
      //if(this.properties.showLog) console.log(`Selected Project Changed: ${newValue}`); // Maneja el evento
      MessageLog(`Selected Project Changed: ${newValue}`, "", this.MsgInfo, this.properties.showLog);
      this.properties.sourceName = newValue; // Actualiza el valor
      await this._onProjectChange(newValue); // Dispara tu función personalizada
      super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
    }
    if (propertyPath === 'projectName' && newValue !== oldValue) {
      //if(this.properties.showLog) console.log(`Selected Project Changed: ${newValue}`); // Maneja el evento
      MessageLog(`Project Name Changed: ${newValue}`, "", this.MsgInfo, this.properties.showLog);
      this.properties.projectName = newValue; // Actualiza el valor
      super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
    }
  }

  /** */
  private _onReset = async (): Promise<void> => {
    this._sysError = false;

    if (this._projectSelected.isPlanner) {
      await this._onGetPlannerListItems();
    } else {
      await this._onGetTaskListItems();
    }

    if (this._tasks.length > 0) {
      await this._onGetGateListItems();
      this._filteredTasks = FilterTasks(this._tasks, "gate", "actual");
    }

    this._selectedTask = this.newTask();
    this.render();
    await this._onPopulateAttachements();

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


  // Método personalizado para manejar el cambio
  private async _onProjectChange(projectName: string): Promise<void> {
    // Aquí puedes agregar la lógica personalizada que necesites ejecutar.
    //if(this.properties.showLog) console.log(`Handling project change: ${projectName}`);
    MessageLog(`Handling project change: ${projectName}`, "_onProjectChange", this.MsgInfo, this.properties.showLog);

    this._projectSelected = this._getProjectInfo(this.properties.projectName);

    if (this._projectSelected.isPlanner) {
      await this._onGetPlannerListItems();
    } else {
      await this._onGetTaskListItems();
    }

    // Ejemplo: Recargar datos específicos según el proyecto
    await this._onReset();
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
    MessageLog(this._projectSelected.Id + " - " + this._projectSelected.Link.Description + " - " + this._projectSelected.Link.Url + " - " + this._projectSelected.ListName + " - " + this._projectSelected.Title + " - " + this._projectSelected.isPlanner, "_getProjectInfo", this.MsgInfo, this.properties.showLog);
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

  private _onUpdateTask = async (
    taskName: string,
    action: "quick-complete" | "full-update",
    payloadJson?: string
  ): Promise<void> => {
    if (!payloadJson) return;

    try {

      const data = JSON.parse(payloadJson) as any;

      const graphClient: MSGraphClientV3 =
        await this.context.msGraphClientFactory.getClient("3");
      const plannerService = new PlannerService(graphClient);

      const completeSafe =
        typeof data.Complete === "number"
          ? data.Complete
          : Number.isFinite(Number(data.Complete)) ? Number(data.Complete) : undefined;

      if (action === "quick-complete") {
        await plannerService.updateTaskStatus({
          taskId: data.Id,
          percentComplete: completeSafe,
          finish: data.Finish,
          evidenceUrl: data.EvidenceOfCompletion?.Url,
          evidenceDesc: data.EvidenceOfCompletion?.Description,
        });
      } else if (action === "full-update") {
        await plannerService.updateTaskFull({
          Id: data.Id,
          Deliverable: data.Deliverable,
          Complete: completeSafe,
          EvidenceOfCompletion: {
            Url: data.EvidenceOfCompletion?.Url,
            Description: data.EvidenceOfCompletion?.Description,
          },
          Start: data.Start,
          Finish: data.Finish,
        });
      }

      await this._onGetPlannerListItems();
      this._onReset();

    } catch (error) {
      console.error("[_onUpdateTask] Error:", error);
      MessageLog(`[_onUpdateTask] Error: ${error.message}`, "error");
    }
  };

  private _onGetTaskListItems = async (): Promise<void> => {
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
        const response = await this.context.spHttpClient.get(
          //this.context.pageContext.web.absoluteUrl + `/_api/web/lists/getbytitle('PlanCascade')/items?$select=Id,Title,Complete,Status,Delay,Deliverable,Tasks,WBS`,
          //this.context.pageContext.web.absoluteUrl + `/_api/web/lists/getbytitle('`+this._projectSelected.ListName+`')/items?$select=Id,Title,Complete,Delay,Deliverable,Task,WBS,Description,Responsible,Start,Finish,Barriers, ActualFinish, Effort, ActionableStatus, EvidenceOfCompletion`,
          this._siteUrl + `/_api/web/lists/getbytitle('` + this._projectSelected.ListName + `')/items?$select=Id,Title,Complete,Deliverable,Task,WBS,Description,Responsible,Start,Finish,Barriers, ActualFinish, Effort, ActionableStatus, EvidenceOfCompletion`,
          SPHttpClient.configurations.v1);

        const responseJson = await response.json();
        const tasks: ITaskListItem[] = responseJson.value as ITaskListItem[];
        //console.log("Project: " + project + " Grouper: "+grouper+" Filter: "+filter);
        if (tasks.length > 0) {
          for (let i = 0; i < tasks.length; i++) {
            tasks[i].Complete = Math.trunc(tasks[i].Complete * 100);
          }
        }
        const sortedItems = [...tasks].sort((a, b) => b.Title.localeCompare(a.Title));

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
          const response: ITaskListItem[] = await this._getTaskListItems();
          this._tasks = response;
        } else {
          if (this._tasks.length > 0) {
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

  private newTask(): ITaskListItem {

    return {
      Id: "",
      Title: "",
      Complete: 0,
      Deliverable: "",
      Task: "No Task Found..."
    };
  }
}
