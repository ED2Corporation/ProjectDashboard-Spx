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
  /******** */
  private encodePlannerReferenceKey(url: string): string {
    return url
      .replace(/%/g, "%25")
      .replace(/\./g, "%2E")
      .replace(/:/g, "%3A")
      .replace(/@/g, "%40")
      .replace(/#/g, "%23");
  }

  private isValidHttpUrl(url?: string): boolean {
    if (!url) return false;
    const u = url.trim();
    return /^https?:\/\//i.test(u);
  }

  // ===== Servicio =====
  public async updateTaskQuickComplete(payload: {
    taskId: string;
    percentComplete?: number;
    evidenceUrl?: string;         // Valor de la GUI (puede venir vacío)
    evidenceDesc?: string;
    setPreviewAsReference?: boolean;
  }): Promise<void> {
    const {
      taskId,
      percentComplete = 100,
      evidenceUrl,
      evidenceDesc
    } = payload;

    // 1) Actualizar percentComplete (0–100) en /planner/tasks/{id}
    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();
    const safePercent = Math.max(0, Math.min(100, percentComplete));

    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete: safePercent });

    // 2) Determinar acción de referencias según los 4 casos
    const guiUrl = (evidenceUrl || "").trim();
    const hasGui = this.isValidHttpUrl(guiUrl); // GUI lleno si es http/https válido

    // Leer /details para ETag y refs
    let details = await this.graphClient.api(`/planner/tasks/${taskId}/details`).get();
    const currentRefs: Record<string, any> = details.references || {};
    const plannerKeys = Object.keys(currentRefs);
    const plannerIsEmpty = plannerKeys.length === 0;

    // Caso 1: Planner vacío & GUI vacío → No hacer nada
    if (plannerIsEmpty && !hasGui) {
      console.log(`[updateTaskQuickComplete] Caso #1: no hay nada que insertar o borrar.`);
      return;
    }

    // Preparar PATCH a /details
    const patchReferences: Record<string, any> = {};
    let patchBody: any = undefined;

    if (plannerIsEmpty && hasGui) {
      // Caso 2: insertar nueva URL
      const encodedKey = this.encodePlannerReferenceKey(guiUrl);
      patchReferences[encodedKey] = {
        "@odata.type": "#microsoft.graph.plannerExternalReference",
        alias: evidenceDesc?.trim() || "Evidence of completion",
        previewPriority: " !", // promueve el preview del nuevo enlace
        type: "Other"
      };
      patchBody = { references: patchReferences };

    } else if (!plannerIsEmpty && !hasGui) {
      // Caso 3: eliminar todas las referencias existentes
      for (const key of plannerKeys) patchReferences[key] = null;
      patchBody = { references: patchReferences, previewType: "noPreview" };

    } else if (!plannerIsEmpty && hasGui) {
      // Caso 4: eliminar existentes y sustituir por la nueva
      for (const key of plannerKeys) patchReferences[key] = null;
      const encodedKey = this.encodePlannerReferenceKey(guiUrl);
      patchReferences[encodedKey] = {
        "@odata.type": "#microsoft.graph.plannerExternalReference",
        alias: evidenceDesc?.trim() || "Evidence of completion",
        previewPriority: " !",
        type: "Other"
      };
      patchBody = {
        references: patchReferences,
        previewType: "reference"
      };
    }

    if (!patchBody) {
      // Nada que hacer (defensivo)
      return;
    }

    // 3) Aplicar PATCH a /planner/tasks/{id}/details con manejo de 412
    try {
      await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .header("If-Match", details["@odata.etag"])
        .header("Prefer", "return=representation")
        .patch(patchBody);

      console.log(`[updateTaskQuickComplete] PATCH referencias OK [caso resuelto].`);
    } catch (err: any) {
      // Reintentar si ETag desfasado
      if (err?.statusCode === 412 || err?.status === 412) {
        console.warn(`[updateTaskQuickComplete] 412 Precondition Failed: reintentando con nuevo ETag...`);
        details = await this.graphClient.api(`/planner/tasks/${taskId}/details`).get();

        await this.graphClient
          .api(`/planner/tasks/${taskId}/details`)
          .header("If-Match", details["@odata.etag"])
          .header("Prefer", "return=representation")
          .patch(patchBody);

        console.log(`[updateTaskQuickComplete] Reintento OK.`);
      } else {
        throw err;
      }
    }
  }


  public async updateTaskFull(
    payload: Partial<ITaskListItem> & {
      Id: string;
      Deliverable: string;
      Complete: number;
      Start: string;
      Finish: string;
      EvidenceOfCompletion?: { Url?: string; Description?: string };
      setPreviewAsReference?: boolean;
    }
  ): Promise<void> {
    const {
      Id: taskId,
      Complete,
      Deliverable,
      Start,
      Finish,
      EvidenceOfCompletion,
      setPreviewAsReference = true
    } = payload;

    try {
      // ===========================
      // A) PATCH /planner/tasks/{id}
      // ===========================
      const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();
      const taskPatch: any = {};

      if (Complete !== undefined) {
        // clamp 0–100
        taskPatch.percentComplete = Math.max(0, Math.min(100, Complete));
      }
      if (Deliverable) {
        taskPatch.title = Deliverable;
      }
      if (Start) {
        taskPatch.startDateTime = new Date(Start).toISOString();
      }
      if (Finish) {
        taskPatch.dueDateTime = new Date(Finish).toISOString();
      }

      if (Object.keys(taskPatch).length > 0) {
        await this.graphClient
          .api(`/planner/tasks/${taskId}`)
          .header("If-Match", task["@odata.etag"])
          .patch(taskPatch);
        console.log(`[updateTaskFull] Task updated: ${taskId}`);
      } else {
        console.log(`[updateTaskFull] No changes for /tasks: ${taskId}`);
      }

      // =========================================================
      // B) PATCH /planner/tasks/{id}/details -> 4 casos (Evidence)
      // =========================================================
      // 1) Leer details (ETag + referencias actuales)
      let details = await this.graphClient.api(`/planner/tasks/${taskId}/details`).get();
      const currentRefs: Record<string, any> = details.references || {};
      const plannerKeys = Object.keys(currentRefs);
      const plannerIsEmpty = plannerKeys.length === 0;

      // 2) Valor GUI (puede venir vacío)
      const guiUrlRaw = EvidenceOfCompletion?.Url ?? "";
      const guiUrl = guiUrlRaw.trim();
      const hasGui = this.isValidHttpUrl(guiUrl);

      // 3) Evaluar casos:
      //    1) Planner vacío & GUI vacío -> no hacer nada
      //    2) Planner vacío & GUI lleno -> insertar nueva URL
      //    3) Planner lleno & GUI vacío -> eliminar todas
      //    4) Planner lleno & GUI lleno -> eliminar todas y añadir nueva
      let patchBody: any | undefined;

      if (plannerIsEmpty && !hasGui) {
        console.log(`[updateTaskFull] Evidence: Case #1 (no changes).`);
        // No hacer nada con /details
        return;
      }

      // Construir references para PATCH
      const patchReferences: Record<string, any> = {};

      if (plannerIsEmpty && hasGui) {
        // Caso 2: insertar
        const encodedKey = this.encodePlannerReferenceKey(guiUrl);
        patchReferences[encodedKey] = {
          "@odata.type": "#microsoft.graph.plannerExternalReference",
          alias: (EvidenceOfCompletion?.Description || "Evidence of completion").trim(),
          // Order hint válido para PATCH (o elimina esta línea para que lo calcule el servicio):
          previewPriority: " !",
          type: "Other"
        };
        patchBody = {
          references: patchReferences,
          previewType: setPreviewAsReference ? "reference" : "automatic"
        };
        console.log(`[updateTaskFull] Evidence: Case #2 (new).`);

      } else if (!plannerIsEmpty && !hasGui) {
        // Caso 3: eliminar todas
        for (const key of plannerKeys) patchReferences[key] = null;
        patchBody = {
          references: patchReferences,
          previewType: "noPreview"
        };
        console.log(`[updateTaskFull] Evidence: Case #3 (delete).`);

      } else if (!plannerIsEmpty && hasGui) {
        // Caso 4: reemplazar (eliminar todas y añadir nueva)
        for (const key of plannerKeys) patchReferences[key] = null;
        const encodedKey = this.encodePlannerReferenceKey(guiUrl);
        patchReferences[encodedKey] = {
          "@odata.type": "#microsoft.graph.plannerExternalReference",
          alias: (EvidenceOfCompletion?.Description || "Evidence of completion").trim(),
          previewPriority: " !",
          type: "Other"
        };
        patchBody = {
          references: patchReferences,
          previewType: setPreviewAsReference ? "reference" : "automatic"
        };
        console.log(`[updateTaskFull] Evidence: Case #4 (replace).`);
      }

      if (!patchBody) {
        // Defensivo
        return;
      }

      //console.log("[updateTaskFull] PATCH /details body:", JSON.stringify(patchBody, null, 2));

      try {
        await this.graphClient
          .api(`/planner/tasks/${taskId}/details`)
          .header("If-Match", details["@odata.etag"])
          .header("Prefer", "return=representation")
          .patch(patchBody);
        console.log(`[updateTaskFull] Details updated: ${taskId}`);
      } catch (err: any) {
        // Si hay 412 (ETag desfasado), reintenta una vez
        if (err?.statusCode === 412 || err?.status === 412) {
          console.warn("[updateTaskFull] 412 on /details. Retrying with fresh ETag…");
          details = await this.graphClient.api(`/planner/tasks/${taskId}/details`).get();
          await this.graphClient
            .api(`/planner/tasks/${taskId}/details`)
            .header("If-Match", details["@odata.etag"])
            .header("Prefer", "return=representation")
            .patch(patchBody);
          console.log(`[updateTaskFull] Details retry OK: ${taskId}`);
        } else {
          throw err;
        }
      }
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