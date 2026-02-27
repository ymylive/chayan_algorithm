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
        v-if="!loading && hasRenderableOption"
        class="chart-view"
        :option="option"
        autoresize
        :style="{ height: `${chartHeight}px` }"
      />
      <div v-else-if="loading" class="chart-loading" aria-live="polite">{{ t('chart.loading') }}</div>
      <div v-else class="chart-empty" aria-live="polite">{{ t('chart.empty') }}</div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);
const { t } = useI18n();

const chartTypeLabel = computed(() => t(`chart.type.${props.type}`));
const chartHeight = computed(() => Math.max(props.minHeight, getResponsiveChartHeight(viewportWidth.value)));
const hasRenderableOption = computed(() => {
  const option = props.option as any;
  if (!option || typeof option !== 'object') return false;

  const seriesList = Array.isArray(option.series)
    ? option.series
    : (option.series ? [option.series] : []);
  if (seriesList.length === 0) return false;

  return seriesList.some((series: unknown) => {
    if (!series || typeof series !== 'object') return false;
    const seriesObject = series as Record<string, unknown>;
    const seriesType = String(seriesObject.type || '').trim().toLowerCase();
    const data = Array.isArray(seriesObject.data) ? seriesObject.data : [];
    const links = Array.isArray(seriesObject.links) ? seriesObject.links : [];
    const nodes = Array.isArray(seriesObject.nodes) ? seriesObject.nodes : [];
    if (seriesType === 'graph') {
      return nodes.length > 0 && links.length > 0;
    }
    if (seriesType === 'radar') {
      return data.some((item) => {
        if (!item || typeof item !== 'object') return false;
        const value = (item as Record<string, unknown>).value;
        return Array.isArray(value) && value.length > 0;
      });
    }
    return data.length > 0;
  });
});

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

.chart-empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  color: #94a3b8;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px dashed #d7e0eb;
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
