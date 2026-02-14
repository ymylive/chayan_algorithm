<template>
  <div class="ai-analyze-page">
    <div class="content-shell">
      <el-card>
        <template #header>
          <div class="header-row">
            <div class="title-wrap">
              <span class="title-icon">
                <el-icon><Cpu /></el-icon>
              </span>
              <div>
                <div class="title-main">AI 智能分析</div>
                <div class="title-sub">融合多源数据与数学模型，生成结构化分析报告与可执行建议</div>
              </div>
            </div>
          </div>
        </template>

        <el-form :model="form" label-width="120px" class="form-area">
          <el-form-item label="AI分析对象">
            <el-input
              v-model="form.target"
              placeholder="例如：新能源汽车、茶饮品牌A、某行业赛道"
              clearable
              @keyup.enter="runAnalyze"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="loading" @click="runAnalyze">开始分析</el-button>
          </el-form-item>

          <div class="pipeline-hint">
            <span class="pipeline-step">MCP 数据检索</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">上传数据匹配</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">熵权法 + TOPSIS</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">AI 深度解读</span>
          </div>
        </el-form>
      </el-card>

      <el-card v-if="result" class="result-card">
      <template #header>
        <div class="result-header">
          <span class="result-icon">
            <el-icon><Document /></el-icon>
          </span>
          <span>分析报告</span>
        </div>
      </template>

      <div class="summary-banner">
        <div class="summary-title">摘要结论</div>
        <div class="summary-text">{{ result.analysis.summary }}</div>
      </div>

      <div class="section" v-if="kpiCards.length">
        <h4 class="section-title-with-icon">
          <span class="section-icon">
            <el-icon><TrendCharts /></el-icon>
          </span>
          <span>核心指标</span>
        </h4>
        <div class="kpi-grid">
          <el-card
            v-for="(item, idx) in kpiCards"
            :key="item.label"
            shadow="never"
            class="kpi-card"
            :style="{ '--kpi-color': ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#8e24aa'][idx % 5] }"
          >
            <div class="kpi-label">{{ item.label }}</div>
            <div class="kpi-value">{{ item.value }}</div>
            <div class="kpi-sub">{{ item.sub }}</div>
          </el-card>
        </div>
      </div>

      <div class="section" v-if="result.analysis.aiNarrative">
        <h4 class="section-title-with-icon">
          <span class="section-icon">
            <el-icon><Cpu /></el-icon>
          </span>
          <span>AI 深度解读</span>
        </h4>
        <el-card shadow="never" class="narrative-card">
          <pre>{{ result.analysis.aiNarrative }}</pre>
        </el-card>
        <div class="ai-meta" v-if="result.analysis.aiMeta">
          <el-tag size="small" type="info">模型：{{ result.analysis.aiMeta.modelUsed || '-' }}</el-tag>
          <el-tag size="small" :type="result.analysis.aiMeta.degraded ? 'warning' : 'success'">
            {{ result.analysis.aiMeta.degraded ? '降级输出' : '实时生成' }}
          </el-tag>
        </div>
      </div>

      <div class="section" v-if="result.peerAnalysis">
        <h4>同行对标分析</h4>
        <div class="chart-grid">
          <div class="chart-item">
            <h4>同行评分对比（Top10）</h4>
            <v-chart v-if="peerBarOpt.series" :option="peerBarOpt" class="chart-canvas" />
          </div>
          <div class="chart-item">
            <h4>同行行业结构（散点矩阵）</h4>
            <v-chart v-if="peerIndustryBubbleOpt.series" :option="peerIndustryBubbleOpt" class="chart-canvas" />
          </div>
        </div>
        <div class="table-wrap">
          <el-table
            v-if="result.peerAnalysis.peers?.length"
            :data="result.peerAnalysis.peers"
            border
            stripe
            size="small"
            class="data-table"
            :header-cell-style="{ background: '#fafafa', color: '#606266' }"
          >
            <el-table-column type="index" label="#" width="60" />
            <el-table-column prop="name" label="同行对象" min-width="180" />
            <el-table-column prop="industry" label="行业" />
            <el-table-column prop="source" label="来源" width="120" />
            <el-table-column prop="topsisScore" label="TOPSIS 分数" width="130" />
          </el-table>
        </div>
      </div>

      <div class="section">
        <h4>关键结论</h4>
        <ul class="insight-list">
          <li v-for="(item, idx) in result.analysis.keyFindings" :key="idx" class="finding-item">{{ item }}</li>
        </ul>
      </div>

      <div class="section">
        <h4>建议动作</h4>
        <ul class="insight-list">
          <li v-for="(item, idx) in result.analysis.suggestions" :key="idx" class="suggestion-item">{{ item }}</li>
        </ul>
      </div>

      <div class="section" v-if="result.model">
        <h4>数学模型结果</h4>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="模型方法">{{ result.model.method }}</el-descriptions-item>
          <el-descriptions-item label="趋势方向">
            <el-tag :type="trendTagType(result.model.trendLabel)">
              {{ trendLabelText(result.model.trendLabel) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="趋势斜率">{{ result.model.trendSlope }}</el-descriptions-item>
        </el-descriptions>

        <div class="chart-grid">
          <div class="chart-item">
            <h4>熵权指标贡献（柱状图）</h4>
            <v-chart v-if="weightChartOpt.series" :option="weightChartOpt" class="chart-canvas" />
          </div>

          <div class="chart-item">
            <h4>指标权重结构（雷达图）</h4>
            <v-chart v-if="weightRadarOpt.series" :option="weightRadarOpt" class="chart-canvas" />
          </div>

          <div class="chart-item">
            <h4>行业样本分布（环形图）</h4>
            <v-chart v-if="industryPieOpt.series" :option="industryPieOpt" class="chart-canvas" />
          </div>

          <div class="chart-item">
            <h4>行业集中度（Pareto）</h4>
            <v-chart v-if="industryParetoOpt.series" :option="industryParetoOpt" class="chart-canvas" />
          </div>

          <div class="chart-item">
            <h4>TOPSIS 排序（条形图）</h4>
            <v-chart v-if="rankingChartOpt.series" :option="rankingChartOpt" class="chart-canvas" />
          </div>

          <div class="chart-item">
            <h4>TOPSIS 分数趋势（折线图）</h4>
            <v-chart v-if="scoreLineOpt.series" :option="scoreLineOpt" class="chart-canvas" />
          </div>

          <div class="chart-item">
            <h4>分数区间分布（结构分析）</h4>
            <v-chart v-if="scoreDistributionOpt.series" :option="scoreDistributionOpt" class="chart-canvas" />
          </div>

          <div class="chart-item">
            <h4>行业质量分层（气泡散点）</h4>
            <v-chart v-if="industryScatterOpt.series" :option="industryScatterOpt" class="chart-canvas" />
          </div>
        </div>

        <h4>熵权法权重</h4>
        <div class="table-wrap">
          <el-table
            v-if="result.model.weights?.length"
            :data="result.model.weights"
            border
            stripe
            size="small"
            class="data-table"
            :header-cell-style="{ background: '#fafafa', color: '#606266' }"
          >
            <el-table-column prop="metric" label="指标">
              <template #default="scope">{{ metricLabel(scope.row.metric) }}</template>
            </el-table-column>
            <el-table-column prop="weight" label="权重" />
          </el-table>
        </div>

        <h4>TOPSIS 排序（Top10）</h4>
        <div class="table-wrap">
          <el-table
            v-if="result.model.ranking?.length"
            :data="result.model.ranking"
            border
            stripe
            size="small"
            class="data-table"
            :header-cell-style="{ background: '#fafafa', color: '#606266' }"
          >
            <el-table-column type="index" label="#" width="60" />
            <el-table-column prop="name" label="企业" />
            <el-table-column prop="industry" label="行业" />
            <el-table-column prop="topsisScore" label="TOPSIS 分数" />
          </el-table>
        </div>
      </div>

      <div class="section">
        <h4>上传数据概览</h4>
        <p class="upload-overview">
          命中记录：{{ result.uploaded.matchedCount }} 条，
          参考记录：{{ result.uploaded.usedCount }} 条
        </p>
        <div class="table-wrap">
          <el-table
            v-if="result.uploaded.samples?.length"
            :data="result.uploaded.samples"
            border
            stripe
            size="small"
            class="data-table"
            :header-cell-style="{ background: '#fafafa', color: '#606266' }"
          >
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column prop="name" label="企业名称" />
            <el-table-column prop="industry" label="行业" />
            <el-table-column prop="created_at" label="创建时间" />
          </el-table>
        </div>
      </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import VChart from 'vue-echarts'
import request from '../utils/request'

type WeightItem = {
  metric: string
  weight: number
}

type RankingItem = {
  id?: number
  name: string
  industry?: string
  topsisScore: number
}

const form = reactive({
  target: ''
})

const loading = ref(false)
const result = ref<any>(null)

type AIAnalyzeApiResponse = {
  success?: boolean
  message?: string
  error?: string
  retryable?: boolean
  retryAfter?: number
  limitHint?: string
  data?: any
}

const AI_AUTO_RETRY_MAX = 1

const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getRetryDelaySeconds = (err: any) => {
  const fromBackend = Number(err?.response?.data?.retryAfter || 0)
  if (Number.isFinite(fromBackend) && fromBackend > 0) {
    return Math.min(Math.max(Math.round(fromBackend), 2), 30)
  }
  return 5
}

const safeNumber = (value: unknown, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const formatPct = (value: number, digits = 1) => `${(safeNumber(value) * 100).toFixed(digits)}%`
const formatFixed = (value: number, digits = 4) => safeNumber(value).toFixed(digits)

const metricNameMap: Record<string, string> = {
  relevance: '目标相关度',
  industryHit: '行业匹配度',
  competitorHit: '竞品关联度',
  recency: '时效性'
}

const metricLabel = (metric: string) => metricNameMap[metric] || metric

const trendLabelText = (label: string) => {
  const map: Record<string, string> = {
    up: '上升',
    down: '下降',
    stable: '稳定',
    insufficient_data: '样本不足'
  }
  return map[label] || label
}

const trendTagType = (label: string) => {
  if (label === 'up') return 'success'
  if (label === 'down') return 'danger'
  if (label === 'stable') return 'warning'
  return 'info'
}

const weightsData = computed<WeightItem[]>(() => result.value?.model?.weights || [])
const rankingData = computed<RankingItem[]>(() => result.value?.model?.ranking || [])
const topIndustries = computed<{ name: string; count: number }[]>(() => result.value?.uploaded?.topIndustries || [])

const rankingScores = computed(() => rankingData.value.map((item) => safeNumber(item.topsisScore)))

const standardDeviation = (values: number[]) => {
  if (!values.length) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

const dashboardMetrics = computed(() => {
  const sampleCount = safeNumber(result.value?.uploaded?.usedCount)
  const matchedCount = safeNumber(result.value?.uploaded?.matchedCount)
  const hitRate = sampleCount > 0 ? matchedCount / sampleCount : 0

  const scores = rankingScores.value
  const scoreAvg = scores.length ? scores.reduce((sum, item) => sum + item, 0) / scores.length : 0
  const scoreStd = standardDeviation(scores)
  const scoreMax = scores.length ? Math.max(...scores) : 0
  const scoreMin = scores.length ? Math.min(...scores) : 0
  const leaderGap = scores.length > 1 ? safeNumber(scores[0]) - safeNumber(scores[1]) : scoreMax

  return {
    sampleCount,
    matchedCount,
    hitRate,
    scoreAvg,
    scoreStd,
    scoreRange: scoreMax - scoreMin,
    leaderGap,
    trendSlope: safeNumber(result.value?.model?.trendSlope)
  }
})

const kpiCards = computed(() => {
  if (!result.value?.model) return []
  return [
    {
      label: '样本规模',
      value: String(dashboardMetrics.value.sampleCount),
      sub: `命中 ${dashboardMetrics.value.matchedCount} 条`
    },
    {
      label: '命中率',
      value: formatPct(dashboardMetrics.value.hitRate),
      sub: '目标匹配样本占比'
    },
    {
      label: 'TOPSIS均值',
      value: formatFixed(dashboardMetrics.value.scoreAvg),
      sub: `标准差 ${formatFixed(dashboardMetrics.value.scoreStd)}`
    },
    {
      label: '头部优势',
      value: formatFixed(dashboardMetrics.value.leaderGap),
      sub: 'Top1 与 Top2 分差'
    },
    {
      label: '趋势斜率',
      value: formatFixed(dashboardMetrics.value.trendSlope),
      sub: `趋势 ${trendLabelText(result.value?.model?.trendLabel || '')}`
    }
  ]
})

const weightChartOpt = computed(() => {
  if (!weightsData.value.length) return {}
  return {
    aria: { enabled: true },
    animationDuration: 600,
    toolbox: {
      right: 8,
      feature: { saveAsImage: {}, restore: {} }
    },
    tooltip: { trigger: 'axis' },
    grid: { left: 20, right: 20, top: 30, bottom: 20, containLabel: true },
    xAxis: {
      type: 'category',
      data: weightsData.value.map((item) => metricLabel(item.metric)),
      axisLabel: { interval: 0, rotate: 20 }
    },
    yAxis: { type: 'value', min: 0, max: 1 },
    series: [
      {
        type: 'bar',
        data: weightsData.value.map((item) => safeNumber(item.weight)),
        barMaxWidth: 36,
        universalTransition: true,
        label: { show: true, position: 'top' },
        itemStyle: { color: '#409EFF' }
      }
    ]
  }
})

const weightRadarOpt = computed(() => {
  if (!weightsData.value.length) return {}
  return {
    aria: { enabled: true },
    tooltip: {},
    radar: {
      indicator: weightsData.value.map((item) => ({
        name: metricLabel(item.metric),
        max: 1
      })),
      splitArea: { areaStyle: { opacity: 0.9 } }
    },
    series: [
      {
        type: 'radar',
        areaStyle: { opacity: 0.25 },
        data: [
          {
            value: weightsData.value.map((item) => safeNumber(item.weight)),
            name: '指标权重'
          }
        ]
      }
    ]
  }
})

const industryPieOpt = computed(() => {
  if (!topIndustries.value.length) return {}
  return {
    aria: { enabled: true },
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    toolbox: {
      right: 8,
      feature: { saveAsImage: {}, restore: {} }
    },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        avoidLabelOverlap: true,
        data: topIndustries.value.map((item) => ({ name: item.name, value: safeNumber(item.count) })),
        label: { formatter: '{b}: {d}%' },
        universalTransition: true
      }
    ]
  }
})

const industryParetoOpt = computed(() => {
  if (!topIndustries.value.length) return {}

  const list = [...topIndustries.value]
  const total = list.reduce((sum, item) => sum + safeNumber(item.count), 0) || 1
  let cumulative = 0
  const cumulativeRate = list.map((item) => {
    cumulative += safeNumber(item.count)
    return Number(((cumulative / total) * 100).toFixed(2))
  })

  return {
    aria: { enabled: true },
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 45, top: 20, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: list.map((item) => item.name),
      axisLabel: { interval: 0, rotate: 20 }
    },
    yAxis: [
      { type: 'value', name: '样本数' },
      { type: 'value', name: '累计占比', min: 0, max: 100, axisLabel: { formatter: '{value}%' } }
    ],
    series: [
      {
        name: '样本数',
        type: 'bar',
        data: list.map((item) => safeNumber(item.count)),
        itemStyle: { color: '#5470C6' }
      },
      {
        name: '累计占比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: cumulativeRate,
        itemStyle: { color: '#EE6666' }
      }
    ]
  }
})

const rankingChartOpt = computed(() => {
  if (!rankingData.value.length) return {}

  const list = [...rankingData.value].slice(0, 10).reverse()
  return {
    aria: { enabled: true },
    animationDuration: 700,
    toolbox: {
      right: 8,
      feature: { saveAsImage: {}, restore: {} }
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 20, top: 20, bottom: 20, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 1 },
    yAxis: { type: 'category', data: list.map((item) => item.name) },
    dataZoom: [
      { type: 'inside', yAxisIndex: 0 },
      { type: 'slider', yAxisIndex: 0, right: 0, width: 12 }
    ],
    series: [
      {
        type: 'bar',
        data: list.map((item) => safeNumber(item.topsisScore)),
        barMaxWidth: 24,
        universalTransition: true,
        itemStyle: { color: '#67C23A' }
      }
    ]
  }
})

const scoreLineOpt = computed(() => {
  if (!rankingData.value.length) return {}

  const list = rankingData.value.slice(0, 10)
  return {
    aria: { enabled: true },
    animationDuration: 700,
    toolbox: {
      right: 8,
      feature: { saveAsImage: {}, restore: {} }
    },
    tooltip: { trigger: 'axis' },
    grid: { left: 30, right: 20, top: 20, bottom: 30, containLabel: true },
    xAxis: { type: 'category', data: list.map((item) => item.name), axisLabel: { rotate: 20 } },
    yAxis: { type: 'value', min: 0, max: 1 },
    series: [
      {
        type: 'line',
        smooth: true,
        data: list.map((item) => safeNumber(item.topsisScore)),
        areaStyle: { opacity: 0.1 },
        universalTransition: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#E6A23C' }
      }
    ]
  }
})

const scoreDistributionOpt = computed(() => {
  const scores = rankingScores.value
  if (!scores.length) return {}

  const bins = [
    { label: '0.0-0.2', count: 0 },
    { label: '0.2-0.4', count: 0 },
    { label: '0.4-0.6', count: 0 },
    { label: '0.6-0.8', count: 0 },
    { label: '0.8-1.0', count: 0 }
  ]

  scores.forEach((score) => {
    const index = Math.min(4, Math.floor(score / 0.2))
    const bucket = bins[index] || bins[bins.length - 1]
    if (bucket) bucket.count += 1
  })

  const densities = bins.map((item) => Number((item.count / scores.length).toFixed(4)))
  return {
    aria: { enabled: true },
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 40, top: 20, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: bins.map((item) => item.label)
    },
    yAxis: [
      { type: 'value', name: '样本数' },
      { type: 'value', name: '占比', min: 0, max: 1, axisLabel: { formatter: '{value}' } }
    ],
    series: [
      {
        type: 'bar',
        name: '样本数',
        data: bins.map((item) => item.count),
        itemStyle: { color: '#91CC75' }
      },
      {
        type: 'line',
        name: '占比',
        yAxisIndex: 1,
        smooth: true,
        data: densities,
        itemStyle: { color: '#73C0DE' }
      }
    ]
  }
})

