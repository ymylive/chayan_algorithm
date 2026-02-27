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
                <div class="title-sub">分步骤分析公司数据，支持离开页面后后台持续运行。</div>
              </div>
            </div>
          </div>
        </template>

        <el-form :model="form" label-width="120px" class="form-area">
          <el-form-item label="分析对象">
            <el-input
              v-model="form.target"
              placeholder="例如：茶颜悦色、特斯拉、苹果、华为"
              clearable
              @keyup.enter="runAnalyze"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="loading" @click="runAnalyze">开始分析</el-button>
          </el-form-item>

          <div class="pipeline-hint">
            <span class="pipeline-step">识别竞品公司</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">MCP 搜索信号</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">模型评分</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">AI 叙事生成</span>
          </div>
        </el-form>
      </el-card>

      <el-card v-if="activeJob" class="progress-card">
        <template #header>
          <div class="result-header">
            <span class="result-icon">
              <el-icon><Cpu /></el-icon>
            </span>
            <span>实时分析进度</span>
          </div>
        </template>

        <div class="progress-head">
          <el-tag :type="jobStatusTagType">{{ jobStatusText }}</el-tag>
          <span class="progress-percent">{{ activeJobProgress }}%</span>
        </div>
        <el-progress :percentage="activeJobProgress" :status="jobProgressStatus" />
        <p class="progress-message">{{ activeJobStepText }}</p>
      </el-card>

      <el-card class="history-card">
        <template #header>
          <div class="history-header">
            <span class="result-icon">
              <el-icon><Document /></el-icon>
            </span>
            <span>历史分析记录</span>
            <el-button text class="history-refresh" @click="loadHistory">刷新</el-button>
          </div>
        </template>

        <el-empty v-if="!historyLoading && !historyRows.length" description="暂无历史记录" />

        <el-table
          v-else
          v-loading="historyLoading"
          :data="historyRows"
          border
          stripe
          size="small"
          class="data-table"
          :row-class-name="historyRowClassName"
        >
          <el-table-column prop="target" label="分析对象" min-width="180" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="120">
            <template #default="scope">
              <el-tag
                :type="isCompletedStatus(scope.row.status) ? 'success' : (isFailedStatus(scope.row.status) ? 'danger' : 'warning')"
                size="small"
              >
                {{ scope.row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="progress" label="进度" width="90" />
          <el-table-column prop="step" label="步骤" min-width="150" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="创建时间" min-width="180">
            <template #default="scope">{{ formatHistoryTime(scope.row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="scope">
              <el-button
                text
                class="history-action"
                :loading="historyResultLoadingJobId === scope.row.jobId"
                :disabled="!isCompletedStatus(scope.row.status)"
                @click="openHistoryResult(scope.row)"
              >
                查看结果
              </el-button>
            </template>
          </el-table-column>
        </el-table>
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
          <div class="summary-text">{{ result.analysis?.summary || '暂无摘要' }}</div>
        </div>

        <div class="section">
          <h4>多维分析图谱</h4>
          <MultiDimensionalInsightPanel
            title="LLM Insight Dashboard"
            description="Quality, evidence completeness, competitive signals, and relationship network."
            :data="insightPanelData"
          />
        </div>

        <div class="section" v-if="result.analysis?.aiNarrative">
          <h4>AI 深度解读</h4>
          <el-card shadow="never" class="narrative-card">
            <StreamingNarrative :text="result.analysis.aiNarrative" :speed="streamSpeed" :autoplay="true" />
          </el-card>

          <div class="ai-meta">
            <el-tag size="small" type="info">模型：{{ result.analysis?.aiMeta?.modelUsed || '-' }}</el-tag>
            <el-tag size="small" :type="result.analysis?.aiMeta?.degraded ? 'warning' : 'success'">
              {{ result.analysis?.aiMeta?.degraded ? '降级输出' : '实时生成' }}
            </el-tag>
            <el-tag size="small" type="info" v-if="qualityContract">质量分：{{ qualityContract.qualityScore ?? 0 }}</el-tag>
            <el-tag size="small" :type="mcpHealthTagType" v-if="mcpHealthVisible">
              MCP 检索：{{ mcpHealth?.usedFallback ? '含回退' : '正常' }}
            </el-tag>
            <el-tag
              v-for="reason in mcpFallbackReasons"
              :key="reason"
              size="small"
              type="warning"
              effect="light"
            >
              {{ reason }}
            </el-tag>
          </div>
        </div>

        <div class="section" v-if="evidenceCompetitors.length">
          <h4>竞品证据</h4>
          <el-table
            :data="evidenceCompetitors"
            border
            stripe
            size="small"
            class="data-table"
            :header-cell-style="{ background: '#fafafa', color: '#606266' }"
          >
            <el-table-column type="index" label="#" width="60" />
            <el-table-column prop="name" label="竞品" min-width="180" />
            <el-table-column prop="source" label="来源" width="120" />
            <el-table-column prop="relevanceScore" label="相关度" width="100" />
            <el-table-column prop="url" label="URL" min-width="220" show-overflow-tooltip />
          </el-table>
        </div>

        <div class="section" v-if="result.analysis?.keyFindings?.length">
          <h4>关键结论</h4>
          <ul class="insight-list">
            <li v-for="(item, idx) in result.analysis.keyFindings" :key="idx" class="finding-item">{{ item }}</li>
          </ul>
        </div>

        <div class="section" v-if="result.analysis?.suggestions?.length">
          <h4>建议动作</h4>
          <ul class="insight-list">
            <li v-for="(item, idx) in result.analysis.suggestions" :key="idx" class="suggestion-item">{{ item }}</li>
          </ul>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../utils/request'
import MultiDimensionalInsightPanel from '../components/charts/MultiDimensionalInsightPanel.vue'
import StreamingNarrative from '../components/llm/StreamingNarrative.vue'
import {
  useAnalysisStore,
  type AnalysisHistoryRecord,
  type AnalysisJobStatus,
  type PendingAnalysisJob
} from '../stores/analysis'
import mcpFallbackReasonLabelMap from '@shared/mcp-fallback-reasons.json'

const form = reactive({
  target: ''
})

const loading = ref(false)
const analysisStore = useAnalysisStore()
const result = ref<any>(analysisStore.currentData || null)
const historyLoading = ref(false)
const historyResultLoadingJobId = ref('')
const pollingRequestPending = ref(false)
let pollingTimer: ReturnType<typeof setInterval> | null = null

const AI_ANALYZE_PENDING_JOB_KEY = 'ai_analyze_pending_job_id'
const AI_ANALYZE_PENDING_TARGET_KEY = 'ai_analyze_pending_target'
const AI_JOB_POLL_INTERVAL_MS = 2000
const COMPLETED_STATUS_SET = new Set(['completed', 'success', 'done'])
const FAILED_STATUS_SET = new Set(['failed', 'error', 'aborted', 'cancelled'])
const RUNNING_STATUS_SET = new Set(['running', 'processing', 'in_progress', 'queued', 'pending'])

type NormalizedAnalyzeJob = {
  jobId: string
  target: string
  status: AnalysisJobStatus | string
  progress: number
  step: string
  message: string
  createdAt: string
  updatedAt: string
  completedAt: string
  result?: any
}

const activeJob = computed<PendingAnalysisJob | null>(() => analysisStore.pendingJob || null)
const historyRows = computed<AnalysisHistoryRecord[]>(() => analysisStore.history || [])

const hasResultPayload = (value: any) => {
  if (!value || typeof value !== 'object') return false
  return Boolean(value.analysis || value.model || value.uploaded || value.peerAnalysis || value.mcp)
}

const unwrapData = <T = any>(payload: any): T => {
  if (payload && typeof payload === 'object' && payload.data !== undefined) {
    return payload.data as T
  }
  return payload as T
}

const normalizeStatus = (value: unknown): AnalysisJobStatus | string => {
  const normalized = String(value || '').trim().toLowerCase()
  if (COMPLETED_STATUS_SET.has(normalized)) return 'completed'
  if (FAILED_STATUS_SET.has(normalized)) return 'failed'
  if (RUNNING_STATUS_SET.has(normalized)) {
    if (normalized === 'pending' || normalized === 'queued') return 'pending'
    return 'running'
  }
  return normalized || 'unknown'
}

const normalizeProgress = (value: unknown, status: AnalysisJobStatus | string) => {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    const normalized = numeric > 1 ? numeric : numeric * 100
    return Math.min(100, Math.max(0, Math.round(normalized)))
  }
  if (status === 'completed') return 100
  return 0
}

const normalizeJobRecord = (raw: any, fallbackTarget = ''): NormalizedAnalyzeJob | null => {
  if (!raw || typeof raw !== 'object') return null

  const jobId = String(raw.jobId || raw.id || raw.job_id || '').trim()
  if (!jobId) return null

  const status = normalizeStatus(raw.status || raw.phase || raw.state)
  const progress = normalizeProgress(raw.progress ?? raw.percent ?? raw.percentage, status)
  const target = String(raw.target || raw.query || raw.topic || fallbackTarget || '').trim()
  const resultPayload = hasResultPayload(raw.result) ? raw.result : undefined

  return {
    jobId,
    target,
    status,
    progress,
    step: String(raw.step || raw.stage || raw.currentStep || raw.workflowStep || '').trim(),
    message: String(raw.message || raw.detail || raw.error || '').trim(),
    createdAt: String(raw.createdAt || raw.created_at || '').trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || '').trim(),
    completedAt: String(raw.completedAt || raw.completed_at || '').trim(),
    result: resultPayload
  }
}

