import type { EChartsOption } from 'echarts';

export type InsightChartType = 'radar' | 'line' | 'bar' | 'graph';

export interface RadarIndicator {
  name: string;
  max: number;
}

export interface RadarChartInput {
  indicators: RadarIndicator[];
  values: number[];
  seriesName?: string;
}

export interface CartesianChartInput {
  categories: string[];
  values: number[];
  seriesName?: string;
  unit?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  value?: number;
  category?: number;
  symbolSize?: number;
  draggable?: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  value?: number;
}

export interface GraphCategory {
  name: string;
}

export interface GraphChartInput {
  nodes: GraphNode[];
  links: GraphLink[];
  categories?: GraphCategory[];
  seriesName?: string;
}

const PALETTE = {
  primary: '#1e40af',
  secondary: '#3b82f6',
  accent: '#0f172a',
  background: '#f8fafc',
  border: '#dbe4ef',
  textStrong: '#1e293b',
  textMuted: '#64748b',
  splitLine: '#e2e8f0',
  edge: '#94a3b8',
} as const;

const GRAPH_NODE_COLORS = ['#1e40af', '#2563eb', '#3b82f6', '#475569'] as const;

const COMMON_ANIMATION = {
  animationDuration: 850,
  animationDurationUpdate: 500,
  animationEasing: 'cubicOut',
  animationEasingUpdate: 'cubicInOut',
} as const;

const BASE_TOOLTIP = {
  backgroundColor: 'rgba(248, 250, 252, 0.98)',
  borderColor: PALETTE.border,
  borderWidth: 1,
  textStyle: { color: PALETTE.textStrong, fontSize: 12 },
  extraCssText: 'box-shadow: 0 10px 26px rgba(15, 23, 42, 0.12); border-radius: 10px;',
};

const DEFAULT_GRID = {
  left: 42,
  right: 20,
  top: 36,
  bottom: 34,
};

const getUnitSuffix = (unit?: string): string => (unit ? ` (${unit})` : '');

export const getResponsiveChartHeight = (viewportWidth?: number): number => {
  const width = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);
  if (width <= 640) {
    return 260;
  }
  if (width <= 1024) {
    return 300;
  }
  return 340;
};

export const createRadarChartOption = (input: RadarChartInput): EChartsOption => ({
  ...COMMON_ANIMATION,
  color: [PALETTE.primary],
  tooltip: {
    ...BASE_TOOLTIP,
    trigger: 'item',
  },
  radar: {
    indicator: input.indicators,
    radius: '67%',
    axisName: {
      color: PALETTE.textMuted,
      fontSize: 12,
    },
    splitLine: {
      lineStyle: {
        color: ['#e9f0fb', '#e2e8f4', '#d6e1f2', '#c9d8ee', '#bdd0ea'],
      },
    },
    splitArea: {
      areaStyle: {
        color: ['rgba(59,130,246,0.03)', 'rgba(59,130,246,0.07)'],
      },
    },
    axisLine: {
      lineStyle: { color: '#cdd9ea' },
    },
  },
  series: [
    {
      type: 'radar',
      name: input.seriesName ?? 'Radar',
      data: [{ value: input.values, name: input.seriesName ?? 'Insight' }],
      lineStyle: { width: 2.2, color: PALETTE.primary },
      itemStyle: { color: PALETTE.primary },
      areaStyle: { color: 'rgba(30,64,175,0.22)' },
      symbol: 'circle',
      symbolSize: 6,
    },
  ],
});

export const createLineChartOption = (input: CartesianChartInput): EChartsOption => ({
  ...COMMON_ANIMATION,
  color: [PALETTE.secondary],
  tooltip: {
    ...BASE_TOOLTIP,
    trigger: 'axis',
    axisPointer: {
      type: 'line',
      lineStyle: { color: '#c8d3e3' },
    },
  },
  grid: DEFAULT_GRID,
  xAxis: {
    type: 'category',
    data: input.categories,
    boundaryGap: false,
    axisLine: { lineStyle: { color: PALETTE.border } },
    axisTick: { show: false },
    axisLabel: { color: PALETTE.textMuted },
  },
  yAxis: {
    type: 'value',
    name: getUnitSuffix(input.unit),
    nameTextStyle: { color: PALETTE.textMuted },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: PALETTE.splitLine } },
    axisLabel: { color: PALETTE.textMuted },
  },
  series: [
    {
      type: 'line',
      name: input.seriesName ?? 'Trend',
      data: input.values,
      smooth: true,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: {
        width: 3,
        color: PALETTE.secondary,
      },
      itemStyle: {
        color: PALETTE.secondary,
        borderColor: '#ffffff',
        borderWidth: 2,
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59,130,246,0.28)' },
            { offset: 1, color: 'rgba(59,130,246,0.03)' },
          ],
        },
      },
      emphasis: {
        focus: 'series',
      },
    },
  ],
});

export const createBarChartOption = (input: CartesianChartInput): EChartsOption => ({
  ...COMMON_ANIMATION,
  color: [PALETTE.primary],
  tooltip: {
    ...BASE_TOOLTIP,
    trigger: 'axis',
    axisPointer: {
      type: 'shadow',
      shadowStyle: { color: 'rgba(30, 64, 175, 0.06)' },
    },
  },
  grid: DEFAULT_GRID,
  xAxis: {
    type: 'category',
    data: input.categories,
    axisLine: { lineStyle: { color: PALETTE.border } },
    axisTick: { show: false },
    axisLabel: { color: PALETTE.textMuted, interval: 0 },
  },
  yAxis: {
    type: 'value',
    name: getUnitSuffix(input.unit),
    nameTextStyle: { color: PALETTE.textMuted },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: PALETTE.splitLine } },
    axisLabel: { color: PALETTE.textMuted },
  },
  series: [
    {
      type: 'bar',
      name: input.seriesName ?? 'Comparison',
      data: input.values,
      barMaxWidth: 42,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: '#3b82f6' },
            { offset: 1, color: '#1e40af' },
          ],
        },
        borderRadius: [8, 8, 0, 0],
      },
    },
  ],
});

export const createGraphChartOption = (input: GraphChartInput): EChartsOption => ({
  ...COMMON_ANIMATION,
  backgroundColor: PALETTE.background,
  tooltip: {
    ...BASE_TOOLTIP,
    trigger: 'item',
  },
  legend: input.categories?.length
    ? {
        top: 8,
        left: 'center',
        textStyle: { color: PALETTE.textMuted },
      }
    : undefined,
  series: [
    {
      type: 'graph',
      name: input.seriesName ?? 'Network',
      layout: 'force',
      roam: true,
      draggable: true,
      label: {
        show: true,
        position: 'right',
        color: PALETTE.textStrong,
        fontSize: 12,
      },
      lineStyle: {
        color: PALETTE.edge,
        opacity: 0.72,
        width: 1.5,
        curveness: 0.06,
      },
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 2.4, color: PALETTE.primary },
      },
      force: {
        repulsion: 240,
        gravity: 0.08,
        edgeLength: [85, 160],
      },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 8],
      data: input.nodes.map((node) => ({
        ...node,
        symbolSize: node.symbolSize ?? 42,
        draggable: node.draggable ?? true,
        itemStyle: {
          color: GRAPH_NODE_COLORS[(node.category ?? 0) % GRAPH_NODE_COLORS.length],
          borderColor: '#dbeafe',
          borderWidth: 1.5,
        },
      })),
      links: input.links.map((link) => ({
        ...link,
        lineStyle: {
          color: PALETTE.edge,
          width: 1.4,
          opacity: 0.7,
        },
      })),
      categories: input.categories,
    },
  ],
});
