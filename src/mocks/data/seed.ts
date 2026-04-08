import type {
  DashboardInfographicsResponse,
  DocumentRecord,
  GroupRecord,
  Project,
  TaskRecord,
  TemplateRecord,
} from "../../types";

export type MockSeedState = {
  projects: Project[];
  ordersByProjectId: Record<string, DocumentRecord[]>;
  actsByOrderId: Record<string, DocumentRecord[]>;
  groupsByOrderId: Record<string, GroupRecord[]>;
  templatesByOrderId: Record<string, TemplateRecord[]>;
  tasksByOrderAndGroup: Record<string, Record<string, TaskRecord[]>>;
  infographicsByOrderAndYear: Record<string, Record<string, DashboardInfographicsResponse>>;
};

const UNIT_ROTATION = ["публикация", "доклад", "мероприятие", "исследование"] as const;
const TASK_TEMPLATES = [
  "Подготовка публикации по результатам деятельности за квартал",
  "Сбор и верификация первичных данных для аналитического отчета",
  "Проведение тематического семинара и оформление итогового протокола",
  "Разработка предложений по улучшению профильных показателей",
  "Оформление промежуточного отчета и согласование с руководителем",
  "Подготовка материалов для межведомственного взаимодействия",
  "Актуализация базы наблюдений и контроль качества данных",
  "Подготовка статьи для профессионального издания",
  "Анализ выполненных мероприятий и формирование выводов",
  "Формирование пакета подтверждающих документов по группе",
] as const;
const TASK_DEADLINE_YEAR = 2026;
const QUARTER_END_DAY: Record<number, number> = {
  1: 31,
  2: 30,
  3: 30,
  4: 31,
};
const GROUP_QUARTER_PLAN = [
  {
    taskCounts: [12, 10, 7, 8],
    completedCounts: [12, 6, 1, 1],
    unverifiedCounts: [1, 1, 0, 1],
  },
  {
    taskCounts: [8, 8, 5, 7],
    completedCounts: [8, 5, 1, 0],
    unverifiedCounts: [1, 0, 0, 0],
  },
  {
    taskCounts: [6, 9, 6, 9],
    completedCounts: [6, 6, 1, 1],
    unverifiedCounts: [0, 0, 1, 0],
  },
  {
    taskCounts: [7, 7, 8, 8],
    completedCounts: [7, 4, 2, 1],
    unverifiedCounts: [1, 0, 1, 0],
  },
  {
    taskCounts: [5, 7, 5, 9],
    completedCounts: [5, 4, 1, 1],
    unverifiedCounts: [0, 1, 0, 1],
  },
  {
    taskCounts: [7, 6, 7, 10],
    completedCounts: [7, 3, 1, 1],
    unverifiedCounts: [1, 0, 1, 0],
  },
  {
    taskCounts: [5, 8, 7, 9],
    completedCounts: [5, 5, 2, 1],
    unverifiedCounts: [1, 1, 0, 1],
  },
] as const;
const ACT_LOADED_QUARTERS_BY_GROUP = [
  [1, 2, 3, 4],
  [1, 2, 3],
  [1, 2, 3],
  [1, 2],
  [1, 2],
  [1],
  [1],
] as const;

const GROUP_DEFINITIONS = [
  {
    id: "1",
    name: "Группа 1. Августов А. А.",
    people: [
      "Августов А. А.",
      "Богданов Б. Б.",
      "Вадимов В. В.",
      "Громов Г. Г.",
      "Данилов Д. Д.",
    ],
  },
  {
    id: "2",
    name: "Группа 2. Геннадьев Г. Г.",
    people: [
      "Геннадьев Г. Г.",
      "Демидов Д. Д.",
      "Елисеев Е. Е.",
      "Жданов Ж. Ж.",
      "Зотов З. З.",
    ],
  },
  {
    id: "3",
    name: "Группа 3. Захаров З. З.",
    people: [
      "Захаров З. З.",
      "Иларионов И. И.",
      "Климентов К. К.",
      "Лебедев Л. Л.",
      "Макаров М. М.",
    ],
  },
  {
    id: "4",
    name: "Группа 4. Лаврентьев Л. Л.",
    people: [
      "Лаврентьев Л. Л.",
      "Миронов М. М.",
      "Назаров Н. Н.",
      "Орлов О. О.",
      "Панов П. П.",
    ],
  },
  {
    id: "5",
    name: "Группа 5. Оскаров О. О.",
    people: [
      "Оскаров О. О.",
      "Платонов П. П.",
      "Родионов Р. Р.",
      "Соколов С. С.",
      "Титов Т. Т.",
    ],
  },
  {
    id: "6",
    name: "Группа 6. Савельев С. С.",
    people: [
      "Савельев С. С.",
      "Тарасов Т. Т.",
      "Устинов У. У.",
      "Федоров Ф. Ф.",
      "Михайлов М. М.",
    ],
  },
  {
    id: "7",
    name: "Группа 7. Фаддеев Ф. Ф.",
    people: [
      "Фаддеев Ф. Ф.",
      "Харитонов Х. Х.",
      "Эмильев Э. Э.",
      "Юдин Ю. Ю.",
      "Яковлев Я. Я.",
    ],
  },
] as const;

