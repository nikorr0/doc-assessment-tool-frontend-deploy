import { api } from "./axios";
import type {
  ArticleSankeyData,
  DashboardInfographicsResponse,
  Project,
  DocumentRecord,
  GroupRecord,
  TemplateRecord,
  GroupTasks,
  DashboardStats,
} from "../types";

const DASHBOARD_REQUEST_TIMEOUT_MS = 120000;

export async function createProject(name: string): Promise<Project> {
  const res = await api.post("/projects", { name });
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