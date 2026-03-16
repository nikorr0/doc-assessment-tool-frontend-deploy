import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import {
  getOrder,
  getOrderInfographics,
  getProject,
} from "../api/projects";
import { getApiErrorMessage } from "../utils/error";
import type {
  ArticleSankeyData,
  DashboardGroupActStat,
  DashboardGroupStat,
  DashboardGroupPeopleStat,
  DashboardQuarterStat,
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
  "quarter-gauge": "Выполнение задач по кварталам",
  "group-acts-polar": "Загруженные акты по группам",
  "group-person-treemap": "Задачи по группам и сотрудникам",
  "article-sankey": "Задачи по публикациям статей",
};

const QUARTER_ACT_COLORS: Record<number, string> = {
  1: "#22c55e",
  2: "#3b82f6",
  3: "#f59e0b",
  4: "#8b5cf6",
};

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
  if (!normalized) return "—";
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
  const [groupActStats, setGroupActStats] = useState<DashboardGroupActStat[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [statsState, setStatsState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [primaryChartId, setPrimaryChartId] = useState<DashboardChartId>("quarter-status");
  const [pendingPrimaryChartId, setPendingPrimaryChartId] = useState<DashboardChartId | null>(null);
  const [isPrimaryChartClearing, setIsPrimaryChartClearing] = useState(false);
  const [isPrimaryChartExpanded, setIsPrimaryChartExpanded] = useState(false);
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
    if (effectiveSelectedGroupId === "all") {
      return sortedGroups;
    }
    return selectedGroup ? [selectedGroup] : [];
  }, [stats, effectiveSelectedGroupId, selectedGroup, sortedGroups]);

  const groupActPolarData = useMemo(() => {
    const source =
      effectiveSelectedGroupId === "all"
        ? groupActStats
        : groupActStats.filter(group => group.groupId === effectiveSelectedGroupId);
    return [...source].sort((a, b) =>
      formatGroupLabel(a.groupName).localeCompare(formatGroupLabel(b.groupName), "ru")
    );
  }, [effectiveSelectedGroupId, groupActStats]);

  const groupPersonTreemapData = useMemo(() => {
    const source =
      effectiveSelectedGroupId === "all"
        ? groupPersonStats
        : groupPersonStats.filter(group => group.groupId === effectiveSelectedGroupId);

    return source
      .filter(group => group.total > 0)
      .map(group => {
        const children = group.people
          .map(person => ({
            name: formatPersonLabel(person.fullName),
            value: person.taskCount,
            fullName: person.fullName,
          }))
          .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ru"));
        const total = children.reduce((sum, item) => sum + item.value, 0);

        return {
          name: formatGroupLabel(group.groupName),
          value: total,
          groupId: group.groupId,
          children,
        };
      });
  }, [effectiveSelectedGroupId, groupPersonStats]);

  const hasGroupPersonTreemapData = useMemo(
    () => groupPersonTreemapData.some(group => (group.children?.length ?? 0) > 0),
    [groupPersonTreemapData]
  );

  const summary = useMemo(() => {
    if (!stats) {
      return { total: 0, completed: 0, notCompleted: 0, unverified: 0, completionRate: 0 };
    }
    if (effectiveSelectedGroupId !== "all" && selectedGroup) {
      return {
        total: selectedGroup.total,
        completed: selectedGroup.completed,
        notCompleted: selectedGroup.notCompleted,
        unverified: selectedGroup.unverified,
        completionRate: selectedGroup.completionRate,
      };
    }
    const completed = stats.groups.reduce((sum, group) => sum + group.completed, 0);
    const notCompleted = stats.groups.reduce((sum, group) => sum + group.notCompleted, 0);
    const unverified = stats.groups.reduce((sum, group) => sum + group.unverified, 0);
    const total = completed + notCompleted + unverified;
    const completionRate = total ? Math.round((completed / total) * 1000) / 10 : 0;
    return { total, completed, notCompleted, unverified, completionRate };
  }, [stats, effectiveSelectedGroupId, selectedGroup]);

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

      if (!isSingleGroup) {
        if (chartId === "group-status") {
          return "Статусы задач по группам";
        }
        return baseTitle;
      }

      const groupLabelSuffix = ` (Группа ${selectedGroupNumber})`;

      if (chartId === "group-status") {
        return `Статусы задач по группе`;
      }

      if (chartId === "quarter-status" || chartId === "quarter-gauge") { // || chartId === "quarter-completion"
        return `${baseTitle}${groupLabelSuffix}`;
      }

      return baseTitle;
    },
    [effectiveSelectedGroupId, selectedGroup, selectedGroupNumber]
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
          <div style={chartContainerStyle}>
            <ReactECharts
              style={{ height: chartHeight, width: "100%" }}
              option={{
                tooltip: { trigger: "axis" },
                legend: { top: isPrimary ? 0 : 4, left: "center" },
                grid: { left: 40, right: 24, top: isPrimary ? 92 : 74, bottom: isPrimary ? 40 : 30 },
                xAxis: {
                  type: "category",
                  name: "Квартал",
                  nameLocation: "middle",
                  nameGap: isPrimary ? 28 : 24,
                  data: quarterStats.map(item => `${item.quarter}`),
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
                    data: quarterStats.map(item => item.completed),
                    itemStyle: { color: "#22c55e" },
                  },
                  {
                    name: "Не выполнено",
                    type: "bar",
                    stack: "total",
                    data: quarterStats.map(item => item.notCompleted),
                    itemStyle: { color: "#f97316" },
                  },
                  {
                    name: "Не проверено",
                    type: "bar",
                    stack: "total",
                    data: quarterStats.map(item => item.unverified),
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
              onEvents={{
                click: (params: { componentType?: string; dataIndex?: number }) => {
                  if (
                    params?.componentType === "series" &&
                    typeof params?.dataIndex === "number" &&
                    projectId &&
                    orderId
                  ) {
                    const group = groupSizeData[params.dataIndex];
                    if (group?.groupId) {
                      const q = new URLSearchParams({ group: group.groupId });
                      navigate(`/projects/${projectId}/${orderId}/tasks?${q}`);
                    }
                  }
                },
              }}
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
          <div style={chartContainerStyle}>
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
                    const quarter = params.data?.quarter ?? "—";
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
                  legend: { top: isPrimary ? 0 : 4, left: "center" },
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
                  series: QUARTERS.map(quarter => ({
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
                style={{ height: chartHeight, width: "100%", cursor: "pointer" }}
                onEvents={{
                  click: (params: {
                    data?: { groupId?: string; fullName?: string };
                    treePathInfo?: Array<{ name?: string }>;
                  }) => {
                    if (!projectId || !orderId) return;
                    const data = params?.data;
                    const fullName = data?.fullName?.trim();
                    const groupId = data?.groupId?.trim();

                    if (fullName) {
                      const q = new URLSearchParams({ search: fullName });
                      navigate(`/projects/${projectId}/${orderId}/tasks?${q}`);
                      return;
                    }

                    if (groupId) {
                      const q = new URLSearchParams({ group: groupId });
                      navigate(`/projects/${projectId}/${orderId}/tasks?${q}`);
                    }
                  },
                }}
                option={{
                  tooltip: {
                    formatter: (params: {
                      name?: string;
                      value?: number | number[];
                      treePathInfo?: Array<{ name?: string }>;
                    }) => {
                      const rawValue = Array.isArray(params.value) ? params.value[0] : params.value;
                      const value = typeof rawValue === "number" ? rawValue : 0;
                      const path =
                        params.treePathInfo?.map(item => item.name).filter(Boolean).join(" / ") ?? "";
                      if (path) {
                        return `${path}<br/>Задач: ${value}`;
                      }
                      return `${params.name ?? "—"}<br/>Задач: ${value}`;
                    },
                  },
                  series: [
                    {
                      type: "treemap",
                      roam: false,
                      nodeClick: false,
                      colorMappingBy: "index",
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
                        fontSize: isPrimary ? 12 : 10,
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
                          colorSaturation: [0.35, 0.75],
                          upperLabel: {
                            show: true,
                            color: "#0f172a",
                            fontWeight: 600,
                          },
                        },
                        {
                          itemStyle: {
                            borderColor: "#f8fafc",
                            borderWidth: 1,
                            gapWidth: 1,
                          },
                          colorSaturation: [0.35, 0.75],
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
                      left: isPrimary ? 48 : 24,
                      right: isPrimary ? 200 : 48,
                      top: isPrimary ? 40 : 24,
                      bottom: isPrimary ? 24 : 12,
                      nodeWidth: isPrimary ? 14 : 10,
                      emphasis: { focus: "adjacency" },
                      lineStyle: { color: "gradient", curveness: 0.5 },
                      label: {
                        color: "#0f172a",
                        formatter: (params: { name: string }) =>
                          sankeyNodeDisplayLabels[params.name] ?? params.name,
                      },
                      levels: [
                        { depth: 0, itemStyle: { color: "#3b82f6" } },
                        { depth: 1, itemStyle: { color: "#14b8a6" } },
                        { depth: 2, itemStyle: { color: "#f59e0b" } },
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
      <h1 className="page-title">Инфографика приказа "{order?.fileName.split(".")[0] ?? "—"}"</h1>
      <p className="subtitle">Проект "{project?.name ?? "—"}"</p>

      <div className="card">
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
          {/* <button
            type="button"
            className="secondary dashboard-refresh-button"
            onClick={() => {
              void loadInfographics({ force: true, year: effectiveSelectedYear });
            }}
            disabled={statsState === "loading"}
          >
            Обновить
          </button> */}
        </div>

        {statsState === "loading" && <div>Подготовка инфографики...</div>}
        {statsState === "error" && <div style={{ color: "crimson" }}>{error ?? "Ошибка загрузки"}</div>}
        {statsState === "idle" && stats && stats.groups.length === 0 && (
          <div className="empty-state">Нет данных для отображения.</div>
        )}
        {statsState === "idle" && stats && stats.groups.length > 0 && sortedAvailableYears.length === 0 && (
          <div className="empty-state">Нет задач с указанным годом.</div>
        )}
        {statsState === "idle" &&
          stats &&
          stats.groups.length > 0 &&
          sortedAvailableYears.length > 0 && (
          <div className="dashboard-summary">
            <div>
              <span>Всего задач</span>
              <strong>{summary.total}</strong>
            </div>
            <div>
              <span>Выполнено</span>
              <strong>{summary.completed}</strong>
            </div>
            <div>
              <span>Не выполнено</span>
              <strong>{summary.notCompleted}</strong>
            </div>
            <div>
              <span>Не проверено</span>
              <strong>{summary.unverified}</strong>
            </div>
            <div>
              <span>% выполнения</span>
              <strong>{summary.completionRate}%</strong>
            </div>
          </div>
        )}
      </div>

      {statsState === "idle" && stats && stats.groups.length > 0 && sortedAvailableYears.length > 0 && (
        <div
          className={`dashboard-charts-shell${
            isPrimaryChartExpanded ? " dashboard-charts-shell--expanded" : ""
          }`}
        >
          <div className="dashboard-primary-panel">
            <div className="card dashboard-chart-card dashboard-chart-card--primary">
              <div className="dashboard-chart-header">
                <h3 style={{ margin: 0 }}>
                  {resolveChartTitle(pendingPrimaryChartId ?? primaryChartId)}
                </h3>
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
                  <h3 style={{ margin: 0 }}>{resolveChartTitle(chartId)}</h3>
                  <span className="dashboard-chart-swap-icon" aria-hidden="true">
                    ⇄
                  </span>
                </div>
                {renderDashboardChart(chartId, false)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