let taskIdSequence = 1000;

function formatIsoDate(year: number, month: number, day: number): string {
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return `${year}-${monthText}-${dayText}T10:00:00.000Z`;
}

function quarterToMonth(quarter: number): number {
  return (quarter - 1) * 3 + 1;
}

function taskQuarterDeadline(quarter: number): string {
  const endMonth = quarterToMonth(quarter) + 2;
  const endDay = QUARTER_END_DAY[quarter] ?? 31;
  return formatIsoDate(TASK_DEADLINE_YEAR, endMonth, endDay);
}

function getGroupQuarterPlan(groupPlanIndex: number) {
  return GROUP_QUARTER_PLAN[groupPlanIndex % GROUP_QUARTER_PLAN.length];
}

function buildDistinctTaskCounts(totalTasks: number, peopleCount: number): number[] {
  if (peopleCount <= 0) return [];
  const minRequired = (peopleCount * (peopleCount + 1)) / 2;
  if (totalTasks < minRequired) {
    const fallback = new Array(peopleCount).fill(0);
    for (let index = 0; index < totalTasks; index += 1) {
      fallback[index % peopleCount] += 1;
    }
    return fallback;
  }

  const counts = Array.from({ length: peopleCount }, (_, index) => index + 1);
  let remaining = totalTasks - minRequired;
  if (remaining > 0) {
    const uniformExtra = Math.floor(remaining / peopleCount);
    if (uniformExtra > 0) {
      for (let index = 0; index < peopleCount; index += 1) {
        counts[index] += uniformExtra;
      }
      remaining -= uniformExtra * peopleCount;
    }
  }
  if (remaining > 0) {
    for (let index = peopleCount - 1; index >= 0 && remaining > 0; index -= 1) {
      counts[index] += 1;
      remaining -= 1;
    }
  }
  return counts;
}

function rotateArray<T>(items: readonly T[], shift: number): T[] {
  if (items.length === 0) return [];
  const normalizedShift = ((shift % items.length) + items.length) % items.length;
  if (normalizedShift === 0) return [...items];
  return [...items.slice(normalizedShift), ...items.slice(0, normalizedShift)];
}

function buildPersonAssignment(people: readonly string[], totalTasks: number, seedShift: number): string[] {
  if (people.length === 0 || totalTasks <= 0) return [];
  const rotatedPeople = rotateArray(people, seedShift);
  const distinctCounts = buildDistinctTaskCounts(totalTasks, rotatedPeople.length);
  const assignments: string[] = [];
  rotatedPeople.forEach((person, personIndex) => {
    const personTaskCount = distinctCounts[personIndex] ?? 0;
    for (let taskIndex = 0; taskIndex < personTaskCount; taskIndex += 1) {
      assignments.push(person);
    }
  });
  return assignments;
}

function createTasksForGroup(
  groupId: string,
  people: readonly string[],
  seedShift: number,
  groupPlanIndex: number
): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  let taskNumber = 1;
  const plan = getGroupQuarterPlan(groupPlanIndex);
  const totalTasks = plan.taskCounts.reduce((acc, count) => acc + count, 0);
  const personAssignment = buildPersonAssignment(people, totalTasks, seedShift);
  let assignmentIndex = 0;
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const quarterIndex = quarter - 1;
    const quarterTaskCount = plan.taskCounts[quarterIndex] ?? 0;
    const quarterCompletedCount = plan.completedCounts[quarterIndex] ?? 0;
    const quarterUnverifiedCount = plan.unverifiedCounts[quarterIndex] ?? 0;
    for (let quarterTaskIndex = 0; quarterTaskIndex < quarterTaskCount; quarterTaskIndex += 1) {
      const assignedPerson =
        personAssignment[assignmentIndex] ?? people[(quarterTaskIndex + seedShift) % people.length];
      tasks.push({
        taskId: taskIdSequence++,
        groupId,
        fullName: assignedPerson,
        taskText: `${TASK_TEMPLATES[(taskNumber - 1) % TASK_TEMPLATES.length]} №${taskNumber}`,
        units: UNIT_ROTATION[(taskNumber - 1) % UNIT_ROTATION.length],
        taskReport: `Отчет по задаче ${taskNumber}`,
        deadline: taskQuarterDeadline(quarter),
        status: quarterTaskIndex < quarterCompletedCount ? "Выполнено" : "Не выполнено",
        isProfessionalChecked: quarterTaskIndex >= quarterUnverifiedCount,
      });
      taskNumber += 1;
      assignmentIndex += 1;
    }
  }
  return tasks;
}