const extractJobList = (payload: any) => {
  const root = unwrapData<any>(payload)
  if (Array.isArray(root)) return root
  if (Array.isArray(root?.jobs)) return root.jobs
  if (Array.isArray(root?.items)) return root.items
  if (Array.isArray(root?.records)) return root.records
  if (Array.isArray(root?.data?.items)) return root.data.items
  return []
}

const extractResultPayload = (payload: any) => {
  const root = unwrapData<any>(payload)
  if (hasResultPayload(root?.result)) return root.result
  if (hasResultPayload(root)) return root
  if (hasResultPayload(payload?.result)) return payload.result
  return null
}

const persistPendingJob = (jobId: string, target: string) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(AI_ANALYZE_PENDING_JOB_KEY, jobId)
  localStorage.setItem(AI_ANALYZE_PENDING_TARGET_KEY, target)
  sessionStorage.setItem(AI_ANALYZE_PENDING_JOB_KEY, jobId)
  sessionStorage.setItem(AI_ANALYZE_PENDING_TARGET_KEY, target)
}

const readPersistedPendingJob = () => {
  if (typeof window === 'undefined') return { jobId: '', target: '' }
  const localJobId = localStorage.getItem(AI_ANALYZE_PENDING_JOB_KEY) || ''
  const sessionJobId = sessionStorage.getItem(AI_ANALYZE_PENDING_JOB_KEY) || ''
  const localTarget = localStorage.getItem(AI_ANALYZE_PENDING_TARGET_KEY) || ''
  const sessionTarget = sessionStorage.getItem(AI_ANALYZE_PENDING_TARGET_KEY) || ''
  return {
    jobId: localJobId || sessionJobId,
    target: localTarget || sessionTarget
  }
}

