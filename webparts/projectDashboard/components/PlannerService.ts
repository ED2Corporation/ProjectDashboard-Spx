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
      return Object.values(tasks)
        .map((task: IPlannerListItem) => {
          // Extraer la primera referencia si existe
          let evidenceUrl = "";
          let evidenceDesc = "";

          if (task.references && Object.keys(task.references).length > 0) {
            const firstRefUrl = Object.keys(task.references)[0];
            const firstRef = task.references[firstRefUrl];
            evidenceUrl = firstRefUrl;
            evidenceDesc = firstRef.alias || "";
          }

          return {
            Id: task.id,
            Title: this.getBucketNameById(task.bucketId, buckets),
            Complete: task.percentComplete || 0,
            Task: task.title || "",
            Deliverable: task.title || "",
            Description: task.title || "",
            Start: task.startDateTime ? new Date(task.startDateTime) : undefined,
            Finish: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
            ActualFinish: task.completedDateTime ? new Date(task.completedDateTime) : undefined,
            EvidenceOfCompletion: {
              Url: evidenceUrl,
              Description: evidenceDesc
            },
            Effort: GetDelay(
              task.dueDateTime ? new Date(task.dueDateTime) : new Date(),
              task.completedDateTime ? new Date(task.completedDateTime) : new Date()
            ),
          };
        })
        .sort((a, b) => a.Task.localeCompare(b.Task));


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

      console.log("Task with attached files:", filteredTasks);
    }

    return tasks;
  }

  public async updateTaskQuickCompleteBkp(payload: {
    taskId: string;
    percentComplete?: number;
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, percentComplete = 100, evidenceUrl, evidenceDesc } = payload;

    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();

    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete });

    if (!evidenceUrl) return;

    try {
      const details = await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .get();

      const currentRefs = details.references || {};
      const encodedKey = this.encodePlannerReferenceKey(evidenceUrl);

      if (currentRefs[encodedKey]) {
        console.log(`Reference ya existe: ${encodedKey}`);
        return;
      }

      const newReferences: any = { ...currentRefs };
      newReferences[encodedKey] = {
        "@odata.type": "#microsoft.graph.plannerExternalReference",
        alias: evidenceDesc || "Evidence of completion",
        previewPriority: " !",
        type: "Other"
      };

      await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .header("If-Match", details["@odata.etag"])
        .patch({ references: newReferences });

      console.log(`Reference agregada OK: ${taskId}`);
    } catch (error) {
      console.error(`Error updating reference for task ${taskId}:`, error);
      throw error;
    }
  }

  public async updateTaskQuickCompleteBkpOk(payload: {
    taskId: string;
    percentComplete?: number;
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, percentComplete = 100, evidenceUrl, evidenceDesc } = payload;

    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();

    // 1) Actualizar con el percentComplete del dropdown
    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete }); // ← usa el valor del payload

    if (!evidenceUrl) return;

    try {
      const details = await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .get();

      const currentRefs = details.references || {};
      const encodedKey = this.encodePlannerReferenceKey(evidenceUrl);

      if (currentRefs[encodedKey]) {
        console.log(`Reference ya existe: ${encodedKey}`);
        return;
      }

      const newReferences: any = { ...currentRefs };
      newReferences[encodedKey] = {
        "@odata.type": "#microsoft.graph.plannerExternalReference",
        alias: evidenceDesc || "Evidence of completion",
        previewPriority: " !",
        type: "Other"
      };

      await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .header("If-Match", details["@odata.etag"])
        .patch({ references: newReferences });

      console.log(`Reference agregada OK: ${taskId}`);
    } catch (error) {
      console.error(`Error updating reference for task ${taskId}:`, error);
    }
  }

  public stripReadOnlyPlannerRefProps(references: Record<string, any>) {
    const allowed = new Set(["@odata.type", "alias", "previewPriority", "type"]);
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(references || {})) {
      const src = references[key] || {};
      cleaned[key] = {};
      for (const prop of Object.keys(src)) {
        if (allowed.has(prop)) cleaned[key][prop] = src[prop];
      }
      // Asegurar tipo correcto
      if (!cleaned[key]["@odata.type"]) {
        cleaned[key]["@odata.type"] = "#microsoft.graph.plannerExternalReference";
      }
    }
    return cleaned;
  }

  public async updateTaskQuickCompleteOld(payload: {
    taskId: string;
    percentComplete?: number;
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, percentComplete = 100, evidenceUrl, evidenceDesc } = payload;

    // 1) Actualizar % de completado
    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();
    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete });

    // 2) Agregar referencia (si aplica)
    if (!evidenceUrl) return;

    const details = await this.graphClient
      .api(`/planner/tasks/${taskId}/details`)
      .get();

    const encodedKey = this.encodePlannerReferenceKey(evidenceUrl);

    // Si ya existe, salimos
    const exists =
      details.references && Object.prototype.hasOwnProperty.call(details.references, encodedKey);
    if (exists) {
      console.log(`Reference ya existe: ${encodedKey}`);
      return;
    }

    // PATCH parcial: solo la nueva clave
    const patchBody = {
      references: {
        [encodedKey]: {
          "@odata.type": "#microsoft.graph.plannerExternalReference",
          alias: evidenceDesc || "Evidence of completion",
          previewPriority: " !",
          type: "Other"
        }
      }
      // Opcional: si quieres que la tarjeta muestre el enlace como vista previa
      // , puedes añadir: previewType: "reference"
    };

    await this.graphClient
      .api(`/planner/tasks/${taskId}/details`)
      .header("If-Match", details["@odata.etag"])
      // .header("Prefer", "return=representation") // si quieres el objeto actualizado en la respuesta
      .patch(patchBody);

    console.log(`Reference agregada OK: ${taskId}`);
  }

  // Helper: codificación parcial para keys de references en Planner
  private encodePlannerReferenceKey(url: string): string {
    return url
      .replace(/%/g, "%25")
      .replace(/\./g, "%2E")
      .replace(/:/g, "%3A")
      .replace(/@/g, "%40")
      .replace(/#/g, "%23");
    // No codificar las barras "/"
  }

  public async updateTaskQuickComplete(payload: {
    taskId: string;
    percentComplete?: number;
    evidenceUrl?: string;
    evidenceDesc?: string;
    setPreviewAsReference?: boolean;
  }): Promise<void> {
    const {
      taskId,
      percentComplete = 100,
      evidenceUrl,
      evidenceDesc,
      setPreviewAsReference = true
    } = payload;

    try {
      // 1) Actualizar percentComplete
      const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();

      await this.graphClient
        .api(`/planner/tasks/${taskId}`)
        .header("If-Match", task["@odata.etag"])
        .patch({ percentComplete });

      console.log(
        `[updateTaskQuickComplete] Task ${taskId} actualizado a ${percentComplete}%`
      );

      // 2) Si no hay evidencia, terminamos
      if (!evidenceUrl || evidenceUrl.trim() === "") {
        return;
      }

      // 3) Obtener referencias actuales
      let details = await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .get();

      const currentRefs: Record<string, any> = details.references || {};
      const encodedKey = this.encodePlannerReferenceKey(evidenceUrl);

      // 4) Verificar si ya existe (evitar duplicados)
      if (currentRefs[encodedKey]) {
        console.log(
          `[updateTaskQuickComplete] Referencia ya existe: ${encodedKey}`
        );
        return;
      }

      // 5) Construir nuevas referencias (mantener las existentes + añadir la nueva)
      const newReferences: Record<string, any> = {};

      // Copiar referencias existentes (limpias)
      Object.keys(currentRefs).forEach(key => {
        newReferences[key] = {
          "@odata.type": currentRefs[key]["@odata.type"] ||
            "#microsoft.graph.plannerExternalReference",
          alias: currentRefs[key].alias,
          previewPriority: currentRefs[key].previewPriority,
          type: currentRefs[key].type
        };
      });

      // Añadir la nueva referencia
      newReferences[encodedKey] = {
        "@odata.type": "#microsoft.graph.plannerExternalReference",
        alias: evidenceDesc || "Evidence of completion",
        previewPriority: " !",
        type: "Other"
      };

      const patchBody: any = { references: newReferences };

      if (setPreviewAsReference) {
        patchBody.previewType = "reference";
      }

      console.log(
        "[updateTaskQuickComplete] PATCH body:",
        JSON.stringify(patchBody, null, 2)
      );

      // 6) PATCH con reintentos
      try {
        await this.graphClient
          .api(`/planner/tasks/${taskId}/details`)
          .header("If-Match", details["@odata.etag"])
          .patch(patchBody);

        console.log(
          `[updateTaskQuickComplete] Referencias actualizadas OK: ${taskId}`
        );
      } catch (err: any) {
        // Reintentar si ETag desfasado
        if (err?.statusCode === 412 || err?.status === 412) {
          console.warn(
            "[updateTaskQuickComplete] 412 Precondition Failed. Reintentando…"
          );

          details = await this.graphClient
            .api(`/planner/tasks/${taskId}/details`)
            .get();

          await this.graphClient
            .api(`/planner/tasks/${taskId}/details`)
            .header("If-Match", details["@odata.etag"])
            .patch(patchBody);

          console.log(
            `[updateTaskQuickComplete] Reintento exitoso: ${taskId}`
          );
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error(
        `[updateTaskQuickComplete] Error en task ${taskId}:`,
        error
      );
      throw error; // Propagar para que el webpart lo maneje
    }
  }


  public async updateTaskFull(payload: Partial<ITaskListItem> & { Id: string }): Promise<void> {
    const { Id: taskId, Complete, Deliverable, Start, Finish } = payload;

    try {
      const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();

      const patchBody: any = {};

      if (Complete !== undefined) {
        patchBody.percentComplete = Complete;
      }

      if (Deliverable) {
        patchBody.title = Deliverable;
      }

      if (Start) {
        patchBody.startDateTime = new Date(Start).toISOString();
      }

      if (Finish) {
        patchBody.dueDateTime = new Date(Finish).toISOString();
      }

      if (Object.keys(patchBody).length === 0) {
        console.log(`[updateTaskFull] No changes to update: ${taskId}`);
        return;
      }

      console.log("[updateTaskFull] PATCH body:", JSON.stringify(patchBody, null, 2));

      await this.graphClient
        .api(`/planner/tasks/${taskId}`)
        .header("If-Match", task["@odata.etag"])
        .patch(patchBody);

      console.log(`[updateTaskFull] Task updated: ${taskId}`);

    } catch (error) {
      console.error(`[updateTaskFull] Error: ${error}`);
      throw error;
    }
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