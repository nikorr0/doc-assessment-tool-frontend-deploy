import type {
  ArticleSankeyData,
  DashboardGroupActStat,
  DashboardGroupPeopleStat,
  DashboardGroupStat,
  DashboardInfographicsData,
  DashboardInfographicsResponse,
  DashboardQuarterStat,
  DashboardStats,
  DocumentValidationStatus,
  DocumentRecord,
  GroupRecord,
  GroupTasks,
  Project,
  TaskRecord,
  TemplateRecord,
} from "../../types";
import { getDb, getOrderYearKey, type DocumentValidationMockState } from "../store/db";
import { deepClone } from "../utils/clone";
import { getMockScenario, withNetworkDelay } from "../utils/delay";
import { nextId } from "../utils/id";

const VALID_TASK_STATUSES = new Set(["Не выполнено", "В работе", "Выполнено"]);
const TASK_DEADLINE_YEAR = 2026;
const QUARTER_END_DAY: Record<number, number> = {
  1: 31,
  2: 30,
  3: 30,
  4: 31,
};
const COMPLETED_BY_QUARTER: Record<number, number> = {
  1: 10,
  2: 6,
  3: 3,
  4: 1,
};
const UNVERIFIED_BY_QUARTER: Record<number, number> = {
  1: 1,
  2: 2,
  3: 2,
  4: 1,
};
const ACT_LOADED_QUARTERS_BY_GROUP = [
  [1, 2, 3, 4],
  [1, 2, 3],
  [1, 2, 3],
  [1, 2],
  [1, 2],
  [1],
  [1],
] as const;

const STARTER_GROUPS = [
  { id: "1", name: "Группа 1. Август Августович Августов" },
  { id: "2", name: "Группа 2. Геннадий Геннадьевич Геннадьев" },
  { id: "3", name: "Группа 3. Захар Захарович Захаров" },
  { id: "4", name: "Группа 4. Лаврентий Лаврентьевич Лаврентьев" },
  { id: "5", name: "Группа 5. Оскар Оскарович Оскаров" },
  { id: "6", name: "Группа 6. Савелий Савельевич Савельев" },
  { id: "7", name: "Группа 7. Фаддей Фаддеевич Фаддеев" },
] as const;

const STARTER_PEOPLE = [
  ["Август Августович Августов", "Богдан Богданович Богданов", "Вадим Вадимович Вадимов"],
  ["Геннадий Геннадьевич Геннадьев", "Демид Демидович Демидов", "Елисей Елисеевич Елисеев"],
  ["Захар Захарович Захаров", "Иларион Иларионович Иларионов", "Климент Климентович Климентов"],
  ["Лаврентий Лаврентьевич Лаврентьев", "Мирон Миронович Миронов", "Назар Назарович Назаров"],
  ["Оскар Оскарович Оскаров", "Платон Платонович Платонов", "Родион Родионович Родионов"],
  ["Савелий Савельевич Савельев", "Тарас Тарасович Тарасов", "Устин Устинович Устинов"],
  ["Фаддей Фаддеевич Фаддеев", "Харитон Харитонович Харитонов", "Эмиль Эмильевич Эмильев"],
] as const;

const STARTER_TASKS = [
  "Подготовить публикацию в профильном журнале",
  "Собрать данные и провести сверку показателей",
  "Подготовить доклад для рабочей встречи",
  "Оформить промежуточный отчет по группе",
  "Провести анализ результатов квартала",
  "Согласовать материалы с руководителем",
  "Обновить перечень мероприятий и сроки",
  "Сформировать свод по опубликованным материалам",
  "Подготовить предложения для улучшения метрик",
  "Подтвердить выполнение задач по плану",
] as const;

let taskIdSequence = 50000;

function nowIso(): string {
  return new Date().toISOString();
}

function roundRate(value: number): number {
  return Math.round(value * 10) / 10;
}

function isCompletedStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase() ?? "";
  return normalized.startsWith("выполн");
}

function getTaskYear(deadline?: string | null): number | null {
  if (!deadline) return null;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear();
}