const clearPersistedPendingJob = () => {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AI_ANALYZE_PENDING_JOB_KEY)
  localStorage.removeItem(AI_ANALYZE_PENDING_TARGET_KEY)
  sessionStorage.removeItem(AI_ANALYZE_PENDING_JOB_KEY)
  sessionStorage.removeItem(AI_ANALYZE_PENDING_TARGET_KEY)
}

const updatePendingJobState = (job: NormalizedAnalyzeJob | null) => {
  if (!job) {
    analysisStore.clearPendingJob()
    return
  }
  analysisStore.setPendingJob({
    jobId: job.jobId,
    target: job.target,
    status: job.status,
    progress: job.progress,
    step: job.step,
    message: job.message,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  })
}

const upsertHistory = (job: NormalizedAnalyzeJob) => {
  analysisStore.upsertHistoryRecord({
    jobId: job.jobId,
    target: job.target,
    status: String(job.status || 'unknown'),
    progress: job.progress,
    step: job.step,
    message: job.message,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    result: job.result
  })
}

const setAnalysisResult = (payload: any) => {
  if (!payload) return
  result.value = payload
  analysisStore.setCurrentData(payload)
}

const isCompletedStatus = (status: unknown) => normalizeStatus(status) === 'completed'
const isFailedStatus = (status: unknown) => normalizeStatus(status) === 'failed'

const jobStatusTagType = computed(() => {
  const status = normalizeStatus(activeJob.value?.status)
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'warning'
  return 'info'
})

const jobProgressStatus = computed(() => {
  const status = normalizeStatus(activeJob.value?.status)
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'exception'
  return undefined
})

const activeJobProgress = computed(() => normalizeProgress(activeJob.value?.progress, activeJob.value?.status || 'unknown'))

