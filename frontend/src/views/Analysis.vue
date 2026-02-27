<template>
  <div class="analysis-page">
    <div class="content-shell">
      <header class="page-header">
        <h2 class="page-title">Multi-dimensional Analysis</h2>
        <p class="page-subtitle">Visualize financial, market, and competitiveness dimensions in one view.</p>
      </header>

      <AppCard title="Enterprise Selector" subtitle="Choose a target enterprise to load analysis datasets.">
        <div class="selector-row">
          <el-select
            v-model="selectedId"
            placeholder="Select enterprise"
            class="selector"
            filterable
            @change="fetchAnalysis"
          >
            <el-option
              v-for="item in enterprises"
              :key="String(item.id)"
              :label="item.name || `Enterprise ${item.id}`"
              :value="String(item.id)"
            />
          </el-select>
        </div>
      </AppCard>

      <section v-if="loading" class="skeleton-grid">
        <AppCard v-for="item in 4" :key="item">
          <AppSkeleton variant="title" width="180px" />
          <AppSkeleton variant="rect" height="280px" />
        </AppCard>
      </section>

      <el-result v-else-if="errorMessage" status="warning" :title="errorMessage" sub-title="Please retry later." />
      <el-empty v-else-if="!selectedId" description="Select an enterprise to view analysis data" />
      <el-empty v-else-if="!analysisData" description="No analysis data available" />

      <MultiDimensionalInsightPanel
        v-else
        title="Enterprise Multi-dimensional Dashboard"
        :description="`Target: ${selectedName || 'N/A'}`"
        :data="panelData"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import request from '../utils/request'
import AppCard from '../components/base/AppCard.vue'
import AppSkeleton from '../components/feedback/AppSkeleton.vue'
import MultiDimensionalInsightPanel from '../components/charts/MultiDimensionalInsightPanel.vue'

interface Enterprise {
  id: string | number
  name?: string
}

interface AnalysisRow {
  analysis_type?: string
  result_json?: Record<string, unknown>
}

interface AnalysisPayload {
  financial: Record<string, unknown>
  marketTrend: Record<string, unknown>
  competitiveness: Record<string, unknown>
}

const selectedId = ref('')
const enterprises = ref<Enterprise[]>([])
const analysisData = ref<AnalysisPayload | null>(null)
const loading = ref(false)
const errorMessage = ref('')

const selectedName = computed(() => {
  const current = enterprises.value.find(item => String(item.id) === selectedId.value)
  return current?.name || ''
})

const toNumber = (value: unknown): number | null => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const toObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const getNumericEntries = (value: unknown): Array<[string, number]> => {
  return Object.entries(toObject(value))
    .map(([key, raw]) => [key, toNumber(raw)] as [string, number | null])
    .filter((item): item is [string, number] => item[1] !== null)
}

const normalizeRows = (rows: AnalysisRow[]): AnalysisPayload | null => {
  const latest = rows.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
    const type = String(row?.analysis_type || '').trim()
    if (!type || acc[type]) return acc
    acc[type] = toObject(row?.result_json)
    return acc
  }, {})

  if (!Object.keys(latest).length) return null

  return {
    financial: toObject(latest.financial),
    marketTrend: toObject(latest.market_trend),
    competitiveness: toObject(latest.competitiveness)
  }
}

const buildRadarData = (competitiveness: Record<string, unknown>) => {
  const factorEntries = getNumericEntries(competitiveness.factors)
  if (factorEntries.length) {
    return {
      indicators: factorEntries.map(([name, value]) => ({
        name,
        max: Math.max(100, Math.ceil(Math.abs(value) * 1.25))
      })),
      values: factorEntries.map(([, value]) => value),
      seriesName: 'Competitiveness'
    }
  }

  return {
    indicators: [
      { name: 'Market Share', max: 100 },
      { name: 'Innovation', max: 100 },
      { name: 'Brand Equity', max: 100 },
      { name: 'Customer Value', max: 100 },
      { name: 'Profitability', max: 100 }
    ],
    values: [78, 72, 84, 80, 74],
    seriesName: 'Competitiveness'
  }
}

const buildLineData = (marketTrend: Record<string, unknown>) => {
  const trendEntries = getNumericEntries(marketTrend.trends)
  if (trendEntries.length) {
    return {
      categories: trendEntries.map(([name]) => name),
      values: trendEntries.map(([, value]) => value),
      seriesName: 'Trend',
      unit: 'index'
    }
  }

  const growthRate = toNumber(marketTrend.growth_rate)
  const prediction = toNumber(marketTrend.prediction)
  if (growthRate !== null || prediction !== null) {
    return {
      categories: ['Growth Rate', 'Prediction'],
      values: [growthRate ?? 0, prediction ?? 0],
      seriesName: 'Trend',
      unit: '%'
    }
  }

  return {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    values: [110, 124, 118, 136, 149, 163],
    seriesName: 'Trend',
    unit: 'index'
  }
}

