<template>
  <section class="multi-panel">
    <header class="panel-header">
      <h2 class="panel-title">{{ title }}</h2>
      <p class="panel-description">{{ description }}</p>
    </header>

    <div class="chart-grid">
      <InsightChartCard
        type="radar"
        :title="t('aiAnalyze.panel.radarTitle')"
        :subtitle="t('aiAnalyze.panel.radarSubtitle')"
        :option="radarOption"
        :loading="loading"
      />
      <InsightChartCard
        type="line"
        :title="t('aiAnalyze.panel.lineTitle')"
        :subtitle="t('aiAnalyze.panel.lineSubtitle')"
        :option="lineOption"
        :loading="loading"
      />
      <InsightChartCard
        type="bar"
        :title="t('aiAnalyze.panel.barTitle')"
        :subtitle="t('aiAnalyze.panel.barSubtitle')"
        :option="barOption"
        :loading="loading"
      />
      <InsightChartCard
        type="graph"
        :title="t('aiAnalyze.panel.graphTitle')"
        :subtitle="t('aiAnalyze.panel.graphSubtitle')"
        :option="graphOption"
        :loading="loading"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { EChartsOption } from 'echarts';
import InsightChartCard from './InsightChartCard.vue';
import {
  createBarChartOption,
  createGraphChartOption,
  createLineChartOption,
  createRadarChartOption,
  type GraphCategory,
  type GraphLink,
  type GraphNode,
  type RadarIndicator,
} from '../../utils/chartFactory';

interface RadarData {
  indicators: RadarIndicator[];
  values: number[];
  seriesName?: string;
}

interface CartesianData {
  categories: string[];
  values: number[];
  seriesName?: string;
  unit?: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  categories?: GraphCategory[];
  seriesName?: string;
}

interface MultiDimensionalInsightData {
  radar?: RadarData;
  line?: CartesianData;
  bar?: CartesianData;
  graph?: GraphData;
}

const { t } = useI18n();
const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    data?: MultiDimensionalInsightData;
    loading?: boolean;
  }>(),
  {
    title: 'Multi-dimensional Insight Panel',
    description: 'Unified radar, trend, comparison, and graph-network views.',
    loading: false,
  },
);

const EMPTY_OPTION: EChartsOption = {
  series: [],
};

const isValidRadarData = (value?: RadarData): value is RadarData => {
  if (!value) return false;
  return Array.isArray(value.indicators) && value.indicators.length > 0
    && Array.isArray(value.values) && value.values.length > 0;
};

const isValidCartesianData = (value?: CartesianData): value is CartesianData => {
  if (!value) return false;
  return Array.isArray(value.categories) && value.categories.length > 0
    && Array.isArray(value.values) && value.values.length > 0;
};

const isValidGraphData = (value?: GraphData): value is GraphData => {
  if (!value) return false;
  return Array.isArray(value.nodes) && value.nodes.length > 0
    && Array.isArray(value.links) && value.links.length > 0;
};

const radarOption = computed(() => {
  const radar = props.data?.radar;
  return isValidRadarData(radar) ? createRadarChartOption(radar) : EMPTY_OPTION;
});

const lineOption = computed(() => {
  const line = props.data?.line;
  return isValidCartesianData(line) ? createLineChartOption(line) : EMPTY_OPTION;
});

const barOption = computed(() => {
  const bar = props.data?.bar;
  return isValidCartesianData(bar) ? createBarChartOption(bar) : EMPTY_OPTION;
});

const graphOption = computed(() => {
  const graph = props.data?.graph;
  return isValidGraphData(graph) ? createGraphChartOption(graph) : EMPTY_OPTION;
});
</script>

<style scoped>
.multi-panel {
  border: 1px solid #dbe4ef;
  border-radius: 18px;
  padding: 20px;
  background:
    radial-gradient(circle at right top, rgba(59, 130, 246, 0.08), transparent 48%),
    linear-gradient(180deg, #f9fcff 0%, #f8fafc 100%);
}

.panel-header {
  margin-bottom: 16px;
}

.panel-title {
  margin: 0;
  color: #0f172a;
  font-size: 21px;
  line-height: 1.3;
  font-weight: 700;
}

.panel-description {
  margin: 8px 0 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.6;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 1100px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .multi-panel {
    padding: 14px;
    border-radius: 14px;
  }

  .panel-title {
    font-size: 19px;
  }
}
</style>
