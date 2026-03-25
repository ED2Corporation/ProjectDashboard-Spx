import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { IDynamicDataPropertyDefinition } from '@microsoft/sp-dynamic-data';
import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/presets/all";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneCheckbox,
  PropertyPaneToggle
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import { IProjectDashboardWebPartProps } from '../../models';
import { ProjectService } from "./services/ProjectService";
import { buildRepoRelativeUrl } from './services/UploadService';
import { MessageLog } from './utils/MessageLog';

import ProjectDashboardApp, { IProjectDashboardAppProps } from './components/ProjectDashboardApp';

export default class ProjectDashboardWebPart extends BaseClientSideWebPart<IProjectDashboardWebPartProps> {

  private _sp: SPFI;
  private _projectService: ProjectService;
  private _EvidenceFolderServerRelative: string = "";

  private readonly _repositoryUrl: string = "ProjectsEvidence";

  protected async onInit(): Promise<void> {
    this.context.dynamicDataSourceManager.initializeSource(this);

    const siteRelativePath = this.context.pageContext.web.serverRelativeUrl;
    this._EvidenceFolderServerRelative = buildRepoRelativeUrl(siteRelativePath, this._repositoryUrl);

    this._sp = spfi().using(SPFx(this.context));
    this._projectService = new ProjectService(this.context, "Projects");

    return super.onInit();
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  public render(): void {
    const element: React.ReactElement<IProjectDashboardAppProps> = React.createElement(
      ProjectDashboardApp,
      {
        context: this.context as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        sp: this._sp,
        projectService: this._projectService,
        evidenceFolderServerRelative: this._EvidenceFolderServerRelative,
        properties: this.properties,
        onPatchProperties: (patch) => {
          Object.assign(this.properties, patch);
        }
      }
    );
    ReactDom.render(element, this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  /** Dynamic data: connect with external web parts */
  public getPropertyDefinitions(): ReadonlyArray<IDynamicDataPropertyDefinition> {
    return [{ id: 'filterValue', title: 'Filter Value' }];
  }

  public getPropertyValue(propertyId: string): string {
    if (propertyId === 'filterValue') return this.properties.filterValue || '';
    return '';
  }

  protected async onPropertyPaneFieldChanged(propertyPath: string, oldValue: string, newValue: string): Promise<void> {
    if (propertyPath === 'projectUrl' && newValue !== oldValue) {
      if (!newValue || !newValue.startsWith("https://")) {
        alert("Please, register a valid URL to the SharePoint or Planner.");
        this.properties.projectURL = oldValue;
      }
    }
    // For all relevant property changes, call super then re-render.
    // The hook's useEffect reacts to sourceName/projectName/isPlanner changes automatically.
    super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);

    if (['sourceName', 'projectName', 'isPlanner', 'repositoryName', 'isDashboard'].includes(propertyPath)) {
      MessageLog(`Property changed: ${propertyPath} → ${newValue}`, "onPropertyPaneFieldChanged");
      this.render();
    }
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: "ED2 dashboard for internal projects..." },
          groups: [
            {
              groupName: "Setup Project",
              groupFields: [
                PropertyPaneToggle('isDashboard', { label: 'Is Dashboard', onText: 'On', offText: 'Off' }),
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
                PropertyPaneToggle('isPlanner', { label: 'Is Planner?', onText: 'On', offText: 'Off' }),
                PropertyPaneToggle('showButtons', { label: 'Show Controls', onText: 'On', offText: 'Off' }),
                PropertyPaneTextField('description', {
                  label: "Description",
                  description: "Project Description to be shared with user..."
                }),
                PropertyPaneTextField('refreshInterval', { label: 'Refresh Interval' }),
                PropertyPaneCheckbox('showLog', { text: 'Write Log on browser Console...' })
              ]
            }
          ]
        }
      ]
    };
  }
}