function createOrderBundle(projectId: string, orderIndex: number, createdAt: string) {
  const orderId = `${projectId}-order-${orderIndex}`;
  const orderRecord: DocumentRecord = {
    documentId: orderId,
    projectId,
    type: "ORDER",
    fileName: `Приказ_${orderIndex}.docx`,
    fileRef: `/mock-files/orders/${orderId}.docx`,
    status: "processed",
    uploadedAt: createdAt,
  };

  const groups: GroupRecord[] = GROUP_DEFINITIONS.map(definition => ({
    groupId: `${orderId}-group-${definition.id}`,
    groupName: definition.name,
    createdAt,
  }));

  const acts: DocumentRecord[] = groups.flatMap((group, groupIndex) => {
    const loadedQuarters =
      ACT_LOADED_QUARTERS_BY_GROUP[groupIndex % ACT_LOADED_QUARTERS_BY_GROUP.length];
    return loadedQuarters.map((quarter, quarterIndex) => {
      return {
        documentId: `${orderId}-act-${groupIndex + 1}-${quarter}`,
        projectId,
        type: "ACT",
        fileName: `Акт_${groupIndex + 1}_${quarter}кв.docx`,
        fileRef: `/mock-files/acts/${orderId}-${group.groupId}-q${quarter}.docx`,
        status: "processed",
        uploadedAt: formatIsoDate(2026, quarterToMonth(quarter), 5 + quarterIndex),
        groupId: group.groupId,
        quarterYear: quarter,
      };
    });
  });

  const templates: TemplateRecord[] = groups.slice(0, 2).map((group, groupIndex) => ({
    id: `${orderId}-template-${groupIndex + 1}`,
    projectId,
    orderId,
    groupId: group.groupId,
    groupName: group.groupName,
    quarterYear: groupIndex + 1,
    fileName: `Шаблон_${groupIndex + 1}_${groupIndex + 1}кв.docx`,
    fileRef: `/mock-files/templates/${orderId}-${group.groupId}-q${groupIndex + 1}.docx`,
    fileHash: null,
    createdAt: formatIsoDate(2026, quarterToMonth(groupIndex + 1), 12),
  }));

  const tasksByGroup: Record<string, TaskRecord[]> = {};
  groups.forEach((group, groupIndex) => {
    const groupDefinition = GROUP_DEFINITIONS[groupIndex];
    tasksByGroup[group.groupId] = createTasksForGroup(
      group.groupId,
      groupDefinition.people,
      orderIndex + groupIndex,
      groupIndex
    );
  });

  return {
    orderRecord,
    groups,
    acts,
    templates,
    tasksByGroup,
  };
}

export function buildSeedState(): MockSeedState {
  taskIdSequence = 1000;

  const projects: Project[] = [
    {
      id: "project-alpha",
      name: "Тестовый проект №1",
      createdAt: "2026-01-10T08:00:00.000Z",
    },
    {
      id: "project-beta",
      name: "Тестовый проект №2",
      createdAt: "2026-02-14T11:30:00.000Z",
    },
  ];

  const ordersByProjectId: Record<string, DocumentRecord[]> = {};
  const actsByOrderId: Record<string, DocumentRecord[]> = {};
  const groupsByOrderId: Record<string, GroupRecord[]> = {};
  const templatesByOrderId: Record<string, TemplateRecord[]> = {};
  const tasksByOrderAndGroup: Record<string, Record<string, TaskRecord[]>> = {};
  const infographicsByOrderAndYear: Record<string, Record<string, DashboardInfographicsResponse>> = {};

  projects.forEach((project, projectIndex) => {
    const firstOrderDate = formatIsoDate(2026, 3 + projectIndex, 20);
    const secondOrderDate = formatIsoDate(2026, 2 + projectIndex, 15);
    const firstOrder = createOrderBundle(project.id, 1, firstOrderDate);
    const secondOrder = createOrderBundle(project.id, 2, secondOrderDate);

    ordersByProjectId[project.id] = [secondOrder.orderRecord, firstOrder.orderRecord];

    [firstOrder, secondOrder].forEach(bundle => {
      actsByOrderId[bundle.orderRecord.documentId] = bundle.acts;
      groupsByOrderId[bundle.orderRecord.documentId] = bundle.groups;
      templatesByOrderId[bundle.orderRecord.documentId] = bundle.templates;
      tasksByOrderAndGroup[bundle.orderRecord.documentId] = bundle.tasksByGroup;
      infographicsByOrderAndYear[bundle.orderRecord.documentId] = {};
    });
  });

  return {
    projects,
    ordersByProjectId,
    actsByOrderId,
    groupsByOrderId,
    templatesByOrderId,
    tasksByOrderAndGroup,
    infographicsByOrderAndYear,
  };
}