const industryScoreMatrix = computed(() => {
  const map = new Map<string, number[]>()
  rankingData.value.forEach((item) => {
    const key = item.industry || '未分类'
    const bucket = map.get(key) || []
    bucket.push(safeNumber(item.topsisScore))
    map.set(key, bucket)
  })

  return Array.from(map.entries())
    .map(([industry, scores]) => {
      const count = scores.length
      const avg = scores.reduce((sum, value) => sum + value, 0) / (count || 1)
      const max = Math.max(...scores)
      return { industry, count, avg, max }
    })
    .sort((a, b) => b.count - a.count)
})

const industryScatterOpt = computed(() => {
  if (!industryScoreMatrix.value.length) return {}

  return {
    aria: { enabled: true },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const [avg, count, max, industry] = params.data
        return `${industry}<br/>均值: ${formatFixed(avg)}<br/>入榜样本: ${count}<br/>最高分: ${formatFixed(max)}`
      }
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 1, name: '平均TOPSIS分数' },
    yAxis: { type: 'value', min: 0, name: '入榜样本数' },
    visualMap: {
      dimension: 2,
      min: 0,
      max: 1,
      orient: 'horizontal',
      right: 0,
      top: 0,
      text: ['高分', '低分'],
      inRange: {
        color: ['#91cc75', '#5470c6', '#ee6666']
      }
    },
    series: [
      {
        type: 'scatter',
        data: industryScoreMatrix.value.map((item) => [item.avg, item.count, item.max, item.industry]),
        symbolSize: (value: number[]) => 10 + safeNumber(value?.[1]) * 6,
        label: {
          show: true,
          formatter: (params: any) => params.data?.[3]
        }
      }
    ]
  }
})

