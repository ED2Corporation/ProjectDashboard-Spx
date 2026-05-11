import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/presets/all";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneCheckbox
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import { IProjectDashboardWebPartProps } from '../../models';
import { ProjectService } from "./services/ProjectService";
import { MessageLog } from './utils/MessageLog';

import ProjectDashboardApp, { IProjectDashboardAppProps } from './components/ProjectDashboardApp';

export default class ProjectDashboardWebPart extends BaseClientSideWebPart<IProjectDashboardWebPartProps> {

  private _sp!: SPFI;
  private _projectService!: ProjectService;

  protected async onInit(): Promise<void> {
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

  protected async onPropertyPaneFieldChanged(propertyPath: string, oldValue: string, newValue: string): Promise<void> {
    super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
    MessageLog(`Property changed: ${propertyPath} → ${newValue}`, "onPropertyPaneFieldChanged");
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
                PropertyPaneTextField('anthropicApiKey', {
                  label: 'Anthropic API Key',
                  description: 'API Key for AI analysis features (Claude)'
                }),
                PropertyPaneCheckbox('showLog', { text: 'Write Log on browser Console...' })
              ]
            }
          ]
        }
      ]
    };
  }

  public get isFullBleed(): boolean {
    return true;
  }
}
