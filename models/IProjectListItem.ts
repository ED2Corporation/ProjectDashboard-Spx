export interface IProjectListItem {
  Id: string;
  Title: string;
  ListName: string,
  RepositoryName: string,
  isPlanner: boolean,
  Link: {
    Url: string,
    Description: string
  }
} 