function getTaskQuarter(deadline?: string | null): number {
  if (!deadline) return 1;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return 1;
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

function toQuarterDeadline(quarter: number): string {
  const month = quarter * 3;
  const day = QUARTER_END_DAY[quarter] ?? 31;
  return `${TASK_DEADLINE_YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T09:00:00.000Z`;
}

function buildValidationProfile(
  fileName: string,
  type: "ORDER" | "ACT"
): Pick<DocumentValidationMockState, "finalStatus" | "summary" | "errors" | "warnings" | "forwardedToReader"> {
  const normalized = fileName.trim().toLowerCase();
  const isError =
    normalized.includes("error")
  if (isError) {
    return {
      finalStatus: "error",
      summary: type === "ACT" ? "Акт не прошел валидацию" : "Приказ не прошел валидацию",
      errors: [
        "Обнаружены критические ошибки структуры документа.",
        "Документ отклонен и не передан в обработку.",
      ],
      warnings: [],
      forwardedToReader: false,
    };
  }

  const isWarning =
    normalized.includes("warn")
  if (isWarning) {
    return {
      finalStatus: "warning",
      summary:
        type === "ACT"
          ? "Акт загружен с предупреждениями"
          : "Приказ загружен с предупреждениями",
      errors: [],
      warnings: [
        "Для 2 группы отсутстуют заголовки таблицы, документ прочитан без их учета",
        "Таблица 1, строка 2: в дате обнаружен лишний пробел перед годом, дата прочитана с его игнорированием",
        "Таблица 1, строка 3: в дате обнаружен лишний пробел перед годом, дата прочитана с его игнорированием",
        "Таблица 2, строка 4: строка-продолжение без ФИО отнесена к предыдущему сотруднику Август Августович Августов",
        "Для группы 3 руководитель Захар Захарович Захаров не найден среди сотрудников таблицы"
      ],
      forwardedToReader: true,
    };
  }

  return {
    finalStatus: "success",
    summary: "Документ успешно прошел валидацию",
    errors: [],
    warnings: [],
    forwardedToReader: true,
  };
}

function createDocumentValidationState(record: DocumentRecord): DocumentValidationMockState {
  const profile = buildValidationProfile(record.fileName, record.type);
  const now = nowIso();
  return {
    documentId: record.documentId,
    projectId: record.projectId,
    type: record.type,
    finalStatus: profile.finalStatus,
    summary: profile.summary,
    errors: profile.errors,
    warnings: profile.warnings,
    forwardedToReader: profile.forwardedToReader,
    pendingChecksRemaining: 1 + Math.floor(Math.random() * 2),
    validatedAt: null,
    updatedAt: now,
    cleanupApplied: false,
  };
}

function ensureProject(projectId: string): Project {
  const db = getDb();
  const project = db.projects.find(item => item.id === projectId);
  if (!project) {
    throw new Error("Проект не найден");
  }
  return project;
}

function ensureOrder(projectId: string, orderId: string): DocumentRecord {
  const db = getDb();
  const order = (db.ordersByProjectId[projectId] ?? []).find(item => item.documentId === orderId);
  if (!order) {
    throw new Error("Приказ не найден");
  }
  return order;
}

function ensureGroup(orderId: string, groupId: string): GroupRecord {
  const db = getDb();
  const group = (db.groupsByOrderId[orderId] ?? []).find(item => item.groupId === groupId);
  if (!group) {
    throw new Error("Группа не найдена");
  }
  return group;
}

function findDocumentById(documentId: string): DocumentRecord | null {
  const db = getDb();
  for (const orders of Object.values(db.ordersByProjectId)) {
    const order = orders.find(item => item.documentId === documentId);
    if (order) {
      return order;
    }
  }
  for (const acts of Object.values(db.actsByOrderId)) {
    const act = acts.find(item => item.documentId === documentId);
    if (act) {
      return act;
    }
  }
  return null;
}

function dropValidationForOrder(orderId: string, keepOrderValidation = false): void {
  const db = getDb();
  if (!keepOrderValidation) {
    delete db.documentValidationById[orderId];
  }
  const acts = db.actsByOrderId[orderId] ?? [];
  acts.forEach(act => {
    delete db.documentValidationById[act.documentId];
  });
}

function removeDocumentFromStore(documentId: string): void {
  const db = getDb();

  for (const [projectId, orders] of Object.entries(db.ordersByProjectId)) {
    const order = orders.find(item => item.documentId === documentId);
    if (!order) {
      continue;
    }

    db.ordersByProjectId[projectId] = orders.filter(item => item.documentId !== documentId);
    dropValidationForOrder(documentId, true);
    delete db.actsByOrderId[documentId];
    delete db.groupsByOrderId[documentId];
    delete db.templatesByOrderId[documentId];
    delete db.tasksByOrderAndGroup[documentId];
    delete db.infographicsByOrderAndYear[documentId];
    Object.keys(db.infographicsPollByOrderAndYear).forEach(key => {
      if (key.startsWith(`${documentId}::`)) {
        delete db.infographicsPollByOrderAndYear[key];
      }
    });
    return;
  }

  for (const [orderId, acts] of Object.entries(db.actsByOrderId)) {
    if (!acts.some(item => item.documentId === documentId)) {
      continue;
    }
    db.actsByOrderId[orderId] = acts.filter(item => item.documentId !== documentId);
    delete db.documentValidationById[documentId];
    return;
  }
}

function getOrderTasks(orderId: string): TaskRecord[] {
  const db = getDb();
  const tasksByGroup = db.tasksByOrderAndGroup[orderId] ?? {};
  return Object.values(tasksByGroup).flat();
}

function buildQuarterStats(tasks: TaskRecord[]): DashboardQuarterStat[] {
  const quarters: DashboardQuarterStat[] = [1, 2, 3, 4].map(quarter => {
    const quarterTasks = tasks.filter(task => getTaskQuarter(task.deadline) === quarter);
    const completed = quarterTasks.filter(task => isCompletedStatus(task.status)).length;
    const notCompleted = quarterTasks.length - completed;
    const unverified = quarterTasks.filter(task => !task.isProfessionalChecked).length;
    const completionRate = quarterTasks.length ? roundRate((completed / quarterTasks.length) * 100) : 0;
    return {
      quarter,
      completed,
      notCompleted,
      unverified,
      completionRate,
    };
  });
  return quarters;
}

function buildDashboardStats(projectId: string, orderId: string, selectedYear: number): DashboardStats {
  const db = getDb();
  const groups = db.groupsByOrderId[orderId] ?? [];
  const tasksByGroup = db.tasksByOrderAndGroup[orderId] ?? {};

  const groupStats: DashboardGroupStat[] = groups.map(group => {
    const tasks = (tasksByGroup[group.groupId] ?? []).filter(task => getTaskYear(task.deadline) === selectedYear);
    const completed = tasks.filter(task => isCompletedStatus(task.status)).length;
    const notCompleted = tasks.length - completed;
    const unverified = tasks.filter(task => !task.isProfessionalChecked).length;
    const quarters = buildQuarterStats(tasks);
    const completionRate = tasks.length ? roundRate((completed / tasks.length) * 100) : 0;
    return {
      groupId: group.groupId,
      groupName: group.groupName,
      quarter: null,
      total: tasks.length,
      completed,
      notCompleted,
      unverified,
      completionRate,
      quarters,
    };
  });

  const allTasks = Object.values(tasksByGroup)
    .flat()
    .filter(task => getTaskYear(task.deadline) === selectedYear);

  return {
    projectId,
    orderId,
    quarters: buildQuarterStats(allTasks),
    groups: groupStats,
  };
}

function buildGroupPeopleStats(orderId: string, selectedYear: number): DashboardGroupPeopleStat[] {
  const db = getDb();
  const groups = db.groupsByOrderId[orderId] ?? [];
  const tasksByGroup = db.tasksByOrderAndGroup[orderId] ?? {};

  return groups.map(group => {
    const sourceTasks = (tasksByGroup[group.groupId] ?? []).filter(
      task => getTaskYear(task.deadline) === selectedYear
    );
    const counter = new Map<string, number>();
    sourceTasks.forEach(task => {
      const fullName = task.fullName?.trim() || "Не указано";
      counter.set(fullName, (counter.get(fullName) ?? 0) + 1);
    });
    const people = Array.from(counter.entries())
      .map(([fullName, taskCount]) => ({ fullName, taskCount }))
      .sort((a, b) => b.taskCount - a.taskCount || a.fullName.localeCompare(b.fullName, "ru"));
    const total = people.reduce((acc, item) => acc + item.taskCount, 0);
    return {
      groupId: group.groupId,
      groupName: group.groupName ?? group.groupId,
      total,
      people,
    };
  });
}

function buildGroupActStats(orderId: string): DashboardGroupActStat[] {
  const db = getDb();
  const groups = db.groupsByOrderId[orderId] ?? [];
  const acts = db.actsByOrderId[orderId] ?? [];

  return groups.map(group => {
    const quartersLoaded = acts
      .filter(act => act.groupId === group.groupId && typeof act.quarterYear === "number")
      .map(act => act.quarterYear as number)
      .filter((quarter, index, array) => array.indexOf(quarter) === index)
      .sort((a, b) => a - b);

    return {
      groupId: group.groupId,
      groupName: group.groupName ?? group.groupId,
      quartersLoaded,
    };
  });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildArticleSankey(
  projectId: string,
  orderId: string,
  selectedYear: number,
  query?: string,
  threshold?: number
): ArticleSankeyData {
  const db = getDb();
  const groups = db.groupsByOrderId[orderId] ?? [];
  const tasksByGroup = db.tasksByOrderAndGroup[orderId] ?? {};
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const minThreshold = typeof threshold === "number" && threshold > 1 ? Math.floor(threshold) : 1;

  type SankeyNode = { id: string; name: string; level: number; fullText?: string | null };
  type SankeyLink = { source: string; target: string; value: number };

  const nodes = new Map<string, SankeyNode>();
  const links = new Map<string, SankeyLink>();
  let totalMatches = 0;

  groups.forEach(group => {
    const groupTasks = (tasksByGroup[group.groupId] ?? []).filter(task => {
      if (getTaskYear(task.deadline) !== selectedYear) return false;
      if (!normalizedQuery) return true;
      const haystack = `${task.fullName ?? ""} ${task.taskText ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    if (groupTasks.length === 0) return;

    const groupNodeId = `group:${group.groupId}`;
    nodes.set(groupNodeId, {
      id: groupNodeId,
      name: group.groupName ?? group.groupId,
      level: 0,
    });

    groupTasks.forEach(task => {
      const personName = task.fullName?.trim() || "Не указано";
      const articleText = task.taskText?.trim() || "Не указано";
      const personNodeId = `person:${slug(personName)}`;
      const articleNodeId = `article:${slug(articleText)}-${Math.abs(task.taskId)}`;

      nodes.set(personNodeId, { id: personNodeId, name: personName, level: 1 });
      nodes.set(articleNodeId, {
        id: articleNodeId,
        name: articleText.length > 80 ? `${articleText.slice(0, 77)}...` : articleText,
        level: 2,
        fullText: articleText,
      });

      const gpKey = `${groupNodeId}->${personNodeId}`;
      const paKey = `${personNodeId}->${articleNodeId}`;

      links.set(gpKey, {
        source: groupNodeId,
        target: personNodeId,
        value: (links.get(gpKey)?.value ?? 0) + 1,
      });
      links.set(paKey, {
        source: personNodeId,
        target: articleNodeId,
        value: (links.get(paKey)?.value ?? 0) + 1,
      });
      totalMatches += 1;
    });
  });

  const filteredLinks = Array.from(links.values()).filter(link => link.value >= minThreshold);
  const visibleNodeIds = new Set<string>();
  filteredLinks.forEach(link => {
    visibleNodeIds.add(link.source);
    visibleNodeIds.add(link.target);
  });

  return {
    projectId,
    orderId,
    query: query?.trim() || "публикация",
    threshold: threshold ?? 1,
    totalMatches,
    nodes: Array.from(nodes.values()).filter(node => visibleNodeIds.has(node.id)),
    links: filteredLinks,
  };
}

function getAvailableYears(orderId: string): number[] {
  const years = new Set<number>();
  getOrderTasks(orderId).forEach(task => {
    const year = getTaskYear(task.deadline);
    if (typeof year === "number") {
      years.add(year);
    }
  });
  if (years.size === 0) {
    return [TASK_DEADLINE_YEAR];
  }
  return Array.from(years).sort((a, b) => a - b);
}

function getSelectedYear(orderId: string, requestedYear?: number): number {
  const availableYears = getAvailableYears(orderId);
  if (typeof requestedYear === "number" && availableYears.includes(requestedYear)) {
    return requestedYear;
  }
  return availableYears[availableYears.length - 1];
}

function createStarterGroups(orderId: string): GroupRecord[] {
  const createdAt = nowIso();
  return STARTER_GROUPS.map(group => ({
    groupId: `${orderId}-group-${group.id}`,
    groupName: group.name,
    createdAt,
  }));
}

function createStarterTasks(groupId: string, groupIndex: number): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  let taskNumber = 1;
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    for (let quarterTaskIndex = 0; quarterTaskIndex < 10; quarterTaskIndex += 1) {
      tasks.push({
        taskId: taskIdSequence++,
        groupId,
        fullName:
          STARTER_PEOPLE[groupIndex][(quarterTaskIndex + groupIndex) % STARTER_PEOPLE[groupIndex].length],
        taskText: `${STARTER_TASKS[(taskNumber - 1) % STARTER_TASKS.length]} №${taskNumber}`,
        units: "публикация",
        taskReport: `Отчет по задаче №${taskNumber}`,
        deadline: toQuarterDeadline(quarter),
        status:
          quarterTaskIndex < (COMPLETED_BY_QUARTER[quarter] ?? 0) ? "Выполнено" : "Не выполнено",
        isProfessionalChecked: quarterTaskIndex >= (UNVERIFIED_BY_QUARTER[quarter] ?? 0),
      });
      taskNumber += 1;
    }
  }
  return tasks;
}

function createStarterActs(orderId: string, projectId: string, groups: GroupRecord[]): DocumentRecord[] {
  return groups.flatMap((group, groupIndex) => {
    const loadedQuarters =
      ACT_LOADED_QUARTERS_BY_GROUP[groupIndex % ACT_LOADED_QUARTERS_BY_GROUP.length];
    return loadedQuarters.map(quarter => ({
      documentId: `${orderId}-act-${groupIndex + 1}-${quarter}`,
      projectId,
      type: "ACT",
      fileName: `Акт_${groupIndex + 1}_${quarter}кв.docx`,
      fileRef: `/mock-files/acts/${orderId}-${group.groupId}-q${quarter}.docx`,
      status: "processed",
      uploadedAt: nowIso(),
      groupId: group.groupId,
      quarterYear: quarter,
    }));
  });
}

function touchGroupTaskAsInProgress(orderId: string, groupId: string): void {
  const db = getDb();
  const tasks = db.tasksByOrderAndGroup[orderId]?.[groupId] ?? [];
  const target = tasks.find(task => !isCompletedStatus(task.status));
  if (target) {
    target.status = "В работе";
  }
}

function touchGroupTaskAsCompleted(orderId: string, groupId: string): void {
  const db = getDb();
  const tasks = db.tasksByOrderAndGroup[orderId]?.[groupId] ?? [];
  const target = tasks.find(task => !isCompletedStatus(task.status));
  if (target) {
    target.status = "Выполнено";
    target.isProfessionalChecked = true;
  }
}

function findTask(orderId: string, taskId: number): TaskRecord | null {
  const db = getDb();
  const groups = db.tasksByOrderAndGroup[orderId] ?? {};
  for (const tasks of Object.values(groups)) {
    const target = tasks.find(task => task.taskId === taskId);
    if (target) {
      return target;
    }
  }
  return null;
}

export async function createProject(name: string): Promise<Project> {
  await withNetworkDelay();
  const db = getDb();
  const project: Project = {
    id: nextId("project"),
    name,
    createdAt: nowIso(),
  };
  db.projects.unshift(project);
  db.ordersByProjectId[project.id] = [];
  return deepClone(project);
}

export async function listProjects(): Promise<Project[]> {
  await withNetworkDelay();
  const db = getDb();
  return deepClone(db.projects);
}

export async function getProject(projectId: string): Promise<Project> {
  await withNetworkDelay();
  return deepClone(ensureProject(projectId));
}

export async function deleteProject(projectId: string): Promise<void> {
  await withNetworkDelay();
  const db = getDb();
  ensureProject(projectId);
  const orders = db.ordersByProjectId[projectId] ?? [];
  orders.forEach(order => {
    dropValidationForOrder(order.documentId);
    delete db.actsByOrderId[order.documentId];
    delete db.groupsByOrderId[order.documentId];
    delete db.templatesByOrderId[order.documentId];
    delete db.tasksByOrderAndGroup[order.documentId];
    delete db.infographicsByOrderAndYear[order.documentId];
    Object.keys(db.infographicsPollByOrderAndYear).forEach(key => {
      if (key.startsWith(`${order.documentId}::`)) {
        delete db.infographicsPollByOrderAndYear[key];
      }
    });
  });

  db.projects = db.projects.filter(project => project.id !== projectId);
  delete db.ordersByProjectId[projectId];
}

export async function listOrders(projectId: string): Promise<DocumentRecord[]> {
  await withNetworkDelay();
  ensureProject(projectId);
  const db = getDb();
  const orders = (db.ordersByProjectId[projectId] ?? []).filter(order => order.type === "ORDER");
  return deepClone(orders);
}

export async function uploadOrder(projectId: string, file: File): Promise<DocumentRecord> {
  await withNetworkDelay();
  ensureProject(projectId);
  const db = getDb();
  const orderId = nextId("order");
  const uploadedAt = nowIso();
  const order: DocumentRecord = {
    documentId: orderId,
    projectId,
    type: "ORDER",
    fileName: file.name,
    fileRef: `/mock-files/orders/${orderId}/${encodeURIComponent(file.name)}`,
    status: "processed",
    uploadedAt,
  };
  db.ordersByProjectId[projectId] = [order, ...(db.ordersByProjectId[projectId] ?? [])];
  db.documentValidationById[order.documentId] = createDocumentValidationState(order);

  const groups = createStarterGroups(orderId);
  db.groupsByOrderId[orderId] = groups;
  db.actsByOrderId[orderId] = createStarterActs(orderId, projectId, groups);
  db.templatesByOrderId[orderId] = [];
  db.tasksByOrderAndGroup[orderId] = {};
  groups.forEach((group, index) => {
    db.tasksByOrderAndGroup[orderId][group.groupId] = createStarterTasks(group.groupId, index);
  });
  db.infographicsByOrderAndYear[orderId] = {};

  return deepClone(order);
}

export async function getOrder(projectId: string, orderId: string): Promise<DocumentRecord> {
  await withNetworkDelay();
  return deepClone(ensureOrder(projectId, orderId));
}

export async function getDocumentValidation(
  documentId: string
): Promise<DocumentValidationStatus> {
  await withNetworkDelay();
  const db = getDb();
  const existing = db.documentValidationById[documentId];
  const state = existing ?? (() => {
    const document = findDocumentById(documentId);
    if (!document) {
      throw new Error("Документ не найден");
    }
    const created = createDocumentValidationState(document);
    created.pendingChecksRemaining = 0;
    db.documentValidationById[documentId] = created;
    return created;
  })();

  state.updatedAt = nowIso();
  if (state.pendingChecksRemaining > 0) {
    state.pendingChecksRemaining -= 1;
    return {
      documentId: state.documentId,
      projectId: state.projectId,
      type: state.type,
      status: "pending",
      summary: "Проверка документа выполняется",
      errors: [],
      warnings: [],
      forwardedToReader: false,
      validatedAt: null,
      updatedAt: state.updatedAt,
    };
  }

  if (!state.validatedAt) {
    state.validatedAt = nowIso();
  }
  if (state.finalStatus === "warning") {
    const document = findDocumentById(documentId);
    if (document && document.status !== "validation_warning") {
      document.status = "validation_warning";
    }
  }
  if (state.finalStatus === "error" && !state.cleanupApplied) {
    state.cleanupApplied = true;
    removeDocumentFromStore(documentId);
  }

  return {
    documentId: state.documentId,
    projectId: state.projectId,
    type: state.type,
    status: state.finalStatus,
    summary: state.summary,
    errors: [...state.errors],
    warnings: [...state.warnings],
    forwardedToReader: state.forwardedToReader,
    validatedAt: state.validatedAt,
    updatedAt: state.updatedAt,
  };
}

export async function deleteOrder(projectId: string, orderId: string): Promise<void> {
  await withNetworkDelay();
  const db = getDb();
  ensureOrder(projectId, orderId);
  db.ordersByProjectId[projectId] = (db.ordersByProjectId[projectId] ?? []).filter(
    order => order.documentId !== orderId
  );
  dropValidationForOrder(orderId);
  delete db.actsByOrderId[orderId];
  delete db.groupsByOrderId[orderId];
  delete db.templatesByOrderId[orderId];
  delete db.tasksByOrderAndGroup[orderId];
  delete db.infographicsByOrderAndYear[orderId];
  Object.keys(db.infographicsPollByOrderAndYear).forEach(key => {
    if (key.startsWith(`${orderId}::`)) {
      delete db.infographicsPollByOrderAndYear[key];
    }
  });
}

export async function listActs(projectId: string, orderId: string): Promise<DocumentRecord[]> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  const db = getDb();
  return deepClone(db.actsByOrderId[orderId] ?? []);
}

export async function listGroups(projectId: string, orderId: string): Promise<GroupRecord[]> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  const db = getDb();
  return deepClone(db.groupsByOrderId[orderId] ?? []);
}

export async function uploadAct(
  projectId: string,
  orderId: string,
  file: File,
  groupId: string,
  quarterYear: number
): Promise<DocumentRecord> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  ensureGroup(orderId, groupId);

  const db = getDb();
  const acts = db.actsByOrderId[orderId] ?? [];
  const now = nowIso();
  const existing = acts.find(item => item.groupId === groupId && item.quarterYear === quarterYear);

  if (existing) {
    existing.fileName = file.name;
    existing.fileRef = `/mock-files/acts/${existing.documentId}/${encodeURIComponent(file.name)}`;
    existing.status = "processed";
    existing.uploadedAt = now;
    existing.type = "ACT";
    db.documentValidationById[existing.documentId] = createDocumentValidationState(existing);
    touchGroupTaskAsInProgress(orderId, groupId);
    return deepClone(existing);
  }

  const record: DocumentRecord = {
    documentId: nextId("act"),
    projectId,
    type: "ACT",
    fileName: file.name,
    fileRef: `/mock-files/acts/${orderId}/${encodeURIComponent(file.name)}`,
    status: "processed",
    uploadedAt: now,
    groupId,
    quarterYear,
  };
  db.actsByOrderId[orderId] = [record, ...acts];
  db.documentValidationById[record.documentId] = createDocumentValidationState(record);
  touchGroupTaskAsInProgress(orderId, groupId);
  return deepClone(record);
}

export async function deleteAct(projectId: string, orderId: string, actId: string): Promise<void> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  const db = getDb();
  const initialLength = (db.actsByOrderId[orderId] ?? []).length;
  db.actsByOrderId[orderId] = (db.actsByOrderId[orderId] ?? []).filter(
    act => act.documentId !== actId
  );
  delete db.documentValidationById[actId];
  if (db.actsByOrderId[orderId].length === initialLength) {
    throw new Error("Акт не найден");
  }
}

export async function listTemplates(projectId: string, orderId: string): Promise<TemplateRecord[]> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  const db = getDb();
  return deepClone(db.templatesByOrderId[orderId] ?? []);
}

export async function generateTemplate(
  projectId: string,
  orderId: string,
  groupId: string,
  quarterYear: number
): Promise<void> {
  ensureOrder(projectId, orderId);
  ensureGroup(orderId, groupId);
  touchGroupTaskAsInProgress(orderId, groupId);

  await withNetworkDelay();
  if (getMockScenario() === "error-in-templates") {
    throw new Error("Имитированная ошибка формирования шаблона");
  }

  const db = getDb();
  const templates = db.templatesByOrderId[orderId] ?? [];
  const now = nowIso();
  const group = ensureGroup(orderId, groupId);
  const existing = templates.find(
    template => template.groupId === groupId && template.quarterYear === quarterYear
  );
  const fileName = `Шаблон_${group.groupName ?? groupId}_${quarterYear}кв.docx`;

  if (existing) {
    existing.fileName = fileName;
    existing.fileRef = `/mock-files/templates/${existing.id}/${encodeURIComponent(fileName)}`;
    existing.createdAt = now;
  } else {
    templates.unshift({
      id: nextId("template"),
      projectId,
      orderId,
      groupId,
      groupName: group.groupName,
      quarterYear,
      fileName,
      fileRef: `/mock-files/templates/${orderId}/${encodeURIComponent(fileName)}`,
      fileHash: null,
      createdAt: now,
    });
    db.templatesByOrderId[orderId] = templates;
  }

  touchGroupTaskAsCompleted(orderId, groupId);
}

export async function listGroupTasks(
  projectId: string,
  orderId: string,
  groupId: string
): Promise<GroupTasks> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  const group = ensureGroup(orderId, groupId);
  const db = getDb();
  return deepClone({
    orderId,
    groupId,
    groupName: group.groupName,
    tasks: db.tasksByOrderAndGroup[orderId]?.[groupId] ?? [],
  });
}

export async function updateTaskStatus(
  projectId: string,
  orderId: string,
  taskId: number,
  status: string
): Promise<void> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  if (!VALID_TASK_STATUSES.has(status)) {
    throw new Error("Недопустимый статус задачи");
  }
  const target = findTask(orderId, taskId);
  if (!target) {
    throw new Error("Задача не найдена");
  }
  target.status = status;
}

export async function updateTaskProfessionalChecked(
  projectId: string,
  orderId: string,
  taskId: number,
  isProfessionalChecked: boolean
): Promise<void> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  const target = findTask(orderId, taskId);
  if (!target) {
    throw new Error("Задача не найдена");
  }
  target.isProfessionalChecked = isProfessionalChecked;
}

export async function getOrderStats(projectId: string, orderId: string): Promise<DashboardStats> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  const selectedYear = getSelectedYear(orderId);
  return deepClone(buildDashboardStats(projectId, orderId, selectedYear));
}

export async function getOrderInfographics(
  projectId: string,
  orderId: string,
  options?: { force?: boolean; query?: string; threshold?: number; year?: number }
): Promise<DashboardInfographicsResponse> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);

  if (options?.query?.toLowerCase().includes("error")) {
    return {
      status: "error",
      error: "Имитированная ошибка формирования инфографики",
      updatedAt: nowIso(),
    };
  }

  const db = getDb();
  const selectedYear = getSelectedYear(orderId, options?.year);
  const key = getOrderYearKey(orderId, selectedYear);
  const yearKey = String(selectedYear);
  const shouldReset = options?.force || !db.infographicsPollByOrderAndYear[key];

  if (shouldReset) {
    db.infographicsPollByOrderAndYear[key] = {
      attempts: 0,
      readyAfter: Math.floor(Math.random() * 2) + 1,
      startedAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (options?.force) {
      if (!db.infographicsByOrderAndYear[orderId]) {
        db.infographicsByOrderAndYear[orderId] = {};
      }
      delete db.infographicsByOrderAndYear[orderId][yearKey];
    }
  }

  const pollState = db.infographicsPollByOrderAndYear[key];
  pollState.attempts += 1;
  pollState.updatedAt = nowIso();

  if (pollState.attempts <= pollState.readyAfter) {
    return {
      status: "processing",
      startedAt: pollState.startedAt,
      updatedAt: pollState.updatedAt,
    };
  }

  if (!db.infographicsByOrderAndYear[orderId]) {
    db.infographicsByOrderAndYear[orderId] = {};
  }

  let payload = db.infographicsByOrderAndYear[orderId][yearKey];
  if (!payload || payload.status !== "ready" || !payload.data) {
    const availableYears = getAvailableYears(orderId);
    const stats = buildDashboardStats(projectId, orderId, selectedYear);
    const articleSankey = buildArticleSankey(
      projectId,
      orderId,
      selectedYear,
      options?.query,
      options?.threshold
    );
    const groupPeople = buildGroupPeopleStats(orderId, selectedYear);
    const groupActs = buildGroupActStats(orderId);
    const data: DashboardInfographicsData = {
      stats,
      articleSankey,
      groupPeople,
      groupActs,
      availableYears,
      selectedYear,
      generatedAt: nowIso(),
    };
    payload = {
      status: "ready",
      data,
      error: null,
      startedAt: pollState.startedAt,
      updatedAt: nowIso(),
    };
    db.infographicsByOrderAndYear[orderId][yearKey] = payload;
  }

  return deepClone(payload);
}

export async function getOrderArticleSankey(
  projectId: string,
  orderId: string
): Promise<ArticleSankeyData> {
  await withNetworkDelay();
  ensureOrder(projectId, orderId);
  const selectedYear = getSelectedYear(orderId);
  return deepClone(buildArticleSankey(projectId, orderId, selectedYear));
}
