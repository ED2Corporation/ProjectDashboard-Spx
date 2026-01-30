/* eslint-disable require-atomic-updates */
/* eslint-disable guard-for-in */
import { MSGraphClientV3 } from "@microsoft/sp-http";
import { IPlannerListItem, ITaskListItem } from "../../../models";
import { GetDelay } from "./GetDelay";
import { toUtcIso } from "./DateUtils"

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
      if (!planId) throw new Error("Plan not defined");

      const bucketsResponse = await this.graphClient
        .api(`/planner/plans/${planId}/buckets`)
        .get();
      const buckets: IBucketItem[] = bucketsResponse.value;

      const tasksResponse = await this.graphClient
        .api(`/planner/plans/${planId}/tasks`)
        .get();
      const tasks: IPlannerListItem[] = tasksResponse.value;

      // Fetch /details for each task in parallel (be mindful of throttling for very large plans)
      const list: ITaskListItem[] = await Promise.all(
        tasks.map(async (t) => {
          let details: any = undefined;
          try {
            details = await this.graphClient.api(`/planner/tasks/${t.id}/details`).get();
          } catch (err) {
            console.warn(`[getPlanDetails] Could not fetch details for ${t.id}`, err);
          }
          return this.mapPlannerToTaskItem(t, buckets, details);
        })
      );

      return list.sort((a, b) => a.Task.localeCompare(b.Task));
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

  public async updateTaskStatus(payload: {
    taskId: string;
    percentComplete?: number;
    finish?: string;                 // make it optional for flexibility
    evidenceUrl?: string;
    evidenceDesc?: string;
    setPreviewAsReference?: boolean;
  }): Promise<void> {
    const {
      taskId,
      percentComplete,
      finish,
      evidenceUrl,
      evidenceDesc,
      setPreviewAsReference = true,
    } = payload;

    await this.updateFromTaskItem(
      {
        Id: taskId,
        Complete: percentComplete,
        Finish: finish,
        EvidenceOfCompletion: (evidenceUrl || evidenceDesc)
          ? { Url: evidenceUrl || "", Description: evidenceDesc || "" }
          : undefined,
      },
      {
        evidenceMode: evidenceUrl ? "replace" : "ignore",
        setPreviewAsReference,
      }
    );
  }

  public async updateTaskFull(
    payload: Partial<ITaskListItem> & {
      Id: string;
      Deliverable?: string;
      Description?: string;
      Complete?: number;
      Start?: string | Date;
      Finish?: string | Date;
      ActualFinish?: string | Date;
      EvidenceOfCompletion?: { Url?: string; Description?: string };
      setPreviewAsReference?: boolean;
    }
  ): Promise<void> {
    const {
      Id,
      Deliverable,
      Complete,
      Start,
      Finish,
      ActualFinish,
      EvidenceOfCompletion,
      setPreviewAsReference = true,
      Description,
    } = payload;

    await this.updateFromTaskItem(
      {
        Id,
        Deliverable,
        Complete,
        Start,
        Finish,
        ActualFinish,
        EvidenceOfCompletion,
        Description,
      },
      {
        evidenceMode: EvidenceOfCompletion?.Url ? "replace" : "ignore",
        setPreviewAsReference,
      }
    );
  }

  public async createEmptyTask(planId: string, bucketId: string): Promise<string> {
    const body = {
      planId,
      bucketId,
      title: "New task"
    };

    const task = await this.graphClient
      .api("/planner/tasks")
      .version("v1.0")
      .post(body); // Crea plannerTask básico [web:88][web:89]

    return task.id as string;
  }

  public async deleteTask(taskId: string): Promise<void> {
    if (!taskId) {
      throw new Error("deleteTask requires taskId");
    }

    // 1) Leer la tarea para obtener el ETag
    const task = await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .version("v1.0")
      .get();

    const etag = task["@odata.etag"];
    if (!etag) {
      throw new Error(`No ETag found for planner task ${taskId}`);
    }

    // 2) Borrar usando If-Match [web:86][web:83]
    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .version("v1.0")
      .header("If-Match", etag)
      .delete();
  }


  // Helper local y seguro
  private hasKeys = (o: any): boolean => !!o && typeof o === "object" && Object.keys(o).length > 0;

  /**
   * Single entry point to update a Planner task (task + details).
   * Accepts generic task fields. Start/Finish/ActualFinish can be string (YYYY-MM-DD or ISO) or Date.
   */
  public async updateFromTaskItem(
    item: {
      Id: string;
      Deliverable?: string;
      Complete?: number;
      Start?: string | Date;
      Finish?: string | Date;
      ActualFinish?: string | Date;
      Description?: string; // Notes
      EvidenceOfCompletion?: { Url?: string; Description?: string };
    },
    options?: {
      evidenceMode?: "ignore" | "merge" | "replace" | "clear";
      setPreviewAsReference?: boolean;
    }
  ): Promise<void> {
    const evidenceMode = options?.evidenceMode ?? "merge";
    const setPreviewAsReference = options?.setPreviewAsReference ?? true;

    // 1) Read current task & details (ETags)
    const task = await this.graphClient.api(`/planner/tasks/${item.Id}`).get();
    let details = await this.graphClient.api(`/planner/tasks/${item.Id}/details`).get();

    // 2) Build task patch
    const taskPatch: any = {};

    if (typeof item.Complete === "number") {
      taskPatch.percentComplete = Math.max(0, Math.min(100, item.Complete));
    }
    if (item.Deliverable) {
      taskPatch.title = item.Deliverable;
    }

    // Dates → normalize using toUtcIso (timezone-safe)
    const normalize = (v?: string | Date) =>
      v ? toUtcIso(v instanceof Date ? v.toISOString() : v) : null;

    const startIso = normalize(item.Start);
    const dueIso = normalize(item.Finish);
    const completedIso = normalize(item.ActualFinish);

    if (startIso) taskPatch.startDateTime = startIso;
    if (dueIso) taskPatch.dueDateTime = dueIso;
    if (completedIso) taskPatch.completedDateTime = completedIso;

    if (this.hasKeys(taskPatch)) {
      await this.graphClient
        .api(`/planner/tasks/${item.Id}`)
        .header("If-Match", task["@odata.etag"])
        .patch(taskPatch);
      console.log(`[updateFromTaskItem] /tasks updated: ${item.Id}`);
    } else {
      console.log(`[updateFromTaskItem] No changes for /tasks: ${item.Id}`);
    }

    // 3) Build details patch (description + references)
    const detailsPatch: any = {};

    if (typeof item.Description === "string") {
      detailsPatch.description = item.Description;
    }

    // references (Evidence of completion)
    const currentRefs: Record<string, any> = details.references || {};
    const currentKeys = Object.keys(currentRefs);

    const urlRaw = item.EvidenceOfCompletion?.Url ?? "";
    const url = (urlRaw || "").trim();
    const hasGui = this.isValidHttpUrl(url);

    if (evidenceMode === "ignore") {
      // do nothing
    } else if (evidenceMode === "clear") {
      if (currentKeys.length > 0) {
        const refs: Record<string, any> = {};
        for (const k of currentKeys) refs[k] = null;
        detailsPatch.references = refs;
        detailsPatch.previewType = "noPreview";
      }
    } else if (evidenceMode === "merge") {
      if (hasGui) {
        const encoded = this.encodePlannerReferenceKey(url);
        const clean = this.stripReadOnlyPlannerRefProps(currentRefs);
        if (!clean[encoded]) {
          clean[encoded] = {
            "@odata.type": "#microsoft.graph.plannerExternalReference",
            alias: (item.EvidenceOfCompletion?.Description || "Evidence of completion").trim(),
            previewPriority: " !",
            type: "Other"
          };
          detailsPatch.references = clean;
          if (setPreviewAsReference) detailsPatch.previewType = "reference";
        }
      }
    } else if (evidenceMode === "replace") {
      const refs: Record<string, any> = {};
      for (const k of currentKeys) refs[k] = null;

      if (hasGui) {
        const encoded = this.encodePlannerReferenceKey(url);
        refs[encoded] = {
          "@odata.type": "#microsoft.graph.plannerExternalReference",
          alias: (item.EvidenceOfCompletion?.Description || "Evidence of completion").trim(),
          previewPriority: " !",
          type: "Other"
        };
        detailsPatch.references = refs;
        detailsPatch.previewType = setPreviewAsReference ? "reference" : "automatic";
      } else {
        detailsPatch.references = refs;
        detailsPatch.previewType = "noPreview";
      }
    }

    if (this.hasKeys(detailsPatch)) {
      try {
        await this.graphClient
          .api(`/planner/tasks/${item.Id}/details`)
          .header("If-Match", details["@odata.etag"])
          .header("Prefer", "return=representation")
          .patch(detailsPatch);
        console.log(`[updateFromTaskItem] /details updated: ${item.Id}`);
      } catch (err: any) {
        if (err?.statusCode === 412 || err?.status === 412) {
          console.warn("[updateFromTaskItem] 412 on /details. Retrying with fresh ETag…");
          details = await this.graphClient.api(`/planner/tasks/${item.Id}/details`).get();
          await this.graphClient
            .api(`/planner/tasks/${item.Id}/details`)
            .header("If-Match", details["@odata.etag"])
            .header("Prefer", "return=representation")
            .patch(detailsPatch);
          console.log(`[updateFromTaskItem] /details retry OK: ${item.Id}`);
        } else {
          throw err;
        }
      }
    } else {
      console.log(`[updateFromTaskItem] No changes for /details: ${item.Id}`);
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

  /**
   * Build ITaskListItem from Planner task + details.
   * Keeps UI decoupled from Graph shape.
   */
  private mapPlannerToTaskItem(
    task: IPlannerListItem,
    buckets: IBucketItem[],
    details?: any
  ): ITaskListItem {
    // Evidence (first reference, if any)
    let evidenceUrl = "";
    let evidenceDesc = "";
    const refs = details?.references || task.references || {};
    const refKeys = Object.keys(refs);
    if (refKeys.length > 0) {
      const firstKey = refKeys[0];
      evidenceUrl = decodeURI(decodeURIComponent(firstKey));
      evidenceDesc = refs[firstKey]?.alias || "";
    }

    return {
      Id: task.id,
      Gate: this.getBucketNameById(task.bucketId, buckets),
      Task: task.title || "",
      Deliverable: task.title || "",
      Complete: task.percentComplete || 0,
      Description: details?.description || task.description || "", // Notes map here
      Start: task.startDateTime ? new Date(task.startDateTime) : undefined,
      Finish: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
      ActualFinish: task.completedDateTime ? new Date(task.completedDateTime) : undefined,
      EvidenceOfCompletion: {
        Url: evidenceUrl,
        Description: evidenceDesc
      },
      // Example: keep your existing delay Effort calculation
      Effort: GetDelay(
        task.dueDateTime ? new Date(task.dueDateTime) : new Date(),
        task.completedDateTime ? new Date(task.completedDateTime) : new Date()
      ),
    };
  }

}