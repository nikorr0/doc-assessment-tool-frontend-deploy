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

const GROUP_DEFINITIONS = [
  {
    id: "1",
    name: "Группа 1. Август Августович Августов",
    people: [
      "Август Августович Августов",
      "Богдан Богданович Богданов",
      "Вадим Вадимович Вадимов",
    ],
  },
  {
    id: "2",
    name: "Группа 2. Геннадий Геннадьевич Геннадьев",
    people: [
      "Геннадий Геннадьевич Геннадьев",
      "Демид Демидович Демидов",
      "Елисей Елисеевич Елисеев",
    ],
  },
  {
    id: "3",
    name: "Группа 3. Захар Захарович Захаров",
    people: [
      "Захар Захарович Захаров",
      "Иларион Иларионович Иларионов",
      "Климент Климентович Климентов",
    ],
  },
  {
    id: "4",
    name: "Группа 4. Лаврентий Лаврентьевич Лаврентьев",
    people: [
      "Лаврентий Лаврентьевич Лаврентьев",
      "Мирон Миронович Миронов",
      "Назар Назарович Назаров",
    ],
  },
  {
    id: "5",
    name: "Группа 5. Оскар Оскарович Оскаров",
    people: [
      "Оскар Оскарович Оскаров",
      "Платон Платонович Платонов",
      "Родион Родионович Родионов",
    ],
  },
  {
    id: "6",
    name: "Группа 6. Савелий Савельевич Савельев",
    people: [
      "Савелий Савельевич Савельев",
      "Тарас Тарасович Тарасов",
      "Устин Устинович Устинов",
    ],
  },
  {
    id: "7",
    name: "Группа 7. Фаддей Фаддеевич Фаддеев",
    people: [
      "Фаддей Фаддеевич Фаддеев",
      "Харитон Харитонович Харитонов",
      "Эмиль Эмильевич Эмильев",
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

function createTasksForGroup(groupId: string, people: readonly string[], seedShift: number): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  let taskNumber = 1;
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    for (let quarterTaskIndex = 0; quarterTaskIndex < 10; quarterTaskIndex += 1) {
      tasks.push({
        taskId: taskIdSequence++,
        groupId,
        fullName: people[(quarterTaskIndex + seedShift) % people.length],
        taskText: `${TASK_TEMPLATES[(taskNumber - 1) % TASK_TEMPLATES.length]} №${taskNumber}`,
        units: UNIT_ROTATION[(taskNumber - 1) % UNIT_ROTATION.length],
        taskReport: `Отчет по задаче ${taskNumber}`,
        deadline: taskQuarterDeadline(quarter),
        status: quarterTaskIndex < (COMPLETED_BY_QUARTER[quarter] ?? 0) ? "Выполнено" : "Не выполнено",
        isProfessionalChecked: quarterTaskIndex >= (UNVERIFIED_BY_QUARTER[quarter] ?? 0),
      });
      taskNumber += 1;
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
      orderIndex + groupIndex
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
    const firstOrderDate = formatIsoDate(2026 + projectIndex, 11, 20);
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