const buildBarData = (financial: Record<string, unknown>) => {
  const factorEntries = getNumericEntries(financial.factors)
  if (factorEntries.length) {
    return {
      categories: factorEntries.map(([name]) => name),
      values: factorEntries.map(([, value]) => {
        if (Math.abs(value) <= 1) return Number((value * 100).toFixed(2))
        return Number(value.toFixed(2))
      }),
      seriesName: 'Financial Factors',
      unit: 'score'
    }
  }

  return {
    categories: ['Revenue', 'Cost', 'Margin', 'Assets', 'Liability'],
    values: [220, 156, 92, 278, 121],
    seriesName: 'Financial Factors',
    unit: 'score'
  }
}

const buildGraphData = (
  competitiveness: Record<string, unknown>,
  marketTrend: Record<string, unknown>,
  financial: Record<string, unknown>
) => {
  const rootName = selectedName.value || `Enterprise ${selectedId.value || 'Target'}`
  const competitorEntries = getNumericEntries(competitiveness.factors).slice(0, 4)
  const trendEntries = getNumericEntries(marketTrend.trends).slice(0, 3)
  const financeEntries = getNumericEntries(financial.factors).slice(0, 3)

  const nodes = [
    { id: 'target', name: rootName, category: 0, symbolSize: 60, value: 100 }
  ]

  const links: Array<{ source: string; target: string; value: number }> = []

  competitorEntries.forEach(([name, value], index) => {
    const id = `comp-${index}`
    nodes.push({ id, name, category: 1, symbolSize: 36, value })
    links.push({ source: 'target', target: id, value: Number(value.toFixed(2)) })
  })

  trendEntries.forEach(([name, value], index) => {
    const id = `trend-${index}`
    nodes.push({ id, name, category: 2, symbolSize: 34, value })
    links.push({ source: 'target', target: id, value: Number(value.toFixed(2)) })
  })

  financeEntries.forEach(([name, value], index) => {
    const id = `finance-${index}`
    nodes.push({ id, name, category: 3, symbolSize: 34, value })
    links.push({ source: 'target', target: id, value: Number(value.toFixed(2)) })
  })

  return {
    categories: [
      { name: 'Target' },
      { name: 'Competitiveness' },
      { name: 'Trend' },
      { name: 'Financial' }
    ],
    nodes,
    links,
    seriesName: 'Enterprise Relationships'
  }
}

const panelData = computed(() => {
  const payload = analysisData.value
  if (!payload) return undefined

  return {
    radar: buildRadarData(payload.competitiveness),
    line: buildLineData(payload.marketTrend),
    bar: buildBarData(payload.financial),
    graph: buildGraphData(payload.competitiveness, payload.marketTrend, payload.financial)
  }
})

const loadEnterprises = async () => {
  try {
    const response = await request.get('/enterprises', {
      params: { page: 1, limit: 100, page_size: 100 },
      headers: { 'X-Skip-Global-Loading': '1' }
    })
    enterprises.value = Array.isArray(response?.data) ? response.data : []
    if (!selectedId.value && enterprises.value.length > 0) {
      const [firstEnterprise] = enterprises.value
      if (firstEnterprise) {
        selectedId.value = String(firstEnterprise.id)
        await fetchAnalysis()
      }
    }
  } catch {
    enterprises.value = []
  }
}

const fetchAnalysis = async () => {
  if (!selectedId.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await request.get(`/analysis/${selectedId.value}`, {
      headers: { 'X-Skip-Global-Loading': '1' }
    })
    const rows = Array.isArray(response?.data) ? response.data : []
    analysisData.value = normalizeRows(rows as AnalysisRow[])
  } catch {
    analysisData.value = null
    errorMessage.value = 'Failed to load analysis data'
  } finally {
    loading.value = false
  }
}

onMounted(loadEnterprises)
</script>

<style scoped>
.analysis-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  color: #0f172a;
  font-weight: 700;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 14px;
}

.selector-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.selector {
  width: min(460px, 100%);
}

.skeleton-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 1100px) {
  .skeleton-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .analysis-page {
    padding: 12px;
  }

  .page-title {
    font-size: 20px;
  }
}
</style>
