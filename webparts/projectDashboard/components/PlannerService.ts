/* eslint-disable require-atomic-updates */
/* eslint-disable guard-for-in */
import { MSGraphClientV3 } from "@microsoft/sp-http";
import { IPlannerListItem, ITaskListItem } from "../../../models";
import { GetDelay } from "./GetDelay";

export interface IPlanItem {
  id: string;
  title: string;
  owner: string;
}

export interface IBucketItem {
  id: string;
  name: string;
}

export interface IAttachements {
  EvidenceOfCompletion: {
    Url: string,
    Description: string
  },
  checklist: {
    isChecked: boolean,
    title: string,
    orderHint: string
  },

}

export class PlannerService {
  private graphClient: MSGraphClientV3;

  constructor(graphClient: MSGraphClientV3) {
    this.graphClient = graphClient;
  }

  // Obtener los detalles de un plan de Planner
  public async getPlanDetails(planId: string): Promise<ITaskListItem[]> {
    try {
      console.log("[getPlanDetails] planId : " + planId);

      if (!planId) {
        throw new Error("Plan not defined");
      }

      // Obtener las tareas del plan
      const bucketsResponse = await this.graphClient
        .api(`/planner/plans/${planId}/buckets`)
        .get();

      const buckets: IBucketItem[] = bucketsResponse.value; // Accede a `value`
      //console.log("[getPlanDetails] buckets:", buckets);

      // Obtener las tareas del plan
      const tasksResponse = await this.graphClient
        .api(`/planner/plans/${planId}/tasks`)
        .get();

      const tasks: IPlannerListItem[] = tasksResponse.value; // Accede a `value`

      /**** */

      /**** */
      // Mapear los datos a la interfaz IPlanListItem
      return Object.values(tasks).map((task: IPlannerListItem) => ({
        Id: task.id,
        Title: this.getBucketNameById(task.bucketId, buckets),
        Complete: task.percentComplete ? task.percentComplete : 0,
        Task: task.title ? task.title : "",
        Deliverable: task.title ? task.title : "",
        Description: task.title ? task.title : "",
        Start: task.startDateTime ? new Date(task.startDateTime) : undefined,
        Finish: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
        EvidenceOfCompletion: { Url: task.attachementUrl || "", Description: task.attachementDescription || "" },
        ActualFinish: task.completedDateTime ? new Date(task.completedDateTime) : undefined,
        Effort: GetDelay(task.dueDateTime ? new Date(task.dueDateTime) : new Date(), task.completedDateTime ? new Date(task.completedDateTime) : new Date()),
      })).sort((a, b) => a.Task.localeCompare(b.Task))
        ;

    } catch (error) {
      console.error("Error fetching plan details:", error);
      throw error;
    }
  }

  public async populateAttachements(tasks: ITaskListItem[]): Promise<ITaskListItem[]> {
    if (tasks.length > 0) {
      const tasksWithAttachments = await Promise.all(
        tasks.map(async (task) => {
          const taskDetails = await this.graphClient
            .api(`/planner/tasks/${task.Id}/details`)
            .get();

          // Verifica si hay archivos adjuntos
          if (taskDetails.references && Object.keys(taskDetails.references).length > 0) {
            const attachments = this.getAttachements(task.Id);
            if ((await attachments).EvidenceOfCompletion?.Description) {
              task.EvidenceOfCompletion = (await attachments).EvidenceOfCompletion;
              task.Checklist = (await attachments).checklist;
              // tasks[i].AttachementUrl = (await attachments).Url;
              // tasks[i].AttachementDescription = (await attachments).Description;
              //console.log(`<a href="${task.EvidenceOfCompletion?.Url}" target="_blank">${task.EvidenceOfCompletion?.Description}</a>`);
              //console.log(`<a href="${tasks[i].AttachementUrl}" target="_blank">${tasks[i].AttachementDescription}</a>`);
            }
          }
          return null;
        })
      );

      // Filtra solo las tareas con adjuntos
      const filteredTasks = tasksWithAttachments.filter((task) => task !== null);

      console.log("Tareas con archivos adjuntos:", filteredTasks);
    }

    return tasks;
  }

  // Update Planner
  public async updateTaskQuickCompleteBkp(payload: {
    taskId: string;
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, evidenceUrl, evidenceDesc } = payload;

    // 1) Leer la tarea actual
    const task1 = await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .get();

    console.log("[updateTaskQuickComplete] before:", task1.percentComplete, task1.completedDateTime);

    // 2) Mandar PATCH con percentComplete = 100
    const updated = await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task1["@odata.etag"])
      .patch({ percentComplete: 100 });

    console.log("[updateTaskQuickComplete] after:", updated.percentComplete, updated.completedDateTime);

