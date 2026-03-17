export type Project = {
  id: string;
  name: string;
  createdAt?: string;
};

export type DocumentType = "ORDER" | "ACT";

export type DocumentRecord = {
  documentId: string;
  projectId: string;
  type: DocumentType;
  fileName: string;
  fileRef?: string | null;
  fileHash?: string | null;
  status: string;
  uploadedAt?: string;
  groupId?: string | null;
  quarterYear?: number | null;
};

export type DocumentValidationStatus = {
  documentId: string;
  projectId?: string | null;
  type?: "ORDER" | "ACT" | null;
  status: "pending" | "success" | "warning" | "error";
  summary?: string | null;
  errors: string[];
  warnings: string[];
  forwardedToReader: boolean;
  validatedAt?: string | null;
  updatedAt: string;
};

export type GroupRecord = {
  groupId: string;
  groupName?: string | null;
  createdAt?: string;
};

export type TemplateRecord = {
  id: string;
  projectId: string;
  orderId: string;
  groupId: string;
  groupName?: string | null;
  quarterYear: number;
  fileName: string;
  fileRef?: string | null;
  fileHash?: string | null;
  createdAt?: string;
};

export type TaskRecord = {
  taskId: number;
  groupId: string;
  fullName?: string | null;
  taskText?: string | null;
  units?: string | null;
  taskReport?: string | null;
  deadline?: string | null;
  status?: string | null;
  isProfessionalChecked?: boolean;
};

export type GroupTasks = {
  orderId: string;
  groupId: string;
  groupName?: string | null;
  tasks: TaskRecord[];
};

export type DashboardQuarterStat = {
  quarter: number;
  completed: number;
  notCompleted: number;
  unverified: number;
  completionRate: number;
};

export type DashboardGroupStat = {
  groupId: string;
  groupName?: string | null;
  quarter?: number | null;
  total: number;
  completed: number;
  notCompleted: number;
  unverified: number;
  completionRate: number;
  quarters: DashboardQuarterStat[];
};

export type DashboardStats = {
  projectId: string;
  orderId: string;
  quarters: DashboardQuarterStat[];
  groups: DashboardGroupStat[];
};

export type ArticleSankeyNode = {
  id: string;
  name: string;
  level: number;
  fullText?: string | null;
};

export type ArticleSankeyLink = {
  source: string;
  target: string;
  value: number;
};

export type ArticleSankeyData = {
  projectId: string;
  orderId: string;
  query: string;
  threshold: number;
  totalMatches: number;
  nodes: ArticleSankeyNode[];
  links: ArticleSankeyLink[];
};

export type DashboardPersonTaskStat = {
  fullName: string;
  taskCount: number;
};

export type DashboardGroupPeopleStat = {
  groupId: string;
  groupName: string;
  total: number;
  people: DashboardPersonTaskStat[];
};

export type DashboardGroupActStat = {
  groupId: string;
  groupName: string;
  quartersLoaded: number[];
};

export type DashboardInfographicsData = {
  stats: DashboardStats;
  articleSankey: ArticleSankeyData;
  groupPeople: DashboardGroupPeopleStat[];
  groupActs?: DashboardGroupActStat[];
  availableYears?: number[];
  selectedYear?: number | null;
  generatedAt: string;
};

export type DashboardInfographicsResponse = {
  status: "processing" | "ready" | "error";
  data?: DashboardInfographicsData | null;
  error?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
};