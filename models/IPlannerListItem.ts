export interface IPlannerListItem {
  id: string;
  title: string;
  orderHint: string;
  startDateTime?: string;
  dueDateTime?: string;
  completedDateTime?: string;
  percentComplete?: number;
  priority?: number;
  checklistItemCount?: number;
  activeChecklistItemCount?: number;
  planId: string;
  bucketId: string;

  // For tracking/audit
  createdDateTime?: string;
  lastModifiedDateTime?: string;

  // From plannerTaskDetails
  description?: string;
  references?: { [key: string]: IPlannerExternalReference }; // for Evidence

  // Useful metadata
  hasDescription?: boolean;

  // For assignments
  assignments?: { [key: string]: IPlannerAssignment };

  // Local fields (not from Planner)
  planName?: string;
  bucketName?: string;
}

export interface IPlannerExternalReference {
  "@odata.type"?: string;
  alias?: string;
  previewPriority?: string;
  type?: string;
}

export interface IPlannerAssignment {
  assignedBy?: string;
  assignedDateTime?: string;
  orderHint?: string;
}