const peerBarOpt = computed(() => {
  const peers = result.value?.peerAnalysis?.peers || []
  if (!peers.length) return {}

  const list = [...peers]
    .sort((a: any, b: any) => safeNumber(b.topsisScore) - safeNumber(a.topsisScore))
    .slice(0, 10)
    .reverse()

  return {
    aria: { enabled: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 60, right: 20, top: 20, bottom: 25, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 1 },
    yAxis: { type: 'category', data: list.map((item: any) => item.name) },
    series: [
      {
        type: 'bar',
        data: list.map((item: any) => safeNumber(item.topsisScore)),
        itemStyle: { color: '#8e44ad' },
        barMaxWidth: 24
      }
    ]
  }
})

const peerIndustryBubbleOpt = computed(() => {
  const stats = result.value?.peerAnalysis?.industryStats || []
  if (!stats.length) return {}

  return {
    aria: { enabled: true },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const [avgScore, count, maxScore, industry] = params.data
        return `${industry}<br/>均分: ${formatFixed(avgScore)}<br/>样本数: ${count}<br/>最高分: ${formatFixed(maxScore)}`
      }
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 1, name: '行业均分' },
    yAxis: { type: 'value', min: 0, name: '行业样本数' },
    series: [
      {
        type: 'scatter',
        data: stats.map((item: any) => [
          safeNumber(item.avgTopsisScore),
          safeNumber(item.count),
          safeNumber(item.maxTopsisScore),
          item.industry
        ]),
        symbolSize: (value: number[]) => 12 + safeNumber(value?.[1]) * 4,
        label: {
          show: true,
          formatter: (params: any) => params.data?.[3]
        },
        itemStyle: {
          color: '#f39c12'
        }
      }
    ]
  }
})

