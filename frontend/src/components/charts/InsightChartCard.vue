<template>
  <article class="insight-chart-card" :class="`is-${type}`">
    <header class="card-header">
      <div>
        <h3 class="card-title">{{ title }}</h3>
        <p v-if="subtitle" class="card-subtitle">{{ subtitle }}</p>
      </div>
      <span class="chart-type">{{ chartTypeLabel }}</span>
    </header>

    <div class="card-content">
      <v-chart
        v-if="!loading"
        class="chart-view"
        :option="option"
        autoresize
        :style="{ height: `${chartHeight}px` }"
      />
      <div v-else class="chart-loading" aria-live="polite">Loading chart...</div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import VChart from 'vue-echarts';
import { getResponsiveChartHeight, type InsightChartType } from '../../utils/chartFactory';

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    type: InsightChartType;
    option: EChartsOption;
    minHeight?: number;
    loading?: boolean;
  }>(),
  {
    subtitle: '',
    minHeight: 260,
    loading: false,
  },
);

const CHART_TYPE_LABELS: Record<InsightChartType, string> = {
  radar: 'Radar',
  line: 'Line',
  bar: 'Bar',
  graph: 'Graph',
};

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);

const chartTypeLabel = computed(() => CHART_TYPE_LABELS[props.type]);
const chartHeight = computed(() => Math.max(props.minHeight, getResponsiveChartHeight(viewportWidth.value)));

const handleResize = (): void => {
  viewportWidth.value = window.innerWidth;
};

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize, { passive: true });
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize);
  }
});
</script>

<style scoped>
.insight-chart-card {
  border: 1px solid #dbe4ef;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.08);
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}

.insight-chart-card:hover {
  border-color: #bfd0ea;
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.13);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.card-title {
  margin: 0;
  font-size: 16px;
  line-height: 1.35;
  color: #0f172a;
  font-weight: 600;
}

.card-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.chart-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 28px;
  border-radius: 999px;
  padding: 0 10px;
  border: 1px solid #cfdced;
  background: #eef4fd;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 600;
}

.card-content {
  width: 100%;
}

.chart-view {
  width: 100%;
}

.chart-loading {
  min-height: 220px;
  display: grid;
  place-items: center;
  color: #64748b;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px dashed #cdd7e4;
}

@media (max-width: 640px) {
  .insight-chart-card {
    padding: 14px;
    border-radius: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .insight-chart-card {
    transition: none;
  }

  .insight-chart-card:hover {
    transform: none;
  }
}
</style>
