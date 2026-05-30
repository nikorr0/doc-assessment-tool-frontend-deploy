import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import {
  getOrder,
  getOrderInfographics,
  getOrderRisks,
  getProject,
} from "../api/projects";
import DashboardRisksTab from "../components/DashboardRisksTab";
import { StatusBar, StatusBarDot } from "../components/StatusBar";
import { getApiErrorMessage } from "../utils/error";
import type {
  ArticleSankeyData,
  DashboardGroupActStat,
  DashboardGroupStat,
  DashboardGroupPeopleStat,
  DashboardQuarterStat,
  OrganizationalRiskItem,
  OrganizationalRiskSummary,
  DashboardStats,
  DocumentRecord,
  Project,
} from "../types";

type LoadState = "idle" | "loading" | "error";
// | "quarter-completion"
type DashboardChartId =
  | "quarter-status"
  | "group-status"
  | "quarter-gauge"
  | "group-acts-polar"
  | "group-person-treemap"
  | "article-sankey";

const QUARTERS = [1, 2, 3, 4];
const ALL_QUARTERS_OPTION = "all";
const INFOGRAPHICS_POLL_INTERVAL_MS = 2000;
const INFOGRAPHICS_MAX_ATTEMPTS = 90;
const PRIMARY_CHART_SWITCH_DELAY_MS = 120;
const DASHBOARD_CHART_ORDER: DashboardChartId[] = [
  "quarter-status",
  "group-status",
  // "quarter-completion",
  "quarter-gauge",
  "group-acts-polar",
  "group-person-treemap",
  "article-sankey",
];

const DASHBOARD_CHART_TITLES: Record<DashboardChartId, string> = {
  "quarter-status": "Статусы задач по кварталам",
  "group-status": "Статусы задач по группам",
  // "quarter-completion": "Выполнение задач по кварталам",
  "quarter-gauge": "Квартальная динамика исполнения задач",
  "group-acts-polar": "Загруженные акты по группам и кварталам",
  "group-person-treemap": "Задачи по группам и сотрудникам",
  "article-sankey": "Связь сотрудников с публикационными задачами",
};

const DASHBOARD_CHART_DESCRIPTIONS: Record<DashboardChartId, string> = {
  "quarter-status":
    "Столбчатая диаграмма: число задач по кварталам в разрезе статусов (выполнено, не выполнено, не проверено). Нажатие на сегмент открывает отфильтрованный список задач.",
  "group-status":
    "Столбчатая диаграмма: число задач по рабочим группам в разрезе статусов. Нажатие на сегмент открывает отфильтрованный список задач.",
  "quarter-gauge":
    "Счетчик: процент выполнения задач по каждому кварталу. Цвет сегмента отражает уровень исполнения, стрелка указывает на текущий квартал. При наведении показывается процент выполнения по группам.",
  "group-acts-polar":
    "Полярная диаграмма: наличие загруженных актов по группам и кварталам. Закрашенный сегмент означает, что акт за соответствующий квартал загружен.",
  "group-person-treemap":
    "Древовидная карта: распределение задач между группами и исполнителями. Размер блока – число всех задач сотрудника, цвет – соотношение статусов (чем ближе к зеленому, тем больше выполнено задач). При наведении показывается число задач и соотношение статусов. Нажатие открывает список задач.",
  "article-sankey":
    "Диаграмма потоков (Sankey): связи между рабочими группами, исполнителями и задачами о статьях и публикациях. На диаграмму попадают только задачи, в формулировке которых речь идёт о статьях, публикациях, рукописях или манускриптах. Похожие по смыслу задачи объединяются в один блок справа, что показывает, сколько людей из разных групп работают над одним кластером связанных задач. Ленты между столбцами показывают, кто с кем связан; чем шире лента, тем больше таких задач. При наведении на ленту отображается их число, на задачу – полный текст формулировки. Нажатие на группу или сотрудника открывает отфильтрованный список задач.",
};

function HelpCircleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function DashboardChartHelpButton({
  chartId,
  stopPropagation = false,
}: {
  chartId: DashboardChartId;
  stopPropagation?: boolean;
}) {
  const suppressCardAction = (event: MouseEvent | KeyboardEvent) => {
    if (!stopPropagation) return;
    event.stopPropagation();
  };

  return (
    <span
      className="dashboard-chart-help"
      tabIndex={0}
      aria-label="Описание диаграммы"
      onClick={suppressCardAction}
      onMouseDown={suppressCardAction}
      onKeyDown={suppressCardAction}
    >
      <HelpCircleIcon />
      <span className="dashboard-chart-help__popup">
        {DASHBOARD_CHART_DESCRIPTIONS[chartId]}
      </span>
    </span>
  );
}

const QUARTER_ACT_COLORS: Record<number, string> = {
  1: "#0D41E1",
  2: "#0C63E7",
  3: "#0A85ED",
  4: "#09A6F3",
};

const QUARTER_GAUGE_LEGEND_ITEMS = [
  { color: "#22c55e", label: "95% и выше" },
  { color: "#f97316", label: "от 51% до 95%" },
  { color: "#ef4444", label: "от 0% до 50%" },
] as const;

const ARTICLE_SANKEY_LEVEL_COLORS = [
  "#0C85F5",
  "#0DCBFF",
  "#00E8DC",
] as const;

function mixEmployeeStatusColor(
  completed: number,
  notCompleted: number,
  inProgress: number
): string {
  const normalize = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
  const completedSafe = normalize(completed);
  const notCompletedSafe = normalize(notCompleted);
  const inProgressSafe = normalize(inProgress);
  const total = completedSafe + notCompletedSafe + inProgressSafe;
  if (total <= 0) {
    return "#e2e8f0";
  }

  const weights = {
    completed: completedSafe / total,
    notCompleted: notCompletedSafe / total,
    inProgress: inProgressSafe / total,
  };

  const baseGreen = { r: 134, g: 239, b: 172 };
  const baseRed = { r: 252, g: 165, b: 165 };
  const baseOrange = { r: 253, g: 186, b: 116 };
  const lightenFactor = 0.16;

  const blend = (channel: "r" | "g" | "b") => {
    const mixed =
      baseGreen[channel] * weights.completed +
      baseRed[channel] * weights.notCompleted +
      baseOrange[channel] * weights.inProgress;
    return Math.round(mixed + (255 - mixed) * lightenFactor);
  };

  return `rgb(${blend("r")}, ${blend("g")}, ${blend("b")})`;
}

function mapDashboardStackSeriesToTasksStatus(seriesName: string): string | undefined {
  switch (seriesName.trim()) {
    case "Выполнено":
      return "completed";
    case "Не выполнено":
      return "not_completed";
    /* "Не проверено" на дашборде перенаправляет ставит "Выполнено" в списке задач */
    case "Не проверено":
      return "completed";
    default:
      return undefined;
  }
}

function resolveGroupLabel(group: DashboardGroupStat) {
  return group.groupName || group.groupId;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapTextByWords(text: string, maxLineLength = 100) {
  const normalized = normalizeText(text);
  if (!normalized || maxLineLength <= 0 || normalized.length <= maxLineLength) {
    return normalized;
  }

  const words = normalized.split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    const candidate = `${currentLine} ${word}`;
    if (candidate.length <= maxLineLength) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

const ARTICLE_SANKEY_LABEL_ELLIPSIS = "...";

function truncateSingleLineWithEllipsis(text: string, maxLen: number): string {
  const normalized = normalizeText(text);
  if (!normalized || maxLen <= 0) return normalized;
  if (normalized.length <= maxLen) return normalized;

  const ell = ARTICLE_SANKEY_LABEL_ELLIPSIS;
  if (maxLen <= ell.length) {
    return normalized.slice(0, maxLen);
  }

  const budget = maxLen - ell.length;
  let cut = normalized.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > Math.floor(budget * 0.5)) {
    cut = cut.slice(0, lastSpace);
  }
  cut = cut.trimEnd();
  if (!cut) {
    cut = normalized.slice(0, budget);
  }
  return cut + ell;
}

function articleSankeyArticleLabelMaxChars(contributorCount: number): number {
  if (contributorCount <= 2) return 25;
  if (contributorCount <= 4) return 60;
  return 30;
}

function formatArticleSankeyNodeLabel(label: string, contributorCount: number): string {
  const maxChars = articleSankeyArticleLabelMaxChars(contributorCount);
  if (contributorCount <= 4) {
    return truncateSingleLineWithEllipsis(label, maxChars);
  }
  return wrapTextByWords(label, maxChars);
}

function formatPersonLabel(fullName?: string | null) {
  const normalized = normalizeText(fullName ?? "");
  if (!normalized) return "Не указано";
  if (/^не\s+указано$/i.test(normalized)) return "Не указано";
  if (/^не\s+удалось\s+извлечь\s+данные$/i.test(normalized)) return normalized;

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length < 2) {
    return normalized;
  }

  const surname = parts[0];
  const initials = parts
    .slice(1, 3)
    .map(part => part[0]?.toUpperCase())
    .filter(Boolean)
    .map(initial => `${initial}.`)
    .join(" ");

  return initials ? `${surname} ${initials}` : surname;
}

