import * as React from 'react';
import { useState } from 'react';
import { SPFI } from "@pnp/sp";
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from '@microsoft/sp-http';

import { IProjectDashboardWebPartProps } from '../../../models';
import { ProjectService } from '../services/ProjectService';
import { useProjectState } from '../hooks/useProjectState';
import NewProjectSetup from './NewProjectSetup';
import ProjectsCatalogCard from './ProjectsCatalogCard';
import { IProjectCatalogItem } from '../../../models/IProjectService';

// ─── Types ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

export interface IProjectDashboardAppProps {
  context: AnyContext;
  sp: SPFI;
  projectService: ProjectService;
  properties: IProjectDashboardWebPartProps;
  onPatchProperties: (patch: Partial<IProjectDashboardWebPartProps>) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
const ProjectDashboardApp: React.FC<IProjectDashboardAppProps> = (props) => {
  const { context, sp, projectService, properties, onPatchProperties } = props;

  const [showSetup, setShowSetup] = useState(false);

  const { onReset, onCreateNewProject } = useProjectState({
    context,
    sp,
    projectService,
    projectName: "",
    sourceName: "",
    isPlanner: false,
    showLog: properties.showLog,
    onPatchProperties,
  });

  // ── New Project Setup view ────────────────────────────────────────────────
  if (showSetup) {
    return (
      <NewProjectSetup
        defaultProjectName={""}
        onCancel={async () => {
          setShowSetup(false);
          await onReset();
        }}
        onCreate={async (listName, repoName, projectTitle, firstGate, mode, file) => {
          await onCreateNewProject(listName, repoName, projectTitle, firstGate, mode, file);
        }}
        getLastProjectFromCatalog={async () => {
          return projectService.getLastProjectFromCatalog();
        }}
        addProjectToCatalog={async (data: IProjectCatalogItem) => {
          if (data) await projectService.addProjectToCatalog(data);
        }}
        onProjectCreated={() => { setShowSetup(false); }}
      />
    );
  }

  // ── Main Dashboard view ───────────────────────────────────────────────────
  return (
    <ProjectsCatalogCard
      sp={sp}
      context={context}
      onNewProject={() => setShowSetup(true)}
    />
  );
};

export default ProjectDashboardApp;
