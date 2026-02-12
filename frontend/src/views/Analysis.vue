<template>
  <div class="analysis-container">
    <div class="content-shell">
      <h2 class="section-title">
        <el-icon><PieChart /></el-icon>
        <span>数据分析</span>
      </h2>

      <el-card class="selector-card" shadow="never">
        <div class="selector-content">
          <span class="selector-label">企业选择</span>
          <el-select
            v-model="selectedId"
            placeholder="请选择企业"
            :prefix-icon="OfficeBuilding"
            @change="fetchData"
            class="selector"
          >
            <el-option v-for="item in enterprises" :key="item.id" :label="item.name || `企业 ${item.id}`" :value="item.id" />
          </el-select>
        </div>
      </el-card>

      <div v-if="loading" class="charts-grid">
        <el-card v-for="item in 4" :key="item" class="chart-card" shadow="hover">
          <el-skeleton animated>
            <template #template>
              <el-skeleton-item variant="h3" style="width: 38%; margin-bottom: 16px;" />
              <el-skeleton-item variant="rect" style="width: 100%; height: 320px;" />
            </template>
          </el-skeleton>
        </el-card>
      </div>

      <el-result v-else-if="error" status="warning" :title="error" sub-title="请检查网络或稍后重试" />

      <el-empty v-else-if="!selectedId" description="请选择企业查看分析数据" />

      <div v-else-if="data" class="charts-grid">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-title">
              <el-icon><DataAnalysis /></el-icon>
              <span>财务健康度</span>
            </div>
          </template>
          <div class="chart-scroll">
            <v-chart :option="gaugeOpt" class="chart-view" />
          </div>
        </el-card>

        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-title">
              <el-icon><TrendCharts /></el-icon>
              <span>市场趋势</span>
            </div>
          </template>
          <div class="chart-scroll">
            <v-chart :option="lineOpt" class="chart-view" />
          </div>
        </el-card>

        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-title">
              <el-icon><Aim /></el-icon>
              <span>竞争力分析</span>
            </div>
          </template>
          <div class="chart-scroll">
            <v-chart :option="radarOpt" class="chart-view" />
          </div>
        </el-card>

        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-title">
              <el-icon><Histogram /></el-icon>
              <span>数据对比</span>
            </div>
          </template>
          <div class="chart-scroll">
            <v-chart :option="barOpt" class="chart-view" />
          </div>
        </el-card>
      </div>

      <el-empty v-else description="暂无分析数据" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import VChart from 'vue-echarts';
import { PieChart, OfficeBuilding, DataAnalysis, TrendCharts, Aim, Histogram } from '@element-plus/icons-vue';
import { gaugeOption, lineOption, radarOption, barOption } from '../utils/chartConfig';
import request from '../utils/request';

const selectedId = ref('');
const enterprises = ref([]);
const data = ref(null);
const loading = ref(false);
const error = ref('');

const DEFAULT_DATES = ['1月', '2月', '3月', '4月', '5月', '6月'];
const DEFAULT_LINE_VALUES = [120, 132, 101, 134, 90, 230];
const DEFAULT_INDICATORS = [
  { name: '市场份额', max: 100 },
  { name: '创新能力', max: 100 },
  { name: '品牌价值', max: 100 },
  { name: '客户满意度', max: 100 },
  { name: '盈利能力', max: 100 }
];
const DEFAULT_RADAR_VALUES = [80, 70, 85, 90, 75];
const DEFAULT_BAR_CATEGORIES = ['收入', '成本', '利润', '资产', '负债'];
const DEFAULT_BAR_VALUES = [200, 150, 50, 300, 100];

const normalizeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toRecord = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
};

const toNumericEntries = (value) => {
  const source = toRecord(value);
  return Object.entries(source)
    .map(([key, raw]) => [key, normalizeNumber(raw)])
    .filter(([, num]) => num !== null);
};

const normalizeAnalysisPayload = (rows) => {
  const latestByType = rows.reduce((acc, row) => {
    const type = typeof row?.analysis_type === 'string' ? row.analysis_type : '';
    if (!type || acc[type]) {
      return acc;
    }
    acc[type] = toRecord(row?.result_json);
    return acc;
  }, {});

  if (Object.keys(latestByType).length === 0) {
    return null;
  }

  return {
    financial: toRecord(latestByType.financial),
    marketTrend: toRecord(latestByType.market_trend),
    competitiveness: toRecord(latestByType.competitiveness)
  };
};

