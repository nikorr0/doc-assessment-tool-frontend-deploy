export type ProjectStatus = "planned" | "in_progress" | "completed";

export type Project = {
  id: string;
  name: string;
  shortName?: string;
  fullName?: string;
  createdAt?: string;
  status?: ProjectStatus;
  tag?: string;
  comment?: string;
  supervisor?: string;
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

export type GroupTableRawPayload = {
  type: "group_table";
  group_name?: string;
  group_id?: string;
  data?: Record<string, Record<string, string>>;
};

export type PerformanceTableRow = Record<string, string>;

export type PerformanceTableRawPayload = {
  type: "performance_table";
  section_title?: string;
  row_count?: number;
  data: PerformanceTableRow[];
};

export type OrderRawPayloadItem = GroupTableRawPayload | PerformanceTableRawPayload;

export type OrderRawResponse = {
  projectId: string;
  orderId: string;
  raw: OrderRawPayloadItem[];
  createdAt?: string | null;
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

export type ValidationIssueLevel = "error" | "warning";

export type ValidationIssue = {
  index: number;
  level: ValidationIssueLevel;
  message: string;
  position: string;
  rowContext: string;
  errorCell: string;
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
  actTaskText?: string | null;
  actUnits?: string | null;
  actTaskAnnotation?: string | null;
  actDeadlineDate?: string | null;
  unitsSimilarityPercent?: number | null;
  unitsWarning?: boolean;
  unitsBlocked?: boolean;
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

export type TaskStatusHistorySource = "manual" | "auto";

export type TaskStatusHistoryRecord = {
  id: string;
  orderId: string;
  taskId?: number | null;
  actId?: string | null;
  unmatchedDone?: boolean;
  groupId?: string | null;
  fullName?: string | null;
  taskText?: string | null;
  units?: string | null;
  actFullName?: string | null;
  actTaskText?: string | null;
  actUnits?: string | null;
  orderGroupShort?: string | null;
  actGroupShort?: string | null;
  deadline?: string | null;
  actDeadline?: string | null;
  taskReport?: string | null;
  actTaskAnnotation?: string | null;
  unitsSimilarityPercent?: number | null;
  unitsWarning?: boolean;
  unitsBlocked?: boolean;
  decision?: string | null;
  decisionReason?: string | null;
  oldStatus?: string | null;
  newStatus: string;
  source: TaskStatusHistorySource;
  changedAt?: string | null;
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
  completed: number;
  notCompleted: number;
  inProgress: number;
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
  groupPeopleQuarters?: Record<string, DashboardGroupPeopleStat[]>;
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

export type OrganizationalRiskLevel = "high" | "medium" | "low";

export type OrganizationalRiskItem = {
  level: OrganizationalRiskLevel;
  type: string;
  message: string;
  groupId?: string | null;
  groupName?: string | null;
  quarter?: number | null;
  taskId?: number | null;
  taskText?: string | null;
  fullName?: string | null;
  metrics: Record<string, string | number | boolean | null>;
};

export type OrganizationalRiskSummary = {
  total: number;
  high: number;
  medium: number;
  low: number;
};

export type OrganizationalRisksResponse = {
  projectId: string;
  orderId: string;
  year?: number | null;
  quarter?: number | null;
  groupId?: string | null;
  summary: OrganizationalRiskSummary;
  risks: OrganizationalRiskItem[];
};