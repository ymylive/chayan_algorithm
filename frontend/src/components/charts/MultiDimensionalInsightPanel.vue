<template>
  <section class="multi-panel">
    <header class="panel-header">
      <h2 class="panel-title">{{ title }}</h2>
      <p class="panel-description">{{ description }}</p>
    </header>

    <div class="chart-grid">
      <InsightChartCard
        type="radar"
        title="Capability Radar"
        subtitle="Cross-domain capability profile"
        :option="radarOption"
        :loading="loading"
      />
      <InsightChartCard
        type="line"
        title="Trend Tracking"
        subtitle="Monthly trajectory and momentum"
        :option="lineOption"
        :loading="loading"
      />
      <InsightChartCard
        type="bar"
        title="Dimension Comparison"
        subtitle="Category-level value comparison"
        :option="barOption"
        :loading="loading"
      />
      <InsightChartCard
        type="graph"
        title="Relationship Network"
        subtitle="ECharts graph series for entity links"
        :option="graphOption"
        :loading="loading"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

const DEFAULT_RADAR: RadarData = {
  indicators: [
    { name: 'Growth', max: 100 },
    { name: 'Stability', max: 100 },
    { name: 'Innovation', max: 100 },
    { name: 'Efficiency', max: 100 },
    { name: 'Resilience', max: 100 },
  ],
  values: [78, 84, 71, 88, 80],
  seriesName: 'Capability',
};

const DEFAULT_LINE: CartesianData = {
  categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  values: [112, 126, 119, 141, 156, 169],
  seriesName: 'Trend',
  unit: 'index',
};

const DEFAULT_BAR: CartesianData = {
  categories: ['Revenue', 'Cost', 'Margin', 'Asset', 'Risk'],
  values: [240, 180, 92, 208, 74],
  seriesName: 'Benchmark',
  unit: 'pts',
};

const DEFAULT_GRAPH: GraphData = {
  categories: [{ name: 'Core' }, { name: 'Partner' }, { name: 'Market' }],
  nodes: [
    { id: 'enterprise', name: 'Enterprise', category: 0, symbolSize: 52, value: 100 },
    { id: 'supply', name: 'Supply Chain', category: 1, value: 72 },
    { id: 'r-and-d', name: 'R&D', category: 0, value: 83 },
    { id: 'customer', name: 'Customer', category: 2, value: 90 },
    { id: 'channel', name: 'Channel', category: 1, value: 68 },
    { id: 'policy', name: 'Policy', category: 2, value: 61 },
  ],
  links: [
    { source: 'enterprise', target: 'supply', value: 7.5 },
    { source: 'enterprise', target: 'r-and-d', value: 8.8 },
    { source: 'enterprise', target: 'customer', value: 9.1 },
    { source: 'customer', target: 'channel', value: 6.6 },
    { source: 'policy', target: 'enterprise', value: 5.8 },
    { source: 'supply', target: 'channel', value: 6.3 },
  ],
  seriesName: 'Relations',
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

const radarData = computed<RadarData>(() => (isValidRadarData(props.data?.radar) ? props.data!.radar : DEFAULT_RADAR));
const lineData = computed<CartesianData>(() => (isValidCartesianData(props.data?.line) ? props.data!.line : DEFAULT_LINE));
const barData = computed<CartesianData>(() => (isValidCartesianData(props.data?.bar) ? props.data!.bar : DEFAULT_BAR));
const graphData = computed<GraphData>(() => (isValidGraphData(props.data?.graph) ? props.data!.graph : DEFAULT_GRAPH));

const radarOption = computed(() => createRadarChartOption(radarData.value));
const lineOption = computed(() => createLineChartOption(lineData.value));
const barOption = computed(() => createBarChartOption(barData.value));
const graphOption = computed(() => createGraphChartOption(graphData.value));
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
