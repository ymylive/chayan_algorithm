<template>
  <div class="analysis-container">
    <h2>数据分析</h2>
    <el-select v-model="selectedId" placeholder="选择企业" @change="fetchData" style="width: 300px; margin-bottom: 20px;">
      <el-option v-for="id in enterpriseIds" :key="id" :label="`企业 ${id}`" :value="id" />
    </el-select>

    <div v-if="loading" style="text-align: center; padding: 50px;">加载中...</div>
    <div v-else-if="error" style="color: red; padding: 20px;">{{ error }}</div>
    <div v-else-if="data" class="charts-grid">
      <div class="chart-item">
        <h3>财务健康度</h3>
        <v-chart :option="gaugeOpt" style="height: 300px;" />
      </div>
      <div class="chart-item">
        <h3>市场趋势</h3>
        <v-chart :option="lineOpt" style="height: 300px;" />
      </div>
      <div class="chart-item">
        <h3>竞争力分析</h3>
        <v-chart :option="radarOpt" style="height: 300px;" />
      </div>
      <div class="chart-item">
        <h3>数据对比</h3>
        <v-chart :option="barOpt" style="height: 300px;" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import axios from 'axios';
import VChart from 'vue-echarts';
import { gaugeOption, lineOption, radarOption, barOption } from '../utils/chartConfig';

const selectedId = ref('');
const enterpriseIds = ref(['E001', 'E002', 'E003']);
const data = ref(null);
const loading = ref(false);
const error = ref('');

const fetchData = async () => {
  if (!selectedId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await axios.get(`/api/analysis/${selectedId.value}`);
    data.value = res.data;
  } catch (e) {
    error.value = '获取数据失败';
  } finally {
    loading.value = false;
  }
};

const gaugeOpt = computed(() => data.value ? gaugeOption(data.value.healthScore || 75) : {});
const lineOpt = computed(() => data.value ? lineOption(
  data.value.trend?.dates || ['1月', '2月', '3月', '4月', '5月', '6月'],
  data.value.trend?.values || [120, 132, 101, 134, 90, 230]
) : {});
const radarOpt = computed(() => data.value ? radarOption(
  data.value.competitiveness?.indicators || [
    { name: '市场份额', max: 100 },
    { name: '创新能力', max: 100 },
    { name: '品牌价值', max: 100 },
    { name: '客户满意度', max: 100 },
    { name: '盈利能力', max: 100 }
  ],
  data.value.competitiveness?.values || [80, 70, 85, 90, 75]
) : {});
const barOpt = computed(() => data.value ? barOption(
  data.value.comparison?.categories || ['收入', '成本', '利润', '资产', '负债'],
  data.value.comparison?.values || [200, 150, 50, 300, 100]
) : {});
</script>

<style scoped>
.analysis-container {
  padding: 20px;
}
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 20px;
}
.chart-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  background: #fff;
}
</style>