const jobStatusText = computed(() => {
  const status = normalizeStatus(activeJob.value?.status)
  if (status === 'pending') return 'Pending'
  if (status === 'running') return 'Running'
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return String(status || 'Unknown')
})

const activeJobStepText = computed(() => {
  if (!activeJob.value) return ''
  const segments = [activeJob.value.step, activeJob.value.message].map((item) => String(item || '').trim()).filter(Boolean)
  return segments.join(' | ') || 'Background analysis is running.'
})

const formatHistoryTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const historyRowClassName = ({ row }: { row: AnalysisHistoryRecord }) => (
  isCompletedStatus(row.status) ? 'history-row is-completed' : 'history-row'
)

const qualityContract = computed<any>(() => result.value?.analysis?.qualityContract || null)
const qualityFeatureFlags = computed<any>(() => qualityContract.value?.featureFlags || {})
const dataCompleteness = computed<any>(() => result.value?.analysis?.evidence?.dataCompleteness || null)
const mcpHealth = computed<any>(() => result.value?.mcp?.mcpHealth || null)
const mcpHealthVisible = computed(() => Boolean(mcpHealth.value && typeof mcpHealth.value === 'object'))
const mcpHealthTagType = computed(() => (mcpHealth.value?.usedFallback ? 'warning' : 'success'))
const mcpFallbackReasons = computed<string[]>(() => {
  const reasons = Array.isArray(mcpHealth.value?.fallbackReasons)
    ? mcpHealth.value.fallbackReasons
    : []
  const reasonMap = mcpFallbackReasonLabelMap as Record<string, string>
  return reasons
    .map((reason: unknown) => String(reason || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((reason: string) => reasonMap[reason] || reason)
})

const evidenceCompetitors = computed<any[]>(() => result.value?.analysis?.evidence?.competitorTopSources || [])
const streamSpeed = computed(() => (activeJob.value && !isCompletedStatus(activeJob.value.status) ? 14 : 18))

const toSafeNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return numeric
}

type CompetitorScore = {
  name: string
  score: number
}

const clampPercent = (value: unknown, fallback = 0) => {
  const numeric = toSafeNumber(value, fallback)
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

const derivedTargetName = computed(() => {
  const direct = String(result.value?.model?.target || '').trim()
  if (direct) return direct
  const pending = String(activeJob.value?.target || '').trim()
  if (pending) return pending
  return form.target.trim() || 'Target Enterprise'
})

const insightPanelData = computed(() => {
  const analysis = result.value?.analysis || {}
  const competitorRows = Array.isArray(analysis?.evidence?.competitorTopSources)
    ? analysis.evidence.competitorTopSources
    : []

  const qualityScore = clampPercent(analysis?.qualityContract?.qualityScore, 70)
  const completenessScore = clampPercent(
    analysis?.evidence?.dataCompleteness?.score ?? analysis?.evidence?.dataCompleteness?.ratio,
    66
  )
  const mcpScore = mcpHealth.value?.usedFallback ? 52 : 85
  const findingsScore = clampPercent(Array.isArray(analysis?.keyFindings) ? analysis.keyFindings.length * 18 : 0, 58)
  const suggestionsScore = clampPercent(Array.isArray(analysis?.suggestions) ? analysis.suggestions.length * 18 : 0, 60)

  const trendBase = [
    clampPercent(qualityScore * 0.72 + completenessScore * 0.28, 70),
    clampPercent(qualityScore * 0.78 + mcpScore * 0.22, 72),
    clampPercent(qualityScore * 0.82 + findingsScore * 0.18, 74),
    clampPercent(qualityScore * 0.86 + suggestionsScore * 0.14, 76),
    clampPercent(qualityScore, 78)
  ]

  const topCompetitors: CompetitorScore[] = competitorRows
    .map((item: any, index: number) => ({
      name: String(item?.name || item?.company || `Competitor ${index + 1}`).trim() || `Competitor ${index + 1}`,
      score: toSafeNumber(item?.relevanceScore ?? item?.score ?? item?.weight, 0)
    }))
    .slice(0, 6)

  const barCategories = topCompetitors.length
    ? topCompetitors.map((item: CompetitorScore) => item.name)
    : ['Competitor A', 'Competitor B', 'Competitor C']
  const barValues = topCompetitors.length
    ? topCompetitors.map((item: CompetitorScore) => Number(item.score.toFixed(2)))
    : [72, 64, 58]

  const graphNodes = [
    { id: 'target', name: derivedTargetName.value, category: 0, symbolSize: 62, value: 100 }
  ]
  const graphLinks: Array<{ source: string; target: string; value: number }> = []

  topCompetitors.forEach((item: CompetitorScore, index: number) => {
    const nodeId = `competitor-${index}`
    graphNodes.push({
      id: nodeId,
      name: item.name,
      category: 1,
      symbolSize: Math.max(32, Math.min(48, 30 + item.score / 3)),
      value: item.score
    })
    graphLinks.push({
      source: 'target',
      target: nodeId,
      value: Number(item.score.toFixed(2))
    })
  })

  if (!topCompetitors.length) {
    ;['Signal', 'Model', 'Narrative'].forEach((name, index) => {
      const nodeId = `system-${index}`
      graphNodes.push({ id: nodeId, name, category: 2, symbolSize: 36, value: 70 - index * 6 })
      graphLinks.push({ source: 'target', target: nodeId, value: 65 - index * 8 })
    })
  }

  return {
    radar: {
      indicators: [
        { name: 'Quality', max: 100 },
        { name: 'Evidence', max: 100 },
        { name: 'MCP Reliability', max: 100 },
        { name: 'Findings', max: 100 },
        { name: 'Suggestions', max: 100 }
      ],
      values: [qualityScore, completenessScore, mcpScore, findingsScore, suggestionsScore],
      seriesName: 'AI Insight Quality'
    },
    line: {
      categories: ['Signal', 'Model', 'Narrative', 'Action', 'Final'],
      values: trendBase,
      seriesName: 'Pipeline Momentum',
      unit: 'score'
    },
    bar: {
      categories: barCategories,
      values: barValues,
      seriesName: 'Competitor Relevance',
      unit: 'score'
    },
    graph: {
      categories: [
        { name: 'Target' },
        { name: 'Competitor' },
        { name: 'System' }
      ],
      nodes: graphNodes,
      links: graphLinks,
      seriesName: 'Competitive Network'
    }
  }
})
void qualityFeatureFlags
void dataCompleteness

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

const normalizeJobPayload = (payload: any, fallbackTarget = '') => {
  const root = unwrapData<any>(payload)
  const candidate = root?.item || root?.job || root
  return normalizeJobRecord(candidate, fallbackTarget)
}

const fetchJobResult = async (jobId: string, silentError = false) => {
  if (!jobId) return null
  try {
    const response = await request.get(`/mcp/ai-analyze/jobs/${encodeURIComponent(jobId)}/result`)
    const resolved = extractResultPayload(response)
    if (resolved) {
      setAnalysisResult(resolved)
      return resolved
    }
  } catch (err: any) {
    if (!silentError) {
      const backendMessage = err?.response?.data?.message || err?.response?.data?.error
      ElMessage.error(backendMessage || '加载历史分析结果失败')
    }
  }
  return null
}

const applyJobState = async (job: NormalizedAnalyzeJob, options: { fromPolling?: boolean } = {}) => {
  updatePendingJobState(job)
  upsertHistory(job)

  if (isCompletedStatus(job.status)) {
    const resolvedResult = hasResultPayload(job.result) ? job.result : await fetchJobResult(job.jobId, true)
    if (resolvedResult) {
      setAnalysisResult(resolvedResult)
      upsertHistory({
        ...job,
        result: resolvedResult
      })
    }
    clearPersistedPendingJob()
    analysisStore.clearPendingJob()
    if (options.fromPolling) {
      ElMessage.success('AI 分析已完成')
    }
    stopPolling()
    return
  }

  if (isFailedStatus(job.status)) {
    clearPersistedPendingJob()
    analysisStore.clearPendingJob()
    stopPolling()
    ElMessage.error(job.message || 'AI 分析任务执行失败')
  }
}

const fetchJobStatus = async (jobId: string, options: { silent?: boolean } = {}) => {
  if (!jobId || pollingRequestPending.value) return
  pollingRequestPending.value = true
  try {
    const response = await request.get(`/mcp/ai-analyze/jobs/${encodeURIComponent(jobId)}`)
    const normalized = normalizeJobPayload(response)
    if (!normalized) return
    await applyJobState(normalized, { fromPolling: true })
  } catch (err: any) {
    if (!options.silent) {
      const backendMessage = err?.response?.data?.message || err?.response?.data?.error
      ElMessage.error(backendMessage || '查询分析进度失败')
    }
  } finally {
    pollingRequestPending.value = false
  }
}

const startPolling = (jobId: string) => {
  if (!jobId) return
  stopPolling()
  void fetchJobStatus(jobId)
  pollingTimer = setInterval(() => {
    void fetchJobStatus(jobId, { silent: true })
  }, AI_JOB_POLL_INTERVAL_MS)
}

const loadHistory = async () => {
  historyLoading.value = true
  try {
    const response = await request.get('/mcp/ai-analyze/jobs', {
      params: { limit: 30, offset: 0 }
    })
    const list = extractJobList(response)
    const normalized = list
      .map((item: any) => normalizeJobRecord(item))
      .filter((item: NormalizedAnalyzeJob | null): item is NormalizedAnalyzeJob => Boolean(item))

    const rows = normalized.map((item: NormalizedAnalyzeJob) => ({
      jobId: item.jobId,
      target: item.target,
      status: String(item.status || 'unknown'),
      progress: item.progress,
      step: item.step,
      message: item.message,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      completedAt: item.completedAt,
      result: item.result
    }))

    analysisStore.setHistory(rows)
  } catch (err: any) {
    const backendMessage = err?.response?.data?.message || err?.response?.data?.error
    ElMessage.error(backendMessage || '加载历史分析记录失败')
  } finally {
    historyLoading.value = false
  }
}

const openHistoryResult = async (row: AnalysisHistoryRecord) => {
  if (!row?.jobId) return
  if (row.result && hasResultPayload(row.result)) {
    setAnalysisResult(row.result)
    return
  }

  historyResultLoadingJobId.value = row.jobId
  try {
    const loaded = await fetchJobResult(row.jobId)
    if (loaded) {
      analysisStore.upsertHistoryRecord({
        ...row,
        result: loaded
      })
    }
  } finally {
    historyResultLoadingJobId.value = ''
  }
}

const restorePendingJob = async () => {
  const persisted = readPersistedPendingJob()
  if (!persisted.jobId) return
  updatePendingJobState({
    jobId: persisted.jobId,
    target: persisted.target,
    status: 'running',
    progress: 0,
    step: '',
    message: 'Resuming analysis progress...',
    createdAt: '',
    updatedAt: '',
    completedAt: ''
  })
  startPolling(persisted.jobId)
}

const startAnalyzeJob = async (target: string) => {
  const response = await request.post('/mcp/ai-analyze/jobs', { target })
  const normalized = normalizeJobPayload(response, target)
  if (!normalized) {
    throw new Error('Invalid AI analyze job response')
  }

  persistPendingJob(normalized.jobId, target)
  await applyJobState(normalized)
  startPolling(normalized.jobId)
}

const runAnalyze = async () => {
  const target = form.target.trim()
  if (!target) {
    ElMessage.warning('请先填写 AI 分析对象')
    return
  }

  loading.value = true
  try {
    await startAnalyzeJob(target)
    await loadHistory()
    ElMessage.success('分析任务已提交，后台正在持续执行')
  } catch (err: any) {
    const backendMessage = err?.response?.data?.message || err?.response?.data?.error
    ElMessage.error(backendMessage || err?.message || '提交分析任务失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadHistory()
  await restorePendingJob()
})

onUnmounted(() => {
  stopPolling()
})
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
.result-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.title-icon,
.result-icon {
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

.progress-card,
.history-card,
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

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.progress-percent {
  font-size: 18px;
  font-weight: 700;
  color: #1a73e8;
}

.progress-message {
  margin: 12px 0 0;
  color: #606266;
  line-height: 1.6;
}

.history-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-refresh,
.history-action {
  cursor: pointer;
  transition: color 0.2s ease;
}

.history-refresh {
  margin-left: auto;
}

.history-action:disabled {
  cursor: not-allowed;
}

.summary-banner {
  padding: 14px 16px;
  margin-bottom: 6px;
  border-left: 4px solid #1a73e8;
  border-radius: 8px;
  background: linear-gradient(90deg, #f5f9ff 0%, #ffffff 65%);
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
  margin-top: 24px;
}

.section h4 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
  margin: 0 0 16px;
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

.narrative-card :deep(.streaming-narrative) {
  min-height: 48px;
  color: #303133;
  font-size: 14px;
  line-height: 1.75;
}

.section :deep(.multi-panel) {
  margin-top: 12px;
}

.ai-meta {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

  .pipeline-arrow {
    display: none;
  }
}
</style>
