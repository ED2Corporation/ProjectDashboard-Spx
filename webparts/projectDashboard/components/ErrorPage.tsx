import React from "react";

interface ErrorPageProps {
  project : string;
  errorMsg: string;
  onCreateProject?: () => void;
}

//const Dashboard: React.FC<TaskCardProps> = ({ gates, showDetails }) => {

const ErrorPage: React.FC<ErrorPageProps> = ({ errorMsg, project, onCreateProject }) => {
  return (
    <div className="task-card">
      <div>
        <h1>{`The project ${project} is not defined...`}</h1>
        
      </div>
    </div>
  );
};

export default ErrorPage;