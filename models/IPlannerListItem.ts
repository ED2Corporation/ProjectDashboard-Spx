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

  // Para tracking/auditoría
  createdDateTime?: string;
  lastModifiedDateTime?: string;

  // De plannerTaskDetails
  description?: string;
  references?: { [key: string]: IPlannerExternalReference }; // para Evidence

  // Metadatos útiles
  hasDescription?: boolean;

  // Para asignaciones
  assignments?: { [key: string]: IPlannerAssignment };

  // Campos locales (no de Planner)
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
