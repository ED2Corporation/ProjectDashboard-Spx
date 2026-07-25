import React from "react";
import { IGateListItem, IProjectListItem } from "../../../models";
import { GroupByProject } from "../utils/GroupByProject";
import DoughnutChart from "./Doughnut";

interface DashboardProps {
  gates: IGateListItem[];
  project: IProjectListItem;
}

const Dashboard: React.FC<DashboardProps> = ({ gates, project }) => {
  const summary = GroupByProject(gates);

  return (
    <div className="task-card">
      <a href={project.Link.Url} target="_blank" rel="noreferrer">
        <h3>{project.Title}</h3>
        {gates?.length > 0 ? (
          <div>
            <DoughnutChart gates={gates} complete={summary.Complete} />
          </div>
        ) : (
          <h1>Without info defined for the project...</h1>
        )}
      </a>
    </div>
  );
};

export default Dashboard;
