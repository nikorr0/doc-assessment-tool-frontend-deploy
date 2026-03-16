import * as realApi from "./projects.real";
import * as mockApi from "../mocks/api/projects.mock";

const useMocks = String(import.meta.env.VITE_USE_MOCKS).toLowerCase() === "true";
const activeApi = useMocks ? mockApi : realApi;

export const createProject = activeApi.createProject;
export const listProjects = activeApi.listProjects;
export const getProject = activeApi.getProject;
export const deleteProject = activeApi.deleteProject;
export const listOrders = activeApi.listOrders;
export const uploadOrder = activeApi.uploadOrder;
export const getOrder = activeApi.getOrder;
export const deleteOrder = activeApi.deleteOrder;
export const listActs = activeApi.listActs;
export const listGroups = activeApi.listGroups;
export const uploadAct = activeApi.uploadAct;
export const deleteAct = activeApi.deleteAct;
export const listTemplates = activeApi.listTemplates;
export const generateTemplate = activeApi.generateTemplate;
export const listGroupTasks = activeApi.listGroupTasks;
export const updateTaskStatus = activeApi.updateTaskStatus;
export const updateTaskProfessionalChecked = activeApi.updateTaskProfessionalChecked;
export const getOrderStats = activeApi.getOrderStats;
export const getOrderInfographics = activeApi.getOrderInfographics;
export const getOrderArticleSankey = activeApi.getOrderArticleSankey;