const runAnalyze = async () => {
  if (!form.target.trim()) {
    ElMessage.warning('请先填写 AI 分析对象')
    return
  }

  loading.value = true
  const target = form.target.trim()
  let lastError: any = null

  try {
    for (let attempt = 0; attempt <= AI_AUTO_RETRY_MAX; attempt++) {
      try {
        const response = await request.post('/mcp/ai-analyze', { target })
        const payload = response as AIAnalyzeApiResponse | { data?: AIAnalyzeApiResponse }
        const res: AIAnalyzeApiResponse =
          (payload as AIAnalyzeApiResponse)?.success !== undefined
            ? (payload as AIAnalyzeApiResponse)
            : ((payload as { data?: AIAnalyzeApiResponse })?.data || {})

        if (!res?.success) {
          throw new Error(res?.message || res?.error || '分析失败')
        }

        result.value = res.data
        ElMessage.success(attempt > 0 ? 'AI 分析完成（已自动重试）' : 'AI 分析完成')
        return
      } catch (err: any) {
        lastError = err
        const status = Number(err?.response?.status || 0)
        const retryable = Boolean(err?.response?.data?.retryable) || status === 429 || status === 504

        if (retryable && attempt < AI_AUTO_RETRY_MAX) {
          const waitSeconds = getRetryDelaySeconds(err)
          ElMessage.warning(`AI 限流，${waitSeconds} 秒后自动重试...`)
          await waitFor(waitSeconds * 1000)
          continue
        }

        break
      }
    }

    const backendMessage = lastError?.response?.data?.message || lastError?.response?.data?.error
    const limitHint = lastError?.response?.data?.limitHint
    const isNetworkError = !lastError?.response && (
      lastError?.code === 'ERR_NETWORK' ||
      /network error/i.test(String(lastError?.message || ''))
    )

    if (isNetworkError) {
      ElMessage.warning('网络连接异常，正在自动重试一次...')
      await waitFor(4000)
      try {
        const retryResponse = await request.post('/mcp/ai-analyze', { target })
        const retryPayload = retryResponse as AIAnalyzeApiResponse | { data?: AIAnalyzeApiResponse }
        const retryRes: AIAnalyzeApiResponse =
          (retryPayload as AIAnalyzeApiResponse)?.success !== undefined
            ? (retryPayload as AIAnalyzeApiResponse)
            : ((retryPayload as { data?: AIAnalyzeApiResponse })?.data || {})
        if (retryRes?.success) {
          result.value = retryRes.data
          ElMessage.success('AI 分析完成（网络恢复后自动重试成功）')
          return
        }
      } catch {
        // fallthrough to final network guidance
      }
      ElMessage.error('网络连接异常：请使用 https://chayan.cornna.xyz（不要用 https://82.158.88.34:3000）')
      return
    }

    if (limitHint === 'provider_rate_limited') {
      ElMessage.error(backendMessage || 'AI 服务限流，请稍后重试')
    } else if (limitHint === 'provider_timeout') {
      ElMessage.error(backendMessage || 'AI 服务响应超时，请稍后重试')
    } else {
      ElMessage.error(backendMessage || lastError?.message || 'AI 分析失败')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.ai-analyze-page {
  padding: 24px;
}

.content-shell {
  max-width: 1280px;
  margin: 0 auto;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon,
.result-icon,
.section-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.title-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #ecf3ff;
  font-size: 18px;
}

.title-main {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

.title-sub {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}

.form-area {
  max-width: 860px;
}

.pipeline-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.pipeline-step {
  padding: 4px 10px;
  border-radius: 999px;
  background: #f5f9ff;
  color: #1a73e8;
  border: 1px solid #dbe9ff;
  font-size: 12px;
  line-height: 1;
}

.pipeline-arrow {
  color: #b7c7de;
  font-size: 13px;
}

.result-card {
  margin-top: 20px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.summary-banner {
  padding: 14px 16px;
  margin-bottom: 4px;
  border-left: 4px solid #1a73e8;
  border-radius: 8px;
  background: linear-gradient(90deg, #f5f9ff 0%, #ffffff 65%);
  box-shadow: 0 1px 4px rgba(26, 115, 232, 0.08);
}

.summary-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a73e8;
  margin-bottom: 6px;
}

.summary-text {
  color: #303133;
  line-height: 1.7;
}

.section {
  margin-top: 28px;
}

.section h4 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
  margin: 0 0 16px;
}

.section-title-with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  align-items: stretch;
}

.kpi-card {
  height: 100%;
  border-radius: 8px;
  text-align: center;
  transition: all 0.3s;
  border-top: 3px solid var(--kpi-color, #1a73e8);
}

.kpi-card :deep(.el-card__body) {
  height: 100%;
  min-height: 140px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.kpi-label {
  font-size: 12px;
  color: #909399;
}

.kpi-value {
  font-size: 28px;
  font-weight: 700;
  margin: 8px 0;
  color: var(--kpi-color, #303133);
  line-height: 1.2;
}

.kpi-sub {
  font-size: 12px;
  color: #b1b4bb;
}

.narrative-card {
  background: #f8faff;
  border-left: 4px solid #1a73e8;
  border-radius: 8px;
}

.narrative-card pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.7;
  color: #303133;
}

.ai-meta {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 20px;
  margin-top: 16px;
  align-items: stretch;
}

.chart-item {
  min-width: 0;
  overflow: hidden;
  border-radius: 10px;
  padding: 16px;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.chart-item h4 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
  margin: 0 0 16px;
}

.chart-canvas {
  height: 320px;
}

.data-table {
  width: 100%;
}

.table-wrap {
  margin-top: 12px;
  overflow-x: auto;
}

.table-wrap .data-table {
  min-width: 620px;
}

.upload-overview {
  margin: 0;
  color: #606266;
  line-height: 1.7;
}

.insight-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.finding-item,
.suggestion-item {
  padding: 8px 0 8px 20px;
  position: relative;
  line-height: 1.7;
  color: #303133;
}

.finding-item::before,
.suggestion-item::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 18px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.finding-item::before {
  background: #34a853;
}

.suggestion-item::before {
  background: #1a73e8;
}

@media (max-width: 992px) {
  .ai-analyze-page {
    padding: 18px;
  }

  .form-area {
    max-width: 100%;
  }

  .section {
    margin-top: 22px;
  }

  .chart-grid {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
  }

  .table-wrap .data-table {
    min-width: 560px;
  }
}

@media (max-width: 768px) {
  .ai-analyze-page {
    padding: 12px;
  }

  .title-wrap {
    align-items: flex-start;
  }

  .title-main {
    font-size: 16px;
  }

  .title-sub {
    font-size: 12px;
    line-height: 1.5;
  }

  .form-area :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    line-height: 1.4;
    padding-bottom: 6px;
  }

  .form-area :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }

  .pipeline-hint {
    margin-top: 2px;
    gap: 6px;
  }

  .pipeline-step {
    line-height: 1.3;
  }

  .pipeline-arrow {
    display: none;
  }

  .section {
    margin-top: 18px;
  }

  .section h4 {
    font-size: 15px;
    margin-bottom: 12px;
    padding-bottom: 8px;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .kpi-card :deep(.el-card__body) {
    min-height: 132px;
    padding: 16px;
  }

  .chart-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .chart-item {
    padding: 12px;
  }

  .chart-canvas {
    height: 270px;
  }

  .table-wrap {
    margin-top: 10px;
  }

  .table-wrap .data-table {
    min-width: 520px;
  }
}
</style>