function formatGroupLabel(rawGroupLabel: string) {
  const normalized = normalizeText(rawGroupLabel);
  if (!normalized) return "–";
  if (/^не\s+удалось\s+извлечь\s+данные$/i.test(normalized)) return normalized;

  const groupMatch = normalized.match(/группа\s+(\d+)\.?/i);
  const groupPart = groupMatch ? `Группа ${groupMatch[1]}.` : "";

  let personPart = normalized;
  if (groupMatch?.index !== undefined) {
    personPart = normalized.slice(groupMatch.index + groupMatch[0].length);
  }
  personPart = personPart.replace(/^[-–,.:;\s]+/, "");
  personPart = personPart.replace(/^руководитель\s+группы\s*[–\-:]?\s*/i, "");
  personPart = normalizeText(personPart);

  if (!groupPart) {
    return formatPersonLabel(personPart || normalized);
  }
  if (!personPart) {
    return groupPart;
  }

  return `${groupPart} ${formatPersonLabel(personPart)}`.trim();
}

function extractGroupNumber(rawGroupLabel: string): string | null {
  const normalized = normalizeText(rawGroupLabel);
  if (!normalized) return null;
  const match = normalized.match(/группа\s+(\d+)/i);
  if (match?.[1]) {
    return match[1];
  }
  const fallbackMatch = normalized.match(/(\d+)/);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1];
  }
  return null;
}

function resolveDashboardError(err: unknown) {
  const rawMessage = getApiErrorMessage(err, "Не удалось загрузить инфографику").trim();
  if (rawMessage.toLowerCase().includes("timeout")) {
    return "Сервер формирует инфографику дольше обычного. Попробуйте обновить страницу через минуту.";
  }
  if (rawMessage.length > 0) {
    return rawMessage;
  }
  return "Не удалось загрузить инфографику";
}