    // Regular Flow
    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();
    const details = await this.graphClient.api(`/planner/tasks/${taskId}/details`).get();

    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete: 100 }); // valor fijo

    if (evidenceUrl) {
      const newReferences = { ...(details.references || {}) };
      newReferences[evidenceUrl] = {
        "@odata.type": "microsoft.graph.plannerExternalReference",
        alias: evidenceDesc || "Evidence of completion",
        type: "other",
        previewPriority: " !",
      };

      await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .header("If-Match", details["@odata.etag"])
        .patch({ references: newReferences });
    }
  }

  public async updateTaskQuickComplete(payload: {
    taskId: string;
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, evidenceUrl, evidenceDesc } = payload;
    console.log("[updateTaskQuickComplete] References:", taskId, evidenceUrl, evidenceDesc);

    const task = await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .get();

    console.log("[updateTaskQuickComplete] before:", task.percentComplete, task.completedDateTime);

    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete: 100 });

    // NO intentes leer updated.percentComplete aquí; el PATCH no devuelve la tarea
    console.log("[updateTaskQuickComplete] PATCH sent for task:", taskId);
  }


  public async updateTaskFull(payload: {
    taskId: string;
    percentComplete?: number;
    actualFinish?: string;      // ISO date string (yyyy-MM-dd) desde el UI
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, percentComplete = 100, actualFinish, evidenceUrl, evidenceDesc } = payload;

    // 1) Obtener la tarea actual para leer eTag y valores actuales
    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();
    const taskDetails = await this.graphClient.api(`/planner/tasks/${taskId}/details`).get();

    // 2) Actualizar campos básicos de la tarea
    const patchBody: any = {
      percentComplete,
    };

    if (actualFinish) {
      // completedDateTime espera ISO full (con tiempo); usa fin de día o ahora
      const completedDate = new Date(actualFinish);
      patchBody.completedDateTime = completedDate.toISOString();
    }

    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch(patchBody);

    // 3) Actualizar EvidenceOfCompletion (references) en details, si se envió
    const newReferences = { ...(taskDetails.references || {}) };

    if (evidenceUrl) {
      // Planner usa la URL como clave del diccionario
      newReferences[evidenceUrl] = {
        "@odata.type": "microsoft.graph.plannerExternalReference",
        alias: evidenceDesc || "Evidence of completion",
        type: "other",
        previewPriority: " !", // opcional
        // isPinned: true,      // según necesites
      };
    }

    await this.graphClient
      .api(`/planner/tasks/${taskId}/details`)
      .header("If-Match", taskDetails["@odata.etag"])
      .patch({
        references: newReferences,
      });
  }

  private async getAttachements(taskId: string): Promise<IAttachements> {
    let attachement: IAttachements = {
      EvidenceOfCompletion: {
        Url: "",
        Description: ""
      },
      checklist: {
        isChecked: false,
        title: "",
        orderHint: ""
      },
    }
    const taskDetails = await this.graphClient
      .api(`/planner/tasks/${taskId}/details`)
      .get();

    if (taskDetails.references) {
      const references = taskDetails.references;
      for (const reference in references) {
        attachement.EvidenceOfCompletion.Url = decodeURI(decodeURIComponent(reference)) || ""; // Decodificar la URL
        attachement.EvidenceOfCompletion.Description = references[reference].alias || ""; // Obtener el nombre del archivo        
      }

      // const checklists = taskDetails.checklist;

      // for (const subtask in checklists) {

      //   attachement.checklist.isChecked = checklists[subtask].checklist.isChecked || false; // Decodificar la URL
      //   attachement.checklist.title = checklists[subtask].checklist.title || ""; // Obtener el nombre del archivo        
      //   attachement.checklist.orderHint = checklists[subtask].checklist.orderHint || ""; // Obtener el nombre del archivo        

      //   console.log("[getAttachements]  Attachements: "+ attachement.checklist);
      // }  
      //console.log("[getAttachements] References - " + references.length + " - " + taskId + " ; "+ attachement.Description+ " => " + attachement.Url);

    }
    return attachement || {
      EvidenceOfCompletion: {
        Url: "",
        Description: ""
      },
      checklist: {
        isChecked: false,
        title: "",
        orderHint: ""
      },
    };
  }

  private getBucketNameById(bucketId: string, buckets: IBucketItem[]): string {
    const bucket = buckets.find(b => b.id === bucketId);
    return bucket ? bucket.name : ""; // Devuelve el nombre si lo encuentra, sino undefined
  }

  // Obtener el ID del plan por nombre
  public async getPlanId(groupId: string, planName: string): Promise<string> {
    //console.log("[getPlanId] groupId: "+groupId + " planName:"+planName )

    try {
      const plansResponse = await this.graphClient
        .api(`/groups/${groupId}/planner/plans`)
        .get();

      const plans: IPlanItem[] = plansResponse.value; // Accede a `value`    

      if (plans.length > 0) {
        const plan = plans.find((p: any) => p.title === planName);

        //console.log("[getPlanId] plan: "+plan?.id + " Name: "+plan?.title)
        //ToDo: To Correct Hardcode
        return plan ? plan.id : "";
      } else {
        console.log("[getPlanId] Error fetching plan details...");
        //ToDo: To Correct Hardcode
        return "";
      }

    } catch (error) {
      console.error("[getPlanId] Error fetching plan details:", error);
      throw error;
    }
    return "";
  }
}