const buildLineData = (marketTrend) => {
  const trendPoints = [];
  const growthRate = normalizeNumber(marketTrend?.growth_rate);
  const prediction = normalizeNumber(marketTrend?.prediction);

  if (growthRate !== null) {
    trendPoints.push({ label: '增长率', value: growthRate });
  }
  if (prediction !== null) {
    trendPoints.push({ label: '预测值', value: prediction });
  }

  if (trendPoints.length > 0) {
    return {
      dates: trendPoints.map(point => point.label),
      values: trendPoints.map(point => point.value)
    };
  }

  return { dates: DEFAULT_DATES, values: DEFAULT_LINE_VALUES };
};

const buildRadarData = (competitiveness) => {
  const factorEntries = toNumericEntries(competitiveness?.factors);

  if (factorEntries.length > 0) {
    return {
      indicators: factorEntries.map(([name, value]) => ({
        name,
        max: Math.max(1, Math.ceil(Math.abs(value) * 1.2))
      })),
      values: factorEntries.map(([, value]) => value)
    };
  }

  return { indicators: DEFAULT_INDICATORS, values: DEFAULT_RADAR_VALUES };
};

const buildBarData = (financial) => {
  const factorEntries = toNumericEntries(financial?.factors);

  if (factorEntries.length > 0) {
    return {
      categories: factorEntries.map(([name]) => name),
      values: factorEntries.map(([, value]) => {
        if (Math.abs(value) <= 1) {
          return Number((value * 100).toFixed(2));
        }
        return Number(value.toFixed(2));
      })
    };
  }

  return { categories: DEFAULT_BAR_CATEGORIES, values: DEFAULT_BAR_VALUES };
};

const loadEnterprises = async () => {
  try {
    const res = await request.get('/enterprises', { params: { page: 1, limit: 100, page_size: 100 } });
    enterprises.value = Array.isArray(res?.data) ? res.data : [];

    if (!selectedId.value && enterprises.value.length > 0) {
      selectedId.value = enterprises.value[0].id;
      await fetchData();
    }
  } catch {
    enterprises.value = [];
  }
};

const fetchData = async () => {
  if (!selectedId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await request.get(`/analysis/${selectedId.value}`);
    const rows = Array.isArray(res?.data) ? res.data : [];
    data.value = normalizeAnalysisPayload(rows);
  } catch {
    data.value = null;
    error.value = '获取数据失败';
  } finally {
    loading.value = false;
  }
};

const gaugeOpt = computed(() => {
  if (!data.value) return {};
  const score = normalizeNumber(data.value.financial?.score);
  const safeScore = score === null ? 75 : Math.max(0, Math.min(100, score));
  return gaugeOption(safeScore);
});

const lineOpt = computed(() => {
  if (!data.value) return {};
  const lineData = buildLineData(data.value.marketTrend);
  return lineOption(lineData.dates, lineData.values);
});

const radarOpt = computed(() => {
  if (!data.value) return {};
  const radarData = buildRadarData(data.value.competitiveness);
  return radarOption(radarData.indicators, radarData.values);
});

const barOpt = computed(() => {
  if (!data.value) return {};
  const barData = buildBarData(data.value.financial);
  return barOption(barData.categories, barData.values);
});

onMounted(loadEnterprises);
</script>

<style scoped>
.analysis-container {
  background: #f5f7fb;
  padding: 24px;
}

.content-shell {
  width: min(1360px, 100%);
  margin: 0 auto;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 20px;
  font-size: 24px;
  font-weight: 600;
  color: #1f2d3d;
}

.selector-card {
  border-radius: 8px;
  margin-bottom: 20px;
}

.selector-card :deep(.el-card__body) {
  padding: 18px 22px;
}

.selector-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.selector-label {
  color: #606266;
  font-size: 14px;
  font-weight: 500;
}

.selector {
  width: min(420px, 100%);
  max-width: 100%;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.chart-card {
  border-radius: 8px;
  transition: box-shadow 0.3s;
}

.chart-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #303133;
  font-weight: 600;
}

.chart-view {
  min-width: 420px;
  height: 320px;
}

.chart-scroll,
.table-scroll {
  width: 100%;
  overflow-x: auto;
}

.table-scroll :deep(table) {
  min-width: 700px;
}

@media (max-width: 1200px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .analysis-container {
    padding: 16px;
  }

  .section-title {
    margin-bottom: 14px;
    font-size: 22px;
  }

  .selector-card {
    margin-bottom: 14px;
  }

  .selector-card :deep(.el-card__body) {
    padding: 14px;
  }

  .selector-content {
    align-items: stretch;
    gap: 10px;
  }

  .selector {
    width: 100%;
  }

  .charts-grid {
    gap: 12px;
  }

  .chart-view {
    min-width: 300px;
    height: 280px;
  }
}
</style>
