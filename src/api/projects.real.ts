import { api } from "./axios";
import type {
  ArticleSankeyData,
  DashboardInfographicsResponse,
  Project,
  DocumentRecord,
  OrderRawResponse,
  DocumentValidationStatus,
  GroupRecord,
  TemplateRecord,
  GroupTasks,
  TaskStatusHistoryRecord,
  DashboardStats,
} from "../types";

const DASHBOARD_REQUEST_TIMEOUT_MS = 120000;

export async function createProject(
  shortName: string,
  fullName: string,
  options?: { status?: import("../types").ProjectStatus; tag?: string; comment?: string; createdAt?: string; supervisor?: string }
): Promise<Project> {
  const res = await api.post("/projects", { shortName, fullName, ...options });
  return res.data;
}

export async function listProjects(): Promise<Project[]> {
  const res = await api.get("/projects");
  return res.data;
}

export async function getProject(projectId: string): Promise<Project> {
  const res = await api.get(`/projects/${projectId}`);
  return res.data;
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  patch: { shortName?: string; fullName?: string; status?: import("../types").ProjectStatus; tag?: string; comment?: string; supervisor?: string }
): Promise<Project> {
  const response = await api.patch(`/projects/${projectId}`, patch);
  return response.data;
}

export async function listOrders(projectId: string): Promise<DocumentRecord[]> {
  const res = await api.get(`/projects/${projectId}/orders`);
  return res.data;
}

export async function uploadOrder(projectId: string, file: File): Promise<DocumentRecord> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post(`/projects/${projectId}/orders`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return res.data;
}

export async function getOrder(projectId: string, orderId: string): Promise<DocumentRecord> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}`);
  return res.data;
}

export async function getOrderRaw(projectId: string, orderId: string): Promise<OrderRawResponse> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/raw`);
  return res.data;
}

export async function getDocumentValidation(
  documentId: string
): Promise<DocumentValidationStatus> {
  const res = await api.get(`/documents/${documentId}/validation`);
  return res.data;
}

export async function deleteOrder(projectId: string, orderId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/orders/${orderId}`);
}

export async function listActs(projectId: string, orderId: string): Promise<DocumentRecord[]> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/acts`);
  return res.data;
}

export async function listGroups(projectId: string, orderId: string): Promise<GroupRecord[]> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/groups`);
  return res.data;
}

export async function uploadAct(
  projectId: string,
  orderId: string,
  file: File,
  groupId: string,
  quarterYear: number
): Promise<DocumentRecord> {
  const fd = new FormData();
  fd.append("group_id", groupId);
  fd.append("quarter_year", String(quarterYear));
  fd.append("file", file);
  const res = await api.post(`/projects/${projectId}/orders/${orderId}/acts`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return res.data;
}

export async function deleteAct(projectId: string, orderId: string, actId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/orders/${orderId}/acts/${actId}`);
}

export async function listTemplates(projectId: string, orderId: string): Promise<TemplateRecord[]> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/templates`);
  return res.data;
}

export async function deleteTemplate(
  projectId: string,
  orderId: string,
  templateId: string
): Promise<void> {
  await api.delete(`/projects/${projectId}/orders/${orderId}/templates/${templateId}`);
}

export async function generateTemplate(
  projectId: string,
  orderId: string,
  groupId: string,
  quarterYear: number
): Promise<void> {
  await api.post(`/projects/${projectId}/orders/${orderId}/templates`, {
    groupId,
    quarterYear,
  });
}

export async function listGroupTasks(
  projectId: string,
  orderId: string,
  groupId: string
): Promise<GroupTasks> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/groups/${groupId}/tasks`, {
    timeout: DASHBOARD_REQUEST_TIMEOUT_MS,
  });
  return res.data;
}

export async function updateTaskStatus(
  projectId: string,
  orderId: string,
  taskId: number,
  status: string
): Promise<void> {
  await api.put(`/projects/${projectId}/orders/${orderId}/tasks/${taskId}/status`, {
    status,
  });
}

export async function updateTaskProfessionalChecked(
  projectId: string,
  orderId: string,
  taskId: number,
  isProfessionalChecked: boolean
): Promise<void> {
  await api.put(`/projects/${projectId}/orders/${orderId}/tasks/${taskId}/professional-check`, {
    is_professional_checked: isProfessionalChecked,
  });
}

export type BulkTaskProfessionalCheckedResult = {
  order_id: string;
  is_professional_checked: boolean;
  requested_count: number;
  updated_count: number;
  updated_task_ids: number[];
};

export async function updateTasksProfessionalCheckedBulk(
  projectId: string,
  orderId: string,
  taskIds: number[],
  isProfessionalChecked: boolean
): Promise<BulkTaskProfessionalCheckedResult> {
  const res = await api.put(`/projects/${projectId}/orders/${orderId}/tasks/professional-check`, {
    task_ids: taskIds,
    is_professional_checked: isProfessionalChecked,
  });
  return res.data;
}

export async function listTaskStatusHistory(
  projectId: string,
  orderId: string
): Promise<TaskStatusHistoryRecord[]> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/tasks/status-history`, {
    timeout: DASHBOARD_REQUEST_TIMEOUT_MS,
  });
  return res.data;
}

export async function undoTaskStatus(
  projectId: string,
  orderId: string,
  taskId: number,
  status: string
): Promise<void> {
  await api.put(`/projects/${projectId}/orders/${orderId}/tasks/${taskId}/status/undo`, {
    status,
  });
}

export async function getOrderStats(
  projectId: string,
  orderId: string
): Promise<DashboardStats> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/stats`, {
    timeout: DASHBOARD_REQUEST_TIMEOUT_MS,
  });
  return res.data;
}

export async function getOrderInfographics(
  projectId: string,
  orderId: string,
  options?: { force?: boolean; query?: string; threshold?: number; year?: number }
): Promise<DashboardInfographicsResponse> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.force) {
    params.force = true;
  }
  if (options?.query) {
    params.query = options.query;
  }
  if (typeof options?.threshold === "number") {
    params.threshold = options.threshold;
  }
  if (typeof options?.year === "number") {
    params.year = options.year;
  }
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/infographics`, {
    params,
    timeout: DASHBOARD_REQUEST_TIMEOUT_MS,
  });
  return res.data;
}

export async function getOrderArticleSankey(
  projectId: string,
  orderId: string
): Promise<ArticleSankeyData> {
  const res = await api.get(`/projects/${projectId}/orders/${orderId}/article-sankey`, {
    timeout: DASHBOARD_REQUEST_TIMEOUT_MS,
  });
  return res.data;
}