function resolveQuarterCompletionColor(completionRate: number) {
  if (completionRate >= 100) return "#22c55e";
  if (completionRate <= 50) return "#ef4444";
  return "#f97316";
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function DashboardPage() {
  const { projectId, orderId } = useParams<{ projectId: string; orderId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [order, setOrder] = useState<DocumentRecord | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [articleSankey, setArticleSankey] = useState<ArticleSankeyData | null>(null);
  const [groupPersonStats, setGroupPersonStats] = useState<DashboardGroupPeopleStat[]>([]);
  const [groupPeopleQuarters, setGroupPeopleQuarters] = useState<
    Record<string, DashboardGroupPeopleStat[]>
  >({});
  const [groupActStats, setGroupActStats] = useState<DashboardGroupActStat[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<string>(ALL_QUARTERS_OPTION);
  const [statsState, setStatsState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [primaryChartId, setPrimaryChartId] = useState<DashboardChartId>("quarter-status");
  const [pendingPrimaryChartId, setPendingPrimaryChartId] = useState<DashboardChartId | null>(null);
  const [isPrimaryChartClearing, setIsPrimaryChartClearing] = useState(false);
  const [isPrimaryChartExpanded, setIsPrimaryChartExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"infographics" | "risks">("infographics");
  const [risksState, setRisksState] = useState<LoadState>("idle");
  const [risksError, setRisksError] = useState<string | null>(null);
  const [risks, setRisks] = useState<OrganizationalRiskItem[]>([]);
  const [risksSummary, setRisksSummary] = useState<OrganizationalRiskSummary | null>(null);
  const [riskLevelFilter, setRiskLevelFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const primaryChartSwitchTimeoutRef = useRef<number | null>(null);

  const loadInfographics = useCallback(
    async (options?: { force?: boolean; year?: number | null; shouldCancel?: () => boolean }) => {
      if (!projectId || !orderId) return;
      const force = options?.force ?? false;
      const requestYear = options?.year;
      const shouldCancel = options?.shouldCancel;

      setStatsState("loading");
      setError(null);

      try {
        const [projectData, orderData] = await Promise.all([
          getProject(projectId),
          getOrder(projectId, orderId),
        ]);
        if (shouldCancel?.()) return;
        setProject(projectData);
        setOrder(orderData);

        for (let attempt = 0; attempt < INFOGRAPHICS_MAX_ATTEMPTS; attempt += 1) {
          const payload = await getOrderInfographics(projectId, orderId, {
            force: force && attempt === 0,
            year: typeof requestYear === "number" ? requestYear : undefined,
          });
          if (shouldCancel?.()) return;

          if (payload.status === "ready" && payload.data) {
            const availableYearsFromPayload = (payload.data.availableYears ?? [])
              .filter(year => Number.isFinite(year))
              .map(year => Math.trunc(year))
              .sort((a, b) => a - b);
            const selectedYearFromPayload =
              typeof payload.data.selectedYear === "number" ? payload.data.selectedYear : null;
            const nextSelectedYear =
              selectedYearFromPayload !== null && availableYearsFromPayload.includes(selectedYearFromPayload)
                ? selectedYearFromPayload
                : (availableYearsFromPayload[availableYearsFromPayload.length - 1] ?? null);

            setStats(payload.data.stats);
            setArticleSankey(payload.data.articleSankey);
            setGroupPersonStats(payload.data.groupPeople);
            setGroupPeopleQuarters(payload.data.groupPeopleQuarters ?? {});
            setGroupActStats(payload.data.groupActs ?? []);
            setAvailableYears(availableYearsFromPayload);
            setSelectedYear(nextSelectedYear);
            setStatsState("idle");
            return;
          }
          if (payload.status === "error") {
            throw new Error(payload.error || "Не удалось подготовить инфографику");
          }

          if (attempt < INFOGRAPHICS_MAX_ATTEMPTS - 1) {
            await delay(INFOGRAPHICS_POLL_INTERVAL_MS);
          }
        }
        throw new Error(
          "Сервер продолжает формировать инфографику. Попробуйте обновить страницу через минуту."
        );
      } catch (err) {
        if (shouldCancel?.()) return;
        console.error(err);
        setGroupPersonStats([]);
        setGroupPeopleQuarters({});
        setGroupActStats([]);
        setAvailableYears([]);
        setSelectedYear(null);
        setStatsState("error");
        setError(resolveDashboardError(err));
      }
    },
    [orderId, projectId]
  );

  useEffect(() => {
    let cancelled = false;
    void loadInfographics({
      shouldCancel: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [loadInfographics]);

  const sortedAvailableYears = useMemo(() => [...availableYears].sort((a, b) => b - a), [availableYears]);

  const effectiveSelectedYear = useMemo(() => {
    if (selectedYear !== null && availableYears.includes(selectedYear)) {
      return selectedYear;
    }
    return availableYears[availableYears.length - 1] ?? null;
  }, [availableYears, selectedYear]);

  const effectiveSelectedQuarter = useMemo(() => {
    if (selectedQuarter === ALL_QUARTERS_OPTION) return null;
    const quarter = Number(selectedQuarter);
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return null;
    return quarter;
  }, [selectedQuarter]);

  const loadRisks = useCallback(
    async (options?: { year?: number | null; quarter?: number | null; groupId?: string | null }) => {
      if (!projectId || !orderId) return;
      setRisksState("loading");
      setRisksError(null);
      try {
        const payload = await getOrderRisks(projectId, orderId, {
          year: typeof options?.year === "number" ? options.year : undefined,
          quarter: typeof options?.quarter === "number" ? options.quarter : undefined,
          groupId: options?.groupId ? options.groupId : undefined,
        });
        setRisks(payload.risks ?? []);
        setRisksSummary(payload.summary ?? { total: 0, high: 0, medium: 0, low: 0 });
        setRisksState("idle");
      } catch (err) {
        console.error(err);
        setRisks([]);
        setRisksSummary({ total: 0, high: 0, medium: 0, low: 0 });
        setRisksState("error");
        setRisksError(getApiErrorMessage(err, "Не удалось загрузить организационные риски"));
      }
    },
    [orderId, projectId]
  );

  const sortedGroups = useMemo(() => {
    if (!stats) return [];
    return [...stats.groups].sort((a, b) => resolveGroupLabel(a).localeCompare(resolveGroupLabel(b)));
  }, [stats]);

  const effectiveSelectedGroupId = useMemo(() => {
    if (selectedGroupId === "all") return "all";
    if (!stats) return selectedGroupId;
    return stats.groups.some(group => group.groupId === selectedGroupId) ? selectedGroupId : "all";
  }, [selectedGroupId, stats]);

  const selectedGroup = useMemo(() => {
    if (!stats || effectiveSelectedGroupId === "all") return null;
    return stats.groups.find(group => group.groupId === effectiveSelectedGroupId) ?? null;
  }, [stats, effectiveSelectedGroupId]);

  useEffect(() => {
    if (activeTab !== "risks") return;
    void loadRisks({
      year: effectiveSelectedYear,
      quarter: effectiveSelectedQuarter,
      groupId: effectiveSelectedGroupId === "all" ? null : effectiveSelectedGroupId,
    });
  }, [
    activeTab,
    effectiveSelectedGroupId,
    effectiveSelectedQuarter,
    effectiveSelectedYear,
    loadRisks,
  ]);

  const isSingleGroupSelected = effectiveSelectedGroupId !== "all" && !!selectedGroup;

  const selectedGroupNumber = useMemo(() => {
    if (!selectedGroup) return null;
    const label = resolveGroupLabel(selectedGroup);
    return extractGroupNumber(label);
  }, [selectedGroup]);

  const quarterStats: DashboardQuarterStat[] = useMemo(() => {
    if (!stats) return [];
    if (effectiveSelectedGroupId === "all") {
      return stats.quarters;
    }
    const fallback = QUARTERS.map(quarter => ({
      quarter,
      completed: 0,
      notCompleted: 0,
      unverified: 0,
      completionRate: 0,
    }));
    if (!selectedGroup) {
      return fallback;
    }
    const data = selectedGroup.quarters;
    if (!Array.isArray(data) || data.length !== 4) {
      return fallback;
    }
    return data;
  }, [stats, selectedGroup, effectiveSelectedGroupId]);

  const filteredQuarterStats = useMemo(() => {
    if (effectiveSelectedQuarter === null) {
      return quarterStats;
    }
    return quarterStats.filter(item => item.quarter === effectiveSelectedQuarter);
  }, [effectiveSelectedQuarter, quarterStats]);

  const quarterGaugeData = useMemo(() => {
    const quarterStatsMap = new Map<number, DashboardQuarterStat>(
      quarterStats.map(item => [item.quarter, item])
    );

    return QUARTERS.map(quarter => {
      const rawCompletionRate = quarterStatsMap.get(quarter)?.completionRate ?? 0;
      const completionRate = Math.max(0, Math.min(100, Math.round(rawCompletionRate * 10) / 10));
      return {
        quarter,
        completionRate,
        color: resolveQuarterCompletionColor(completionRate),
      };
    });
  }, [quarterStats]);

  const quarterGaugeGroupBreakdown = useMemo(() => {
    const sourceGroups =
      effectiveSelectedGroupId === "all" ? sortedGroups : selectedGroup ? [selectedGroup] : [];
    const breakdown = new Map<number, Array<{ label: string; completionRate: number }>>();

    for (const quarter of QUARTERS) {
      breakdown.set(
        quarter,
        sourceGroups.map(group => {
          const quarterStat = group.quarters.find(item => item.quarter === quarter);
          const rawCompletionRate = quarterStat?.completionRate ?? 0;
          const completionRate = Math.max(0, Math.min(100, Math.round(rawCompletionRate * 10) / 10));
          return {
            label: resolveGroupLabel(group),
            completionRate,
          };
        })
      );
    }

    return breakdown;
  }, [effectiveSelectedGroupId, selectedGroup, sortedGroups]);

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentQuarter = Math.floor(currentDate.getMonth() / 3) + 1;
  const currentQuarterGaugeValue = useMemo(() => {
    if (typeof effectiveSelectedYear !== "number") {
      return Math.max(0, Math.min(4, currentQuarter - 0.5));
    }
    if (effectiveSelectedYear < currentYear) {
      return 4;
    }
    if (effectiveSelectedYear > currentYear) {
      return 0;
    }
    return Math.max(0, Math.min(4, currentQuarter - 0.5));
  }, [currentQuarter, currentYear, effectiveSelectedYear]);

  const groupSizeData = useMemo(() => {
    if (!stats) return [];
    const sourceGroups = effectiveSelectedGroupId === "all" ? sortedGroups : selectedGroup ? [selectedGroup] : [];
    if (effectiveSelectedQuarter === null) {
      return sourceGroups;
    }
    return sourceGroups.map(group => {
      const quarterStat = group.quarters.find(item => item.quarter === effectiveSelectedQuarter);
      const completed = quarterStat?.completed ?? 0;
      const notCompleted = quarterStat?.notCompleted ?? 0;
      const unverified = quarterStat?.unverified ?? 0;
      const total = completed + notCompleted + unverified;
      const completionRate = total ? Math.round((completed / total) * 1000) / 10 : 0;
      return {
        ...group,
        total,
        completed,
        notCompleted,
        unverified,
        completionRate,
      };
    });
  }, [stats, effectiveSelectedGroupId, selectedGroup, sortedGroups, effectiveSelectedQuarter]);

  const groupActPolarData = useMemo(() => {
    const source =
      effectiveSelectedGroupId === "all"
        ? groupActStats
        : groupActStats.filter(group => group.groupId === effectiveSelectedGroupId);
    return [...source]
      .map(group => ({
        ...group,
        quartersLoaded:
          effectiveSelectedQuarter === null
            ? group.quartersLoaded
            : group.quartersLoaded.filter(quarter => quarter === effectiveSelectedQuarter),
      }))
      .sort((a, b) =>
      formatGroupLabel(a.groupName).localeCompare(formatGroupLabel(b.groupName), "ru")
      );
  }, [effectiveSelectedGroupId, groupActStats, effectiveSelectedQuarter]);

  const groupPersonTreemapData = useMemo(() => {
    const hasQuarterSlices = Object.keys(groupPeopleQuarters).length > 0;
    const baseStats =
      effectiveSelectedQuarter === null
        ? groupPersonStats
        : hasQuarterSlices
          ? groupPeopleQuarters[String(effectiveSelectedQuarter)] ?? []
          : groupPersonStats;

    const source =
      effectiveSelectedGroupId === "all"
        ? baseStats
        : baseStats.filter(group => group.groupId === effectiveSelectedGroupId);

    return source
      .filter(group => group.total > 0)
      .map(group => {
        const children = group.people
          .map(person => {
            const completed = Math.max(0, person.completed ?? 0);
            const notCompleted = Math.max(0, person.notCompleted ?? 0);
            const inProgress = Math.max(0, person.inProgress ?? 0);
            const statusTotal = completed + notCompleted + inProgress;
            const fallbackTaskCount = Math.max(0, person.taskCount ?? 0);
            const value = statusTotal > 0 ? statusTotal : fallbackTaskCount;
            return {
              name: formatPersonLabel(person.fullName),
              value,
              fullName: person.fullName,
              groupId: group.groupId,
              completed,
              notCompleted,
              inProgress,
              itemStyle: {
                color: mixEmployeeStatusColor(completed, notCompleted, inProgress),
              },
            };
          })
          .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ru"));
        const total = children.reduce((sum, item) => sum + item.value, 0);

        return {
          name: formatGroupLabel(group.groupName),
          value: total,
          groupId: group.groupId,
          children,
        };
      });
  }, [
    effectiveSelectedGroupId,
    effectiveSelectedQuarter,
    groupPeopleQuarters,
    groupPersonStats,
  ]);

  const hasGroupPersonTreemapData = useMemo(
    () => groupPersonTreemapData.some(group => (group.children?.length ?? 0) > 0),
    [groupPersonTreemapData]
  );

  const summary = useMemo(() => {
    if (!stats) {
      return { total: 0, completed: 0, notCompleted: 0, unverified: 0, completionRate: 0 };
    }
    if (effectiveSelectedGroupId !== "all" && selectedGroup && effectiveSelectedQuarter === null) {
      return {
        total: selectedGroup.total,
        completed: selectedGroup.completed,
        notCompleted: selectedGroup.notCompleted,
        unverified: selectedGroup.unverified,
        completionRate: selectedGroup.completionRate,
      };
    }
    const completed = groupSizeData.reduce((sum, group) => sum + group.completed, 0);
    const notCompleted = groupSizeData.reduce((sum, group) => sum + group.notCompleted, 0);
    const unverified = groupSizeData.reduce((sum, group) => sum + group.unverified, 0);
    const total = completed + notCompleted + unverified;
    const completionRate = total ? Math.round((completed / total) * 1000) / 10 : 0;
    return { total, completed, notCompleted, unverified, completionRate };
  }, [stats, effectiveSelectedGroupId, selectedGroup, effectiveSelectedQuarter, groupSizeData]);

  const visibleRisksSummary = useMemo(() => {
    if (riskLevelFilter === "all") {
      return risksSummary ?? { total: risks.length, high: 0, medium: 0, low: 0 };
    }
    const counters = { total: 0, high: 0, medium: 0, low: 0 };
    for (const risk of risks) {
      if (risk.level !== riskLevelFilter) continue;
      counters.total += 1;
      if (risk.level === "high") counters.high += 1;
      if (risk.level === "medium") counters.medium += 1;
      if (risk.level === "low") counters.low += 1;
    }
    return counters;
  }, [riskLevelFilter, risks, risksSummary]);

  const filteredArticleSankey = useMemo(() => {
    if (!articleSankey) return null;
    if (effectiveSelectedGroupId === "all" || !selectedGroup) {
      return articleSankey;
    }

    const selectedGroupLabel = resolveGroupLabel(selectedGroup);
    const groupNodeIds = articleSankey.nodes
      .filter(node => node.level === 0 && node.name === selectedGroupLabel)
      .map(node => node.id);

    if (groupNodeIds.length === 0) {
      return { ...articleSankey, nodes: [], links: [] };
    }

    const visibleNodeIds = new Set<string>(groupNodeIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const link of articleSankey.links) {
        if (visibleNodeIds.has(link.source) && !visibleNodeIds.has(link.target)) {
          visibleNodeIds.add(link.target);
          changed = true;
        }
      }
    }

    return {
      ...articleSankey,
      nodes: articleSankey.nodes.filter(node => visibleNodeIds.has(node.id)),
      links: articleSankey.links.filter(
        link => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target)
      ),
    };
  }, [articleSankey, effectiveSelectedGroupId, selectedGroup]);

  const sankeyNodeLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const node of filteredArticleSankey?.nodes ?? []) {
      labels[node.id] = node.name;
    }
    return labels;
  }, [filteredArticleSankey]);

  const sankeyNodeDisplayLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const node of filteredArticleSankey?.nodes ?? []) {
      if (node.id.startsWith("group:")) {
        labels[node.id] = formatGroupLabel(node.name);
      } else if (node.id.startsWith("person:")) {
        labels[node.id] = formatPersonLabel(node.name);
      } else {
        labels[node.id] = node.name;
      }
    }
    return labels;
  }, [filteredArticleSankey]);

  const sankeyNodeFullTextById = useMemo(() => {
    const fullTextById: Record<string, string> = {};
    for (const node of filteredArticleSankey?.nodes ?? []) {
      if (node.id.startsWith("article:") && node.fullText) {
        fullTextById[node.id] = normalizeText(node.fullText);
      }
    }
    return fullTextById;
  }, [filteredArticleSankey]);

  const articleContributorCountByNodeId = useMemo(() => {
    const peopleByArticle = new Map<string, Set<string>>();
    for (const link of filteredArticleSankey?.links ?? []) {
      if (!link.target.startsWith("article:") || !link.source.startsWith("person:")) {
        continue;
      }
      if (!peopleByArticle.has(link.target)) {
        peopleByArticle.set(link.target, new Set());
      }
      peopleByArticle.get(link.target)!.add(link.source);
    }
    const counts: Record<string, number> = {};
    peopleByArticle.forEach((set, nodeId) => {
      counts[nodeId] = set.size;
    });
    return counts;
  }, [filteredArticleSankey]);

  const handleArticleSankeyClick = useCallback(
    (params: { dataType?: string; data?: { name?: string }; name?: string }) => {
      if (!projectId || !orderId || params?.dataType !== "node") return;
      const nodeId =
        (typeof params?.data?.name === "string" ? params.data.name : undefined) ??
        (typeof params?.name === "string" ? params.name : undefined);
      if (!nodeId) return;

      if (nodeId.startsWith("group:")) {
        const groupLabel = (sankeyNodeLabels[nodeId] ?? nodeId.slice("group:".length)).trim();
        const group = stats?.groups.find(g => resolveGroupLabel(g) === groupLabel);
        if (group?.groupId) {
          const q = new URLSearchParams({ group: group.groupId });
          navigate(`/projects/${projectId}/${orderId}/tasks?${q}`);
        }
        return;
      }

      if (nodeId.startsWith("person:")) {
        const personName = (sankeyNodeLabels[nodeId] ?? nodeId.slice("person:".length)).trim();
        if (!personName) return;
        const q = new URLSearchParams({ search: personName });
        navigate(`/projects/${projectId}/${orderId}/tasks?${q}`);
      }
    },
    [navigate, orderId, projectId, sankeyNodeLabels, stats?.groups]
  );

  const appendDashboardTasksFiltersToSearchParams = useCallback(
    (
      q: URLSearchParams,
      opts?: {
        groupId?: string | null;
        clickedCalendarQuarter?: number | null;
      }
    ) => {
      const fromClick = opts?.groupId?.trim();
      const fromSlice =
        effectiveSelectedGroupId !== "all" ? effectiveSelectedGroupId.trim() : "";
      const gid = (fromClick && fromClick.length > 0 ? fromClick : fromSlice) || "";
      if (gid) q.set("group", gid);
      if (typeof effectiveSelectedYear === "number") {
        q.set("year", String(effectiveSelectedYear));
      }
      const clickedQ = opts?.clickedCalendarQuarter;
      const resolvedQuarter =
        typeof clickedQ === "number" &&
        clickedQ >= 1 &&
        clickedQ <= 4 &&
        Number.isInteger(clickedQ)
          ? clickedQ
          : effectiveSelectedQuarter;
      if (resolvedQuarter !== null && typeof effectiveSelectedYear === "number") {
        q.set("quarter", `${effectiveSelectedYear}-Q${resolvedQuarter}`);
      }
    },
    [effectiveSelectedGroupId, effectiveSelectedQuarter, effectiveSelectedYear]
  );

  const handleOpenUncompletedTasks = useCallback(() => {
    if (!projectId || !orderId) return;
    const q = new URLSearchParams();
    q.set("status", "not_completed");
    appendDashboardTasksFiltersToSearchParams(q);
    navigate(`/projects/${projectId}/${orderId}/tasks?${q.toString()}`);
  }, [
    appendDashboardTasksFiltersToSearchParams,
    navigate,
    orderId,
    projectId,
  ]);

  const handleGroupPersonTreemapClick = useCallback(
    (params: {
      data?: { groupId?: string; fullName?: string | null };
      treePathInfo?: Array<{ name?: string }>;
    }) => {
      if (!projectId || !orderId) return;
      const data = params?.data;
      const searchRaw = data?.fullName?.trim();
      const groupFromBlock = data?.groupId?.trim();

      const q = new URLSearchParams();
      if (searchRaw) q.set("search", searchRaw);
      appendDashboardTasksFiltersToSearchParams(q, {
        groupId: groupFromBlock || undefined,
      });
      navigate(`/projects/${projectId}/${orderId}/tasks?${q.toString()}`);
    },
    [appendDashboardTasksFiltersToSearchParams, navigate, orderId, projectId]
  );

  const handleQuarterStatusChartClick = useCallback(
    (params: { componentType?: string; seriesType?: string; seriesName?: string; dataIndex?: number }) => {
      if (!projectId || !orderId) return;
      if (params.componentType !== "series" || typeof params.dataIndex !== "number") return;
      const row = filteredQuarterStats[params.dataIndex];
      if (!row || typeof row.quarter !== "number") return;

      const status = mapDashboardStackSeriesToTasksStatus(String(params.seriesName ?? ""));
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      appendDashboardTasksFiltersToSearchParams(q, {
        clickedCalendarQuarter: row.quarter,
      });
      navigate(`/projects/${projectId}/${orderId}/tasks?${q.toString()}`);
    },
    [
      appendDashboardTasksFiltersToSearchParams,
      filteredQuarterStats,
      navigate,
      orderId,
      projectId,
    ]
  );

  const handleGroupStatusChartClick = useCallback(
    (params: { componentType?: string; seriesType?: string; seriesName?: string; dataIndex?: number }) => {
      if (!projectId || !orderId) return;
      if (params.componentType !== "series" || typeof params.dataIndex !== "number") return;
      const group = groupSizeData[params.dataIndex];
      if (!group?.groupId) return;

      const status = mapDashboardStackSeriesToTasksStatus(String(params.seriesName ?? ""));
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      appendDashboardTasksFiltersToSearchParams(q, {
        groupId: group.groupId,
      });
      navigate(`/projects/${projectId}/${orderId}/tasks?${q.toString()}`);
    },
    [
      appendDashboardTasksFiltersToSearchParams,
      groupSizeData,
      navigate,
      orderId,
      projectId,
    ]
  );

  useEffect(() => {
    return () => {
      if (primaryChartSwitchTimeoutRef.current !== null) {
        window.clearTimeout(primaryChartSwitchTimeoutRef.current);
      }
    };
  }, []);

  const handlePrimaryChartSwap = useCallback(
    (nextChartId: DashboardChartId) => {
      if (nextChartId === primaryChartId && !isPrimaryChartClearing) return;

      if (primaryChartSwitchTimeoutRef.current !== null) {
        window.clearTimeout(primaryChartSwitchTimeoutRef.current);
      }

      setPendingPrimaryChartId(nextChartId);
      setIsPrimaryChartClearing(true);
      primaryChartSwitchTimeoutRef.current = window.setTimeout(() => {
        setPrimaryChartId(nextChartId);
        setPendingPrimaryChartId(null);
        setIsPrimaryChartClearing(false);
        primaryChartSwitchTimeoutRef.current = null;
      }, PRIMARY_CHART_SWITCH_DELAY_MS);
    },
    [isPrimaryChartClearing, primaryChartId]
  );

  const secondaryChartIds = useMemo(
    () => DASHBOARD_CHART_ORDER.filter(chartId => chartId !== primaryChartId),
    [primaryChartId]
  );

  const resolveChartTitle = useCallback(
    (chartId: DashboardChartId) => {
      const baseTitle = DASHBOARD_CHART_TITLES[chartId];
      const isSingleGroup = effectiveSelectedGroupId !== "all" && !!selectedGroup && !!selectedGroupNumber;
      const quarterSuffix =
        effectiveSelectedQuarter === null ? "" : ` (Квартал ${effectiveSelectedQuarter})`;

      if (!isSingleGroup) {
        if (chartId === "group-status") {
          return `Статусы задач по группам${quarterSuffix}`;
        }
        return `${baseTitle}${quarterSuffix}`;
      }

      const groupLabelSuffix = ` (Группа ${selectedGroupNumber})`;

      if (chartId === "group-status") {
        return `Статусы задач по группе${quarterSuffix}`;
      }

      if (chartId === "quarter-status" || chartId === "quarter-gauge") { // || chartId === "quarter-completion"
        return `${baseTitle}${groupLabelSuffix}${quarterSuffix}`;
      }

      return `${baseTitle}${quarterSuffix}`;
    },
    [effectiveSelectedGroupId, selectedGroup, selectedGroupNumber, effectiveSelectedQuarter]
  );

  const renderDashboardChart = (chartId: DashboardChartId, isPrimary: boolean) => {
    const chartHeight = isPrimary ? (isPrimaryChartExpanded ? "calc(100vh - 220px)" : 620) : 236;
    const minHeight = isPrimary ? (isPrimaryChartExpanded ? "calc(100vh - 160px)" : 670) : 276;
    const chartContainerStyle = {
      minHeight,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    } as const;

    switch (chartId) {
      case "quarter-status":
        return (
          <div style={{ ...chartContainerStyle, cursor: "pointer" }}>
            <ReactECharts
              style={{ height: chartHeight, width: "100%" }}
              onEvents={{ click: handleQuarterStatusChartClick }}
              option={{
                tooltip: { trigger: "axis" },
                legend: { top: isPrimary ? 0 : 4, left: "center" },
                grid: { left: 40, right: 24, top: isPrimary ? 92 : 74, bottom: isPrimary ? 40 : 30 },
                xAxis: {
                  type: "category",
                  name: "Квартал",
                  nameLocation: "middle",
                  nameGap: isPrimary ? 28 : 24,
                  data: filteredQuarterStats.map(item => `${item.quarter}`),
                },
                yAxis: {
                  type: "value",
                  name: "Задачи",
                  nameLocation: "middle",
                  nameGap: isPrimary ? 42 : 34,
                },
                series: [
                  {
                    name: "Выполнено",
                    type: "bar",
                    stack: "total",
                    data: filteredQuarterStats.map(item => item.completed),
                    itemStyle: { color: "#22c55e" },
                  },
                  {
                    name: "Не выполнено",
                    type: "bar",
                    stack: "total",
                    data: filteredQuarterStats.map(item => item.notCompleted),
                    itemStyle: { color: "#f97316" },
                  },
                  {
                    name: "Не проверено",
                    type: "bar",
                    stack: "total",
                    data: filteredQuarterStats.map(item => item.unverified),
                    itemStyle: { color: "#8b5cf6" },
                  },
                ],
              }}
            />
          </div>
        );

      case "group-status":
        return (
          <div style={{ ...chartContainerStyle, cursor: "pointer" }}>
            <ReactECharts
              style={{ height: chartHeight, width: "100%" }}
              onEvents={{ click: handleGroupStatusChartClick }}
              option={{
                tooltip: { trigger: "axis" },
                legend: { top: isPrimary ? 0 : 4, left: "center" },
                grid: { left: 40, right: 24, top: isPrimary ? 92 : 74, bottom: isPrimary ? 80 : 52 },
                xAxis: {
                  type: "category",
                  name: "Группа",
                  nameLocation: "middle",
                  nameGap: isPrimary ? 46 : 36,
                  data: groupSizeData.map(group => {
                    const label = resolveGroupLabel(group);
                    const match = label.match(/группа\s+(\d+)/i);
                    if (match && match[1]) {
                      return match[1];
                    }
                    const fallbackMatch = label.match(/(\d+)/);
                    if (fallbackMatch && fallbackMatch[1]) {
                      return fallbackMatch[1];
                    }
                    return label;
                  }),
                },
                yAxis: {
                  type: "value",
                  name: "Задачи",
                  nameLocation: "middle",
                  nameGap: isPrimary ? 42 : 34,
                },
                series: [
                  {
                    name: "Выполнено",
                    type: "bar",
                    stack: "total",
                    data: groupSizeData.map(group => group.completed),
                    itemStyle: { color: "#22c55e" },
                  },
                  {
                    name: "Не выполнено",
                    type: "bar",
                    stack: "total",
                    data: groupSizeData.map(group => group.notCompleted),
                    itemStyle: { color: "#f97316" },
                  },
                  {
                    name: "Не проверено",
                    type: "bar",
                    stack: "total",
                    data: groupSizeData.map(group => group.unverified),
                    itemStyle: { color: "#8b5cf6" },
                  },
                ],
              }}
            />
          </div>
        );

      // case "quarter-completion":
      //   return (
      //     <div style={chartContainerStyle}>
      //       <ReactECharts
      //         style={{ height: chartHeight, width: "100%" }}
      //         option={{
      //           tooltip: { trigger: "axis", valueFormatter: (value: number) => `${value}%` },
      //           grid: { left: 40, right: 24, top: isPrimary ? 92 : 74, bottom: isPrimary ? 40 : 30 },
      //           xAxis: {
      //             type: "category",
      //             name: "Квартал",
      //             nameLocation: "middle",
      //             nameGap: isPrimary ? 28 : 24,
      //             data: quarterStats.map(item => `${item.quarter}`),
      //           },
      //           yAxis: {
      //             type: "value",
      //             max: 100,
      //             name: "%",
      //             nameLocation: "middle",
      //             nameGap: isPrimary ? 48 : 36,
      //           },
      //           series: [
      //             {
      //               name: "Ось Ox",
      //               type: "bar",
      //               data: quarterStats.map(item => item.completionRate),
      //               barWidth: 2,
      //               itemStyle: { color: "#a5b4fc" },
      //               emphasis: { disabled: true },
      //               tooltip: { show: false },
      //             },
      //             {
      //               name: "% выполнения",
      //               type: "scatter",
      //               data: quarterStats.map(item => item.completionRate),
      //               symbolSize: isPrimary ? 10 : 8,
      //               itemStyle: { color: "#6366f1" },
      //             },
      //           ],
      //         }}
      //       />
      //     </div>
      //   );

      case "quarter-gauge":
        return (
          <div style={{ ...chartContainerStyle, alignItems: "stretch", justifyContent: "flex-start" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                minWidth: isPrimary ? 240 : 180,
                maxWidth: isPrimary ? 280 : 210,
                marginRight: isPrimary ? 20 : 12,
              }}
            >
              <div
                style={{
                  width: "100%",
                  padding: isPrimary ? "12px 10px" : "10px 8px",
                  borderRadius: 10,
                  background: "rgba(148, 163, 184, 0.08)",
                }}
              >
                <div
                  style={{
                    fontSize: isPrimary ? 13 : 12,
                    fontWeight: 600,
                    color: "#0f172a",
                    marginBottom: 8,
                  }}
                >
                  Процент выполнения задач
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  {QUARTER_GAUGE_LEGEND_ITEMS.map(item => (
                    <li
                      key={item.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "#334155",
                        fontSize: isPrimary ? 13 : 12,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: 999,
                          backgroundColor: item.color,
                          flexShrink: 0,
                        }}
                      />
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ReactECharts
                style={{ height: chartHeight, width: "100%" }}
                option={{
                  tooltip: {
                    trigger: "item",
                    formatter: (params: {
                      seriesName?: string;
                      data?: {
                        quarter?: number;
                        completionRate?: number;
                        isPlaceholder?: boolean;
                      };
                    }) => {
                      if (params.seriesName !== "Кварталы" || params.data?.isPlaceholder) return "";
                      const quarter = params.data?.quarter ?? "–";
                      const completionRate = params.data?.completionRate ?? 0;
                      const quarterNumber = typeof quarter === "number" ? quarter : 0;
                      const groupRows = quarterGaugeGroupBreakdown.get(quarterNumber) ?? [];
                      const groups = groupRows
                        .map(group => `${formatGroupLabel(group.label)}: ${group.completionRate}%`)
                        .join("<br/>");
                      return `Квартал ${quarter}<br/>Выполнение: ${completionRate}%${
                        groups ? `<br/><br/>По группам:<br/>${groups}` : ""
                      }`;
                    },
                  },
                  series: [
                    {
                      name: "Кварталы",
                      type: "pie",
                      radius: isPrimary ? ["60%", "98%"] : ["60%", "98%"],
                      center: isPrimary ? ["50%", "62%"] : ["50%", "62%"],
                      startAngle: 180,
                      clockwise: true,
                      avoidLabelOverlap: false,
                      itemStyle: {
                        borderColor: "#ffffff",
                        borderWidth: 2,
                      },
                      label: {
                        show: true,
                        position: isSingleGroupSelected ? "outside" : "inside",
                        color: "#0f172a",
                        fontWeight: 600,
                        fontSize: isPrimary ? 12 : 12,
                        formatter: (params: {
                          data?: { quarter?: number; completionRate?: number; isPlaceholder?: boolean };
                        }) => {
                          if (params.data?.isPlaceholder || !params.data?.quarter) return "";
                          const quarterLabel = `К${params.data.quarter}`;
                          if (!isSingleGroupSelected) {
                            return quarterLabel;
                          }
                          const completionRate = params.data.completionRate ?? 0;
                          return `${quarterLabel}: ${completionRate}%`;
                        },
                      },
                      labelLine: { show: isSingleGroupSelected, length: 10, length2: 8 },
                      data: [
                        ...quarterGaugeData.map(item => ({
                          value: 1,
                          quarter: item.quarter,
                          completionRate: item.completionRate,
                          itemStyle: { color: item.color },
                        })),
                        {
                          value: 4,
                          isPlaceholder: true,
                          quarter: 0,
                          completionRate: 0,
                          itemStyle: {
                            color: "rgba(0,0,0,0)",
                            borderColor: "rgba(0,0,0,0)",
                            borderWidth: 0,
                          },
                          label: { show: false },
                          tooltip: { show: false },
                          emphasis: { disabled: true },
                        },
                      ],
                    },
                    {
                      name: "Текущий квартал",
                      type: "gauge",
                      min: 0,
                      max: 4,
                      startAngle: 180,
                      endAngle: 0,
                      center: isPrimary ? ["50%", "62%"] : ["50%", "62%"],
                      radius: isPrimary ? "98%" : "98%",
                      pointer: {
                        show: true,
                        length: "80%",
                        width: 6,
                        itemStyle: { color: "#111827" },
                      },
                      anchor: {
                        show: true,
                        showAbove: true,
                        size: 10,
                        itemStyle: { color: "#111827" },
                      },
                      progress: { show: false },
                      axisLine: { show: false, lineStyle: { width: 0 } },
                      axisTick: { show: false },
                      splitLine: { show: false },
                      axisLabel: { show: false },
                      title: { show: false },
                      detail: {
                        show: true,
                        offsetCenter: isPrimary ? [0, "38%"] : [0, "38%"],
                        color: "#0f172a",
                        fontSize: isPrimary ? 13 : 13,
                        fontWeight: 600,
                        formatter: `Текущий квартал ${currentYear} года: ${currentQuarter}`,
                      },
                      data: [{ value: currentQuarterGaugeValue }],
                      tooltip: { show: false },
                    },
                  ],
                }}
              />
            </div>
          </div>
        );

      case "group-acts-polar":
        return (
          <div style={chartContainerStyle}>
            {groupActPolarData.length === 0 ? (
              <div className="empty-state">Нет данных по загруженным актам.</div>
            ) : (
              <ReactECharts
                style={{ height: chartHeight, width: "100%" }}
                option={{
                  tooltip: {
                    trigger: "item",
                    formatter: (params: { seriesName?: string; dataIndex?: number }) => {
                      const dataIndex =
                        typeof params?.dataIndex === "number" ? params.dataIndex : -1;
                      const group = groupActPolarData[dataIndex];
                      if (!group) return "";

                      const quarterMatch = params?.seriesName?.match(/(\d+)/);
                      const quarter = quarterMatch ? Number(quarterMatch[1]) : NaN;
                      const isQuarterLoaded =
                        Number.isFinite(quarter) && group.quartersLoaded.includes(quarter);

                      return `${escapeHtml(formatGroupLabel(group.groupName))}<br/>${
                        params.seriesName ?? "Квартал"
                      }: ${isQuarterLoaded ? "акт загружен" : "акт не загружен"}`;
                    },
                  },
                  legend: {
                    top: isPrimary ? 0 : 4,
                    left: "center",
                    data: (effectiveSelectedQuarter === null
                      ? QUARTERS
                      : [effectiveSelectedQuarter]
                    ).map(quarter => ({
                      name: `Квартал ${quarter}`,
                      icon: "circle",
                      itemStyle: { color: QUARTER_ACT_COLORS[quarter] },
                    })),
                  },
                  polar: {
                    center: ["50%", isPrimary ? "50%" : "52%"],
                    radius: isPrimary ? "84%" : "70%",
                  },
                  angleAxis: {
                    type: "category",
                    data: groupActPolarData.map(group => {
                      const groupNumber = extractGroupNumber(group.groupName);
                      return groupNumber ? `Группа ${groupNumber}` : formatGroupLabel(group.groupName);
                    }),
                    startAngle: 90,
                    axisLabel: {
                      color: "#334155",
                      fontSize: isPrimary ? 11 : 10,
                      interval: 0,
                    },
                  },
                  radiusAxis: {
                    type: "value",
                    min: 0,
                    max: 4,
                    interval: 1,
                    axisLabel: {
                      color: "#64748b",
                      formatter: (value: number) => (value >= 1 && value <= 4 ? `К${value}` : ""),
                    },
                    axisTick: { show: false },
                    axisLine: { show: false },
                    splitLine: {
                      lineStyle: { color: "rgba(148, 163, 184, 0.35)", type: "dashed" },
                    },
                  },
                  series: (effectiveSelectedQuarter === null
                    ? QUARTERS
                    : [effectiveSelectedQuarter]
                  ).map(quarter => ({
                    name: `Квартал ${quarter}`,
                    type: "bar",
                    coordinateSystem: "polar",
                    stack: "acts",
                    roundCap: false,
                    emphasis: { focus: "series" },
                    itemStyle: {
                      color: (params: { dataIndex: number }) => {
                        const group = groupActPolarData[params.dataIndex];
                        const hasQuarter = !!group && group.quartersLoaded.includes(quarter);
                        return hasQuarter
                          ? QUARTER_ACT_COLORS[quarter]
                          : "rgba(226, 232, 240, 0.25)";
                      },
                      borderColor: "rgba(148, 163, 184, 0.4)",
                      borderWidth: 1,
                    },
                    data: groupActPolarData.map(() => 1),
                  })),
                }}
              />
            )}
          </div>
        );

      case "group-person-treemap":
        return (
          <div style={chartContainerStyle}>
            {!hasGroupPersonTreemapData ? (
              <div className="empty-state">Нет данных по сотрудникам для treemap.</div>
            ) : (
              <ReactECharts
                key={`group-person-treemap-${effectiveSelectedQuarter ?? "all"}-${effectiveSelectedGroupId}`}
                style={{ height: chartHeight, width: "100%", cursor: "pointer" }}
                onEvents={{
                  click: handleGroupPersonTreemapClick,
                }}
                option={{
                  tooltip: {
                    formatter: (params: {
                      name?: string;
                      value?: number | number[];
                      treePathInfo?: Array<{ name?: string }>;
                      data?: {
                        completed?: number;
                        notCompleted?: number;
                        inProgress?: number;
                        children?: unknown[];
                      };
                    }) => {
                      const path =
                        params.treePathInfo?.map(item => item.name).filter(Boolean).join(" / ") ??
                        params.name ??
                        "–";
                      const data = params.data;
                      const isEmployeeNode =
                        data &&
                        !Array.isArray(data.children) &&
                        (typeof data.completed === "number" ||
                          typeof data.notCompleted === "number" ||
                          typeof data.inProgress === "number");

                      if (isEmployeeNode) {
                        const completed = data.completed ?? 0;
                        const notCompleted = data.notCompleted ?? 0;
                        const inProgress = data.inProgress ?? 0;
                        return `${path}<br/>Выполнено: ${completed}<br/>Не выполнено: ${notCompleted}<br/>В работе: ${inProgress}`;
                      }

                      const rawValue = Array.isArray(params.value) ? params.value[0] : params.value;
                      const value = typeof rawValue === "number" ? rawValue : 0;
                      return `${path}<br/>Всего задач: ${value}`;
                    },
                  },
                  series: [
                    {
                      type: "treemap",
                      roam: false,
                      nodeClick: false,
                      breadcrumb: { show: false },
                      upperLabel: {
                        show: true,
                        height: isPrimary ? 24 : 20,
                      color: "#0f172a",
                        fontWeight: 600,
                        fontSize: isPrimary ? 13 : 11,
                      },
                      label: {
                        show: true,
                        fontSize: isPrimary ? 13 : 11,
                        fontWeight: 500,
                        color: "#0f172a",
                        formatter: (params: { name: string; value?: number | number[] }) => {
                          const rawValue = Array.isArray(params.value) ? params.value[0] : params.value;
                          const value = typeof rawValue === "number" ? rawValue : 0;
                          return `${params.name}\n${value}`;
                        },
                      },
                      levels: [
                        {
                          itemStyle: {
                            borderColor: "#ffffff",
                            borderWidth: 2,
                            gapWidth: 2,
                          },
                        },
                        {
                          itemStyle: {
                            borderColor: "#ffffff",
                            borderWidth: 2,
                            gapWidth: 2,
                          },
                          colorSaturation: [0.35, 0.45],
                          upperLabel: {
                            show: true,
                            color: "#0f172a",
                            fontWeight: 600,
                          },
                        },
                        {
                          itemStyle: {
                            borderColor: "#e2e8f0",
                            borderWidth: 1,
                            gapWidth: 1,
                          },
                        },
                      ],
                      data: groupPersonTreemapData,
                    },
                  ],
                }}
              />
            )}
          </div>
        );

      case "article-sankey":
        return (
          <div style={chartContainerStyle}>
            {!filteredArticleSankey ||
            filteredArticleSankey.nodes.length === 0 ||
            filteredArticleSankey.links.length === 0 ? (
              <div className="empty-state">Нет публикационных задач для отображения графика Sankey.</div>
            ) : (
              <ReactECharts
                style={{ height: chartHeight, width: "100%", cursor: "pointer" }}
                onEvents={isPrimary ? { click: handleArticleSankeyClick } : undefined}
                option={{
                  tooltip: {
                    trigger: "item",
                    formatter: (params: {
                      dataType?: "node" | "edge";
                      name?: string;
                      data?: { source?: string; target?: string; value?: number };
                      value?: number;
                    }) => {
                      if (params.dataType === "edge") {
                        const source = params.data?.source ?? "";
                        const target = params.data?.target ?? "";
                        const sourceLabel = sankeyNodeDisplayLabels[source] ?? source;
                        const targetLabel = sankeyNodeDisplayLabels[target] ?? target;
                        const value = params.data?.value ?? 0;
                        return `${escapeHtml(sourceLabel)} → ${escapeHtml(targetLabel)}<br/>Задач: ${value}`;
                      }
                      const nodeId = params.name ?? "";
                      const displayLabel = sankeyNodeDisplayLabels[nodeId] ?? nodeId;
                      if (nodeId.startsWith("article:")) {
                        const fullTaskText = wrapTextByWords(
                          sankeyNodeFullTextById[nodeId] ?? displayLabel,
                          100
                        );
                        const safeLabel = escapeHtml(displayLabel);
                        const safeFullTaskText = escapeHtml(fullTaskText).replaceAll("\n", "<br/>");
                        if (safeFullTaskText && safeFullTaskText !== safeLabel) {
                          return `<span style="color:#64748b">Полный текст задачи:</span><br/>${safeFullTaskText}`;
                        }
                        return safeLabel;
                      }
                      return escapeHtml(displayLabel);
                    },
                  },
                  series: [
                    {
                      type: "sankey",
                      left: isPrimary ? 48 : 10,
                      right: isPrimary ? 230 : 100,
                      top: isPrimary ? 40 : 10,
                      bottom: isPrimary ? 24 : 5,
                      nodeWidth: isPrimary ? 14 : 10,
                      emphasis: { focus: "adjacency" },
                      lineStyle: { color: "gradient", curveness: 0.5 },
                      label: {
                        color: "#0f172a",
                        formatter: (params: { name: string }) => {
                          const label = sankeyNodeDisplayLabels[params.name] ?? params.name;
                          if (!params.name.startsWith("article:")) {
                            return label;
                          }
                          const contributors = articleContributorCountByNodeId[params.name] ?? 0;
                          const effectiveCount = contributors > 0 ? contributors : 5;
                          return formatArticleSankeyNodeLabel(label, effectiveCount);
                        },
                      },
                      levels: [
                        { depth: 0, itemStyle: { color: ARTICLE_SANKEY_LEVEL_COLORS[0] } },
                        { depth: 1, itemStyle: { color: ARTICLE_SANKEY_LEVEL_COLORS[1] } },
                        { depth: 2, itemStyle: { color: ARTICLE_SANKEY_LEVEL_COLORS[2] } },
                      ],
                      data: filteredArticleSankey.nodes.map(node => ({
                        name: node.id,
                        depth: node.level,
                      })),
                      links: filteredArticleSankey.links,
                    },
                  ],
                }}
              />
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (!projectId || !orderId) {
    return (
      <div className="card">
        <h2>Недостаточно данных</h2>
        <p>Неверный адрес страницы. Вернитесь к списку проектов.</p>
        <Link to="/projects" className="back-link">
          ← Все проекты
        </Link>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <Link to={`/projects/${projectId}`} className="back-link">
        ← Назад к проекту
      </Link>
      <h1 className="page-title">Цифровой портрет приказа "{order?.fileName.split(".")[0] ?? "–"}"</h1>
      <p className="subtitle">Проект "{project?.name ?? "–"}"</p>

      <div className="dashboard-card">
        <div className="dashboard-tabs">
          <button
            type="button"
            className={`dashboard-tab ${activeTab === "infographics" ? "dashboard-tab--active" : ""}`}
            onClick={() => setActiveTab("infographics")}
          >
            Инфографика
          </button>
          <button
            type="button"
            className={`dashboard-tab ${activeTab === "risks" ? "dashboard-tab--active" : ""}`}
            onClick={() => setActiveTab("risks")}
          >
            Организационные риски
          </button>
        </div>
        <div className="dashboard-controls">
          <label className="form-field dashboard-group-filter">
            <span className="form-field-label">Срез</span>
            <select
              className="form-control group-name-selector"
              value={effectiveSelectedGroupId}
              onChange={event => setSelectedGroupId(event.target.value)}
              disabled={statsState === "loading"}
            >
              <option value="all">Весь проект</option>
              {sortedGroups.map(group => (
                <option key={group.groupId} value={group.groupId}>
                  {resolveGroupLabel(group)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-field-label">Квартал</span>
            <select
              className="form-control group-name-selector"
              value={selectedQuarter}
              onChange={event => setSelectedQuarter(event.target.value)}
              disabled={statsState === "loading"}
            >
              <option value={ALL_QUARTERS_OPTION}>Все кварталы</option>
              {QUARTERS.map(quarter => (
                <option key={quarter} value={quarter}>
                  {`Квартал ${quarter}`}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-field-label">Год</span>
            <select
              className="form-control group-name-selector"
              value={effectiveSelectedYear ?? ""}
              onChange={event => {
                const rawYear = event.target.value;
                const nextYear = Number(rawYear);
                if (!rawYear || Number.isNaN(nextYear)) {
                  setSelectedYear(null);
                  void loadInfographics({ year: null });
                  return;
                }
                setSelectedYear(nextYear);
                void loadInfographics({ year: nextYear });
              }}
              disabled={statsState === "loading" || sortedAvailableYears.length === 0}
            >
              {sortedAvailableYears.length === 0 ? (
                <option value="">Нет доступных лет</option>
              ) : (
                sortedAvailableYears.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            className="secondary dashboard-refresh-button"
            onClick={handleOpenUncompletedTasks}
            disabled={statsState === "loading"}
            title="Открыть список задач приказа с фильтром «Не выполнено» и текущими годом, кварталом и срезом по группе"
          >
            Невыполненные задачи
          </button>
        </div>

        {statsState === "loading" && <div>Подготовка инфографики...</div>}
        {statsState === "error" && <div style={{ color: "crimson" }}>{error ?? "Ошибка загрузки"}</div>}
        {statsState === "idle" && stats && stats.groups.length === 0 && (
          <div className="empty-state">Нет данных для отображения.</div>
        )}
        {statsState === "idle" && stats && stats.groups.length > 0 && sortedAvailableYears.length === 0 && (
          <div className="empty-state">Нет задач с указанным годом.</div>
        )}
      </div>

      {activeTab === "infographics" &&
        statsState === "idle" &&
        stats &&
        stats.groups.length > 0 &&
        sortedAvailableYears.length > 0 && (
        <div
          className={`dashboard-charts-shell${
            isPrimaryChartExpanded ? " dashboard-charts-shell--expanded" : ""
          }`}
        >
          <div className="dashboard-primary-panel">
            <div className="card dashboard-chart-card dashboard-chart-card--primary">
              <div className="dashboard-chart-header">
                <h3 style={{ margin: 0, fontSize: 15 }}>
                  {resolveChartTitle(pendingPrimaryChartId ?? primaryChartId)}
                </h3>
                <div className="dashboard-chart-header-actions">
                  <DashboardChartHelpButton chartId={pendingPrimaryChartId ?? primaryChartId} />
                  <button
                    type="button"
                    className="dashboard-chart-expand-button"
                    aria-label={isPrimaryChartExpanded ? "Уменьшить график" : "Увеличить график"}
                    title={isPrimaryChartExpanded ? "Уменьшить" : "Увеличить"}
                    onClick={() => setIsPrimaryChartExpanded(expanded => !expanded)}
                  >
                    <span aria-hidden="true">{isPrimaryChartExpanded ? "⤡" : "⤢"}</span>
                  </button>
                </div>
              </div>
              {isPrimaryChartClearing ? (
                <div
                  className="dashboard-chart-clearing-state"
                  aria-live="polite"
                  aria-label="Загрузка графика"
                  style={{ minHeight: isPrimaryChartExpanded ? "calc(100vh - 160px)" : 670 }}
                >
                  <div className="dashboard-chart-shimmer" aria-hidden="true">
                    <span className="dashboard-chart-shimmer__bar dashboard-chart-shimmer__bar--title" />
                    <span className="dashboard-chart-shimmer__bar dashboard-chart-shimmer__bar--legend" />
                    <span className="dashboard-chart-shimmer__bar dashboard-chart-shimmer__bar--plot" />
                  </div>
                </div>
              ) : (
                renderDashboardChart(primaryChartId, true)
              )}
            </div>
          </div>

          <div className="dashboard-secondary-panel">
            {secondaryChartIds.map((chartId, index) => (
              <div
                key={chartId}
                className="card dashboard-chart-card dashboard-chart-card--secondary"
                data-grid-pos={index}
                role="button"
                tabIndex={0}
                onClick={() => handlePrimaryChartSwap(chartId)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handlePrimaryChartSwap(chartId);
                  }
                }}
              >
                <div className="dashboard-chart-header">
                  <h3 style={{ margin: 0, fontSize: 15 }}>{resolveChartTitle(chartId)}</h3>
                  <div className="dashboard-chart-header-actions">
                    <DashboardChartHelpButton chartId={chartId} stopPropagation />
                    <span className="dashboard-chart-swap-icon" aria-hidden="true">
                      ⇄
                    </span>
                  </div>
                </div>
                {renderDashboardChart(chartId, false)}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "risks" && (
        <DashboardRisksTab
          loading={risksState === "loading"}
          error={risksError}
          risks={risks}
          levelFilter={riskLevelFilter}
          onLevelFilterChange={setRiskLevelFilter}
        />
      )}

      {activeTab === "infographics" &&
        statsState === "idle" &&
        stats &&
        stats.groups.length > 0 &&
        sortedAvailableYears.length > 0 && (
          <StatusBar multiline>
            <span>
              Всего задач: <strong>{summary.total}</strong>
            </span>
            <StatusBarDot />
            <span style={{ color: "#288d4f" }}>
              Выполнено: <strong>{summary.completed}</strong>
            </span>
            <StatusBarDot />
            <span style={{ color: "#64748b" }}>
              Не выполнено: <strong>{summary.notCompleted}</strong>
            </span>
            <StatusBarDot />
            <span style={{ color: "#a1781e" }}>
              Не проверено: <strong>{summary.unverified}</strong>
            </span>
            <StatusBarDot />
            <span style={{ color: "#3b64d4" }}>
              % выполнения: <strong>{summary.completionRate}%</strong>
            </span>
          </StatusBar>
        )}

      {activeTab === "risks" && risksState === "idle" && (
        <StatusBar multiline>
          <span>
            Всего рисков: <strong>{visibleRisksSummary.total}</strong>
          </span>
          <StatusBarDot />
          <span style={{ color: "#b91c1c" }}>
            Высокий: <strong>{visibleRisksSummary.high}</strong>
          </span>
          <StatusBarDot />
          <span style={{ color: "#b45309" }}>
            Средний: <strong>{visibleRisksSummary.medium}</strong>
          </span>
          <StatusBarDot />
          <span style={{ color: "#047857" }}>
            Низкий: <strong>{visibleRisksSummary.low}</strong>
          </span>
        </StatusBar>
      )}
    </div>
  );
}
