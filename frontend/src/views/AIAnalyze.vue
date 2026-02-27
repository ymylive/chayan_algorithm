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
                <div class="title-main">{{ t('aiAnalyze.header.title') }}</div>
                <div class="title-sub">{{ t('aiAnalyze.header.subtitle') }}</div>
              </div>
            </div>
          </div>
        </template>

        <el-form :model="form" label-width="120px" class="form-area">
          <el-form-item :label="t('aiAnalyze.form.target')">
            <el-input
              v-model="form.target"
              :placeholder="t('aiAnalyze.form.placeholder')"
              clearable
              @keyup.enter="runAnalyze"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="loading" @click="runAnalyze">{{ t('aiAnalyze.form.start') }}</el-button>
          </el-form-item>

          <div class="pipeline-hint">
            <span class="pipeline-step">{{ t('aiAnalyze.pipeline.detectPeers') }}</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">{{ t('aiAnalyze.pipeline.mcpSearch') }}</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">{{ t('aiAnalyze.pipeline.modelScore') }}</span>
            <span class="pipeline-arrow">→</span>
            <span class="pipeline-step">{{ t('aiAnalyze.pipeline.narrative') }}</span>
          </div>
        </el-form>
      </el-card>

      <el-card v-if="activeJob" class="progress-card">
        <template #header>
          <div class="result-header">
            <span class="result-icon">
              <el-icon><Cpu /></el-icon>
            </span>
            <span>{{ t('aiAnalyze.progress.title') }}</span>
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
            <span>{{ t('aiAnalyze.history.title') }}</span>
            <el-button text class="history-refresh" @click="loadHistory">{{ t('aiAnalyze.history.refresh') }}</el-button>
          </div>
        </template>

        <el-empty v-if="!historyLoading && !historyRows.length" :description="t('aiAnalyze.history.empty')" />

        <div v-else class="table-scroll-x">
          <el-table
            v-loading="historyLoading"
            :data="historyRows"
            border
            stripe
            size="small"
            class="data-table"
            :row-class-name="historyRowClassName"
          >
            <el-table-column prop="target" :label="t('aiAnalyze.history.target')" min-width="180" show-overflow-tooltip />
            <el-table-column prop="status" :label="t('aiAnalyze.history.status')" width="120">
              <template #default="scope">
                <el-tag
                  :type="isCompletedStatus(scope.row.status) ? 'success' : (isFailedStatus(scope.row.status) ? 'danger' : 'warning')"
                  size="small"
                >
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="progress" :label="t('aiAnalyze.history.progress')" width="90" />
            <el-table-column prop="step" :label="t('aiAnalyze.history.step')" min-width="150" show-overflow-tooltip />
            <el-table-column prop="createdAt" :label="t('aiAnalyze.history.createdAt')" min-width="180">
              <template #default="scope">{{ formatHistoryTime(scope.row.createdAt) }}</template>
            </el-table-column>
            <el-table-column :label="t('aiAnalyze.history.action')" width="120" fixed="right">
              <template #default="scope">
                <el-button
                  text
                  class="history-action"
                  :loading="historyResultLoadingJobId === scope.row.jobId"
                  :disabled="!isCompletedStatus(scope.row.status)"
                  @click="openHistoryResult(scope.row)"
                >
                  {{ t('aiAnalyze.history.viewResult') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>

      <el-card v-if="result" class="result-card">
        <template #header>
          <div class="result-header">
            <span class="result-icon">
              <el-icon><Document /></el-icon>
            </span>
            <span>{{ t('aiAnalyze.report.title') }}</span>
          </div>
        </template>

        <div class="summary-banner">
          <div class="summary-title">{{ t('aiAnalyze.report.summaryTitle') }}</div>
          <div class="summary-text">{{ result.analysis?.summary || t('aiAnalyze.report.summaryEmpty') }}</div>
        </div>

        <div class="section">
          <h4>{{ t('aiAnalyze.report.dashboardTitle') }}</h4>
          <MultiDimensionalInsightPanel
            :title="t('aiAnalyze.report.dashboardName')"
            :description="t('aiAnalyze.report.dashboardDescription')"
            :data="insightPanelData"
          />
        </div>

        <div class="section" v-if="coverageOverviewCards.length">
          <h4>{{ t('aiAnalyze.section.coverage') }}</h4>

          <div class="coverage-grid">
            <div class="coverage-card" v-for="item in coverageOverviewCards" :key="item.label">
              <div class="coverage-label">{{ item.label }}</div>
              <div class="coverage-value">{{ item.value }}</div>
              <div class="coverage-note">{{ item.note }}</div>
            </div>
          </div>

          <el-alert
            v-if="dataGapReasonLabels.length"
            class="coverage-alert"
            type="warning"
            show-icon
            :closable="false"
          >
            <template #title>{{ t('aiAnalyze.section.dataGap') }}</template>
            <div class="gap-list">
              <span class="gap-chip" v-for="(item, idx) in dataGapReasonLabels" :key="`gap-${idx}`">{{ item }}</span>
            </div>
          </el-alert>

          <el-card v-if="suggestedGapQueries.length" shadow="never" class="query-card">
            <template #header>
              <div class="intel-card-header">
                <span>{{ t('aiAnalyze.section.suggestedQueries') }}</span>
                <el-tag size="small" type="info">{{ suggestedGapQueries.length }} {{ t('aiAnalyze.section.referencesCount') }}</el-tag>
              </div>
            </template>
            <div class="query-list">
              <span class="query-chip" v-for="(item, idx) in suggestedGapQueries" :key="`query-${idx}`">{{ item }}</span>
            </div>
          </el-card>
        </div>

        <div class="section" v-if="result.analysis?.aiNarrative">
          <h4>{{ t('aiAnalyze.report.narrativeTitle') }}</h4>
          <el-card shadow="never" class="narrative-card">
            <StreamingNarrative :text="result.analysis.aiNarrative" :speed="streamSpeed" :autoplay="true" />
          </el-card>

          <div class="ai-meta">
            <el-tag size="small" type="info">{{ t('aiAnalyze.meta.model') }}：{{ result.analysis?.aiMeta?.modelUsed || '-' }}</el-tag>
            <el-tag size="small" :type="result.analysis?.aiMeta?.degraded ? 'warning' : 'success'">
              {{ result.analysis?.aiMeta?.degraded ? t('aiAnalyze.meta.degraded') : t('aiAnalyze.meta.realtime') }}
            </el-tag>
            <el-tag size="small" type="info" v-if="qualityContract">{{ t('aiAnalyze.meta.qualityScore') }}：{{ qualityContract.qualityScore ?? 0 }}</el-tag>
            <el-tag size="small" :type="mcpHealthTagType" v-if="mcpHealthVisible">
              {{ t('aiAnalyze.meta.mcpStatus') }}：{{ mcpHealth?.usedFallback ? t('aiAnalyze.meta.mcpFallback') : t('aiAnalyze.meta.mcpNormal') }}
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
          <h4>{{ t('aiAnalyze.section.competitorEvidence') }}</h4>
          <div class="table-scroll-x">
            <el-table
              :data="evidenceCompetitors"
              border
              stripe
              size="small"
              class="data-table"
              :header-cell-style="{ background: '#fafafa', color: '#606266' }"
            >
              <el-table-column type="index" label="#" width="60" />
              <el-table-column prop="name" :label="t('aiAnalyze.table.competitor')" min-width="180" />
              <el-table-column prop="source" :label="t('aiAnalyze.table.source')" width="120" />
              <el-table-column prop="relevanceScore" :label="t('aiAnalyze.table.relevance')" width="100" />
              <el-table-column prop="url" :label="t('aiAnalyze.table.url')" min-width="220" show-overflow-tooltip />
            </el-table>
          </div>
        </div>

        <div
          class="section"
          v-if="peerFinancialRows.length || consumerAgeRanges.length || consumerSegments.length || consumerReferences.length"
        >
          <h4>{{ t('aiAnalyze.section.financeConsumer') }}</h4>

          <div class="intel-grid">
            <el-card shadow="never" class="intel-card" v-if="peerFinancialRows.length">
              <template #header>
                <div class="intel-card-header">
                  <span>{{ t('aiAnalyze.section.peerFinancialEvidence') }}</span>
                  <el-tag size="small" type="info">{{ peerFinancialRows.length }} {{ t('aiAnalyze.section.referencesCount') }}</el-tag>
                </div>
              </template>
              <div class="intel-list">
                <div class="intel-item" v-for="(item, idx) in peerFinancialRows" :key="`peer-fin-${idx}`">
                  <div class="intel-item-title">{{ item.name || item.title || t('aiAnalyze.section.peerFinancialEvidence') }}</div>
                  <div class="intel-item-meta">
                    <span>{{ item.source || t('aiAnalyze.fallback.sourceMcp') }}</span>
                    <span>{{ t('aiAnalyze.table.relevance') }} {{ toSafeNumber(item.relevanceScore, 0).toFixed(2) }}</span>
                  </div>
                  <el-link
                    v-if="item.url"
                    class="intel-link"
                    type="primary"
                    :href="item.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  :underline="false"
                  >
                    {{ t('aiAnalyze.history.viewResult') }}
                  </el-link>
                </div>
              </div>
            </el-card>

            <el-card shadow="never" class="intel-card" v-if="consumerAgeRanges.length || consumerSegments.length">
              <template #header>
                <div class="intel-card-header">
                  <span>{{ t('aiAnalyze.section.consumerProfile') }}</span>
                  <el-tag size="small" type="success">{{ t('aiAnalyze.section.structuredSignals') }}</el-tag>
                </div>
              </template>

              <div class="profile-group" v-if="consumerAgeRanges.length">
                <div class="profile-title">{{ t('aiAnalyze.section.ageRanges') }}</div>
                <div class="profile-chip-wrap">
                  <span class="profile-chip" v-for="(item, idx) in consumerAgeRanges" :key="`age-${idx}`">
                    {{ item.range }} <strong>{{ Number(item.count || 0) }}</strong>
                  </span>
                </div>
              </div>

              <div class="profile-group" v-if="consumerSegments.length">
                <div class="profile-title">{{ t('aiAnalyze.section.segments') }}</div>
                <div class="profile-chip-wrap">
                  <span class="profile-chip profile-chip--segment" v-for="(item, idx) in consumerSegments" :key="`segment-${idx}`">
                    {{ item.segment }} <strong>{{ Number(item.count || 0) }}</strong>
                  </span>
                </div>
              </div>
            </el-card>
          </div>

          <el-card shadow="never" class="intel-card intel-card--references" v-if="consumerReferences.length">
            <template #header>
              <div class="intel-card-header">
                <span>{{ t('aiAnalyze.section.consumerResearchEvidence') }}</span>
                <el-tag size="small" type="warning">{{ consumerReferences.length }} {{ t('aiAnalyze.section.referencesCount') }}</el-tag>
              </div>
            </template>
            <div class="intel-list">
              <div class="intel-item" v-for="(item, idx) in consumerReferences" :key="`consumer-ref-${idx}`">
                <div class="intel-item-title">{{ item.name || item.title || t('aiAnalyze.section.consumerResearchEvidence') }}</div>
                <div class="intel-item-desc">{{ item.summary || item.description || t('aiAnalyze.report.summaryEmpty') }}</div>
                <el-link
                  v-if="item.url"
                  class="intel-link"
                  type="primary"
                  :href="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :underline="false"
                >
                  {{ t('aiAnalyze.history.viewResult') }}
                </el-link>
              </div>
            </div>
          </el-card>
        </div>

        <div class="section" v-if="result.analysis?.keyFindings?.length">
          <h4>{{ t('aiAnalyze.report.keyFindings') }}</h4>
          <ul class="insight-list">
            <li v-for="(item, idx) in result.analysis.keyFindings" :key="idx" class="finding-item">{{ item }}</li>
          </ul>
        </div>

        <div class="section" v-if="result.analysis?.suggestions?.length">
          <h4>{{ t('aiAnalyze.report.suggestions') }}</h4>
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
import { useI18n } from 'vue-i18n'
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
import mcpFallbackReasonLabelMap from '../constants/mcp-fallback-reasons.json'

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
const DATA_GAP_REASON_LABEL_KEYS: Record<string, string> = {
  industrySignalsMissing: 'aiAnalyze.gapReasons.industrySignalsMissing',
  competitorsInsufficient: 'aiAnalyze.gapReasons.competitorsInsufficient',
  competitorRelevanceLow: 'aiAnalyze.gapReasons.competitorRelevanceLow',
  marketReferencesMissing: 'aiAnalyze.gapReasons.marketReferencesMissing',
  financialReferencesMissing: 'aiAnalyze.gapReasons.financialReferencesMissing',
  sourceCoverageWeak: 'aiAnalyze.gapReasons.sourceCoverageWeak'
}
const { t, te } = useI18n()

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
  const resultPayload = extractResultPayload(raw.result)

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
  const candidates = [
    root?.data?.data,
    root?.data?.result,
    root?.result?.data,
    root?.result,
    root?.data,
    root,
    payload?.data?.data,
    payload?.data?.result,
    payload?.result?.data,
    payload?.result,
    payload?.data,
    payload
  ]
  for (const candidate of candidates) {
    if (hasResultPayload(candidate)) return candidate
  }
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
  if (status === 'pending') return t('aiAnalyze.status.pending')
  if (status === 'running') return t('aiAnalyze.status.running')
  if (status === 'completed') return t('aiAnalyze.status.completed')
  if (status === 'failed') return t('aiAnalyze.status.failed')
  return t('aiAnalyze.status.unknown')
})

const activeJobStepText = computed(() => {
  if (!activeJob.value) return ''
  const segments = [activeJob.value.step, activeJob.value.message].map((item) => String(item || '').trim()).filter(Boolean)
  return segments.join(' | ') || t('aiAnalyze.status.running')
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
    .map((reason: string) => {
      const key = `aiAnalyze.mcpFallbackReasons.${reason}`
      if (te(key)) return t(key)
      return reasonMap[reason] || reason
    })
})

const evidenceCompetitors = computed<any[]>(() => {
  const direct = result.value?.analysis?.evidence?.competitorTopSources
  if (Array.isArray(direct) && direct.length > 0) return direct.slice(0, 8)

  const competitorData = result.value?.mcp?.competitorData || {}
  const fallbackRows = [
    ...((Array.isArray(competitorData?.competitors) ? competitorData.competitors : [])),
    ...((Array.isArray(competitorData?.results) ? competitorData.results : [])),
    ...((Array.isArray(competitorData?.items) ? competitorData.items : [])),
    ...((Array.isArray(competitorData?.data) ? competitorData.data : []))
  ]

  return fallbackRows
    .map((item: any) => ({
      name: String(item?.name || item?.title || item?.company || '').trim(),
      source: String(item?.source || item?.channel || t('aiAnalyze.fallback.sourceMcp')).trim(),
      relevanceScore: toSafeNumber(item?.relevanceScore ?? item?.score ?? item?.weight ?? item?.relevance_score, 0),
      url: String(item?.url || '').trim()
    }))
    .filter((item: any) => Boolean(item.name))
    .slice(0, 8)
})
const companyIntelligence = computed<any>(() => result.value?.mcp?.companyIntelligence || null)
const peerFinancialRows = computed<any[]>(() => {
  const direct = result.value?.analysis?.evidence?.peerFinancialTopReferences
  if (Array.isArray(direct) && direct.length > 0) return direct.slice(0, 8)
  const peerRows = Array.isArray(companyIntelligence.value?.peerFinancials)
    ? companyIntelligence.value.peerFinancials
    : []
  return peerRows
    .flatMap((peer: any) => (Array.isArray(peer?.references) ? peer.references : []))
    .slice(0, 8)
})
const consumerReferences = computed<any[]>(() => {
  const direct = result.value?.analysis?.evidence?.consumerTopReferences
  if (Array.isArray(direct) && direct.length > 0) return direct.slice(0, 10)
  const refs = companyIntelligence.value?.consumerInsights?.references
  return Array.isArray(refs) ? refs.slice(0, 10) : []
})
const consumerProfile = computed<any>(() => (
  result.value?.analysis?.evidence?.consumerProfile
  || companyIntelligence.value?.consumerInsights
  || null
))
const consumerAgeRanges = computed<any[]>(() => {
  const rows = consumerProfile.value?.primaryAgeRanges
  return Array.isArray(rows) ? rows.slice(0, 6) : []
})
const consumerSegments = computed<any[]>(() => {
  const rows = consumerProfile.value?.primarySegments
  return Array.isArray(rows) ? rows.slice(0, 8) : []
})
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

const resolvePercentScore = (candidates: unknown[], fallback = 0) => {
  const raw = candidates.find((value) => Number.isFinite(Number(value)))
  if (raw === undefined) return clampPercent(fallback, fallback)
  const normalized = Number(raw) <= 1 ? Number(raw) * 100 : Number(raw)
  return clampPercent(normalized, fallback)
}

const dataCoverageSnapshot = computed(() => {
  const dataCompletenessNode = result.value?.analysis?.evidence?.dataCompleteness || {}
  const metricsNode = dataCompletenessNode?.metrics || {}
  const followupNode = dataCompletenessNode?.followup || {}

  const completenessScore = resolvePercentScore(
    [
      followupNode?.completenessScore,
      dataCompletenessNode?.completenessScore,
      dataCompletenessNode?.score,
      dataCompletenessNode?.ratio
    ],
    0
  )

  const sourceCoverageCount = Math.max(0, Math.round(toSafeNumber(metricsNode?.sourceCoverageCount, 0)))
  const marketReferenceCount = Math.max(0, Math.round(toSafeNumber(metricsNode?.marketReferenceCount, 0)))
  const financialReferenceCount = Math.max(0, Math.round(toSafeNumber(metricsNode?.financialReferenceCount, 0)))
  const competitorSignalCount = Math.max(
    evidenceCompetitors.value.length,
    Math.round(toSafeNumber(metricsNode?.competitorSignalCount, 0))
  )
  const peerFinancialCount = peerFinancialRows.value.length
  const consumerReferenceCount = consumerReferences.value.length
  const consumerSignalCount = consumerAgeRanges.value.length + consumerSegments.value.length

  const rawGapReasons = Array.isArray(dataCompletenessNode?.dataGapReasons)
    ? dataCompletenessNode.dataGapReasons
    : []
  const dataGapReasons = rawGapReasons
    .map((reason: unknown) => String(reason || '').trim())
    .filter(Boolean)
    .map((reason: string) => {
      const key = DATA_GAP_REASON_LABEL_KEYS[reason]
      if (key && te(key)) return t(key)
      return reason
    })
    .slice(0, 6)

  const suggestedQueries = Array.isArray(dataCompletenessNode?.suggestedQueries)
    ? dataCompletenessNode.suggestedQueries
      .map((item: unknown) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 8)
    : []

  return {
    completenessScore,
    sourceCoverageCount,
    marketReferenceCount,
    financialReferenceCount,
    competitorSignalCount,
    peerFinancialCount,
    consumerReferenceCount,
    consumerSignalCount,
    dataGapReasons,
    suggestedQueries
  }
})

const coverageOverviewCards = computed(() => {
  const snapshot = dataCoverageSnapshot.value
  return [
    {
      label: t('aiAnalyze.coverage.completeness'),
      value: `${snapshot.completenessScore}%`,
      note: t('aiAnalyze.coverage.completenessNote')
    },
    {
      label: t('aiAnalyze.coverage.sourceCoverage'),
      value: `${snapshot.sourceCoverageCount} ${t('aiAnalyze.chart.countUnit')}`,
      note: t('aiAnalyze.coverage.sourceCoverageNote')
    },
    {
      label: t('aiAnalyze.coverage.financialCoverage'),
      value: `${snapshot.financialReferenceCount + snapshot.peerFinancialCount} ${t('aiAnalyze.chart.countUnit')}`,
      note: t('aiAnalyze.coverage.financialCoverageNote')
    },
    {
      label: t('aiAnalyze.coverage.consumerCoverage'),
      value: `${snapshot.consumerReferenceCount + snapshot.consumerSignalCount} ${t('aiAnalyze.chart.countUnit')}`,
      note: t('aiAnalyze.coverage.consumerCoverageNote')
    }
  ]
})

const dataGapReasonLabels = computed(() => dataCoverageSnapshot.value.dataGapReasons)
const suggestedGapQueries = computed(() => dataCoverageSnapshot.value.suggestedQueries)

const derivedTargetName = computed(() => {
  const direct = String(result.value?.model?.target || '').trim()
  if (direct) return direct
  const pending = String(activeJob.value?.target || '').trim()
  if (pending) return pending
  return form.target.trim() || t('aiAnalyze.form.target')
})

const insightPanelData = computed(() => {
  const analysis = result.value?.analysis || {}
  const competitorRows = evidenceCompetitors.value
  const coverage = dataCoverageSnapshot.value

  const qualityScore = clampPercent(analysis?.qualityContract?.qualityScore, 0)
  const completenessScore = coverage.completenessScore
  const sourceCoverageScore = clampPercent(coverage.sourceCoverageCount * 25, 0)
  const financialSignalScore = clampPercent(
    coverage.financialReferenceCount * 12 + coverage.peerFinancialCount * 10,
    0
  )
  const consumerSignalScore = clampPercent(
    coverage.consumerReferenceCount * 10 + coverage.consumerSignalCount * 8,
    0
  )
  const mcpScoreBase = coverage.sourceCoverageCount > 0 ? clampPercent((coverage.sourceCoverageCount / 4) * 100, 0) : 0
  const mcpScore = mcpHealth.value?.usedFallback ? Math.max(0, mcpScoreBase - 20) : mcpScoreBase
  const findingsScore = clampPercent(Array.isArray(analysis?.keyFindings) ? analysis.keyFindings.length * 18 : 0, 0)
  const suggestionsScore = clampPercent(Array.isArray(analysis?.suggestions) ? analysis.suggestions.length * 18 : 0, 0)

  const trendBase = [
    clampPercent(completenessScore * 0.7 + sourceCoverageScore * 0.3, 0),
    clampPercent(completenessScore * 0.65 + financialSignalScore * 0.35, 0),
    clampPercent(qualityScore * 0.7 + findingsScore * 0.3, 0),
    clampPercent(qualityScore * 0.7 + suggestionsScore * 0.3, 0),
    clampPercent((qualityScore + completenessScore + mcpScore) / 3, 0)
  ]

  const topCompetitors: CompetitorScore[] = competitorRows
    .map((item: any) => ({
      name: String(item?.name || item?.company || '').trim(),
      score: toSafeNumber(item?.relevanceScore ?? item?.score ?? item?.weight, 0)
    }))
    .filter((item: CompetitorScore) => Boolean(item.name))
    .slice(0, 6)

  const fallbackEvidenceBars = [
    { name: t('aiAnalyze.chart.marketEvidence'), value: coverage.marketReferenceCount },
    { name: t('aiAnalyze.chart.financialEvidence'), value: coverage.financialReferenceCount + coverage.peerFinancialCount },
    { name: t('aiAnalyze.chart.consumerEvidence'), value: coverage.consumerReferenceCount },
    { name: t('aiAnalyze.chart.competitorSignals'), value: coverage.competitorSignalCount }
  ]
  const barCategories = topCompetitors.length
    ? topCompetitors.map((item: CompetitorScore) => item.name)
    : fallbackEvidenceBars.map((item) => item.name)
  const barValues = topCompetitors.length
    ? topCompetitors.map((item: CompetitorScore) => Number(item.score.toFixed(2)))
    : fallbackEvidenceBars.map((item) => Number(item.value.toFixed(2)))
  const barSeriesName = topCompetitors.length ? t('aiAnalyze.chart.competitorRelevance') : t('aiAnalyze.chart.evidenceCoverage')
  const barUnit = topCompetitors.length ? t('aiAnalyze.chart.scoreUnit') : t('aiAnalyze.chart.countUnit')

  const targetNodeValue = clampPercent((qualityScore + completenessScore + sourceCoverageScore) / 3, 0)
  const graphNodes: Array<{ id: string; name: string; category: number; symbolSize: number; value: number }> = []
  const graphLinks: Array<{ source: string; target: string; value: number }> = []

  if (topCompetitors.length) {
    graphNodes.push({
      id: 'target',
      name: derivedTargetName.value,
      category: 0,
      symbolSize: Math.max(36, Math.min(62, 32 + targetNodeValue / 3)),
      value: targetNodeValue
    })
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
  } else {
    const fallbackNodes = [
      {
        id: 'evidence-market',
        name: `${t('aiAnalyze.chart.marketNode')}(${coverage.marketReferenceCount})`,
        category: 2,
        symbolSize: 36,
        value: coverage.marketReferenceCount
      },
      {
        id: 'evidence-financial',
        name: `${t('aiAnalyze.chart.financialNode')}(${coverage.financialReferenceCount + coverage.peerFinancialCount})`,
        category: 2,
        symbolSize: 38,
        value: coverage.financialReferenceCount + coverage.peerFinancialCount
      },
      {
        id: 'evidence-consumer',
        name: `${t('aiAnalyze.chart.consumerNode')}(${coverage.consumerReferenceCount + coverage.consumerSignalCount})`,
        category: 2,
        symbolSize: 34,
        value: coverage.consumerReferenceCount + coverage.consumerSignalCount
      }
    ].filter((node) => node.value > 0)
    if (fallbackNodes.length > 0) {
      graphNodes.push({
        id: 'target',
        name: derivedTargetName.value,
        category: 0,
        symbolSize: Math.max(36, Math.min(62, 32 + targetNodeValue / 3)),
        value: targetNodeValue
      })
    }
    fallbackNodes.forEach((node) => {
      graphNodes.push(node)
      graphLinks.push({ source: 'target', target: node.id, value: Number((node.value || 0).toFixed(2)) })
    })
  }

  return {
    radar: {
      indicators: [
        { name: t('aiAnalyze.panel.radarQuality'), max: 100 },
        { name: t('aiAnalyze.panel.radarCoverage'), max: 100 },
        { name: t('aiAnalyze.panel.radarSourceCoverage'), max: 100 },
        { name: t('aiAnalyze.panel.radarFinancialSignals'), max: 100 },
        { name: t('aiAnalyze.panel.radarConsumerSignals'), max: 100 }
      ],
      values: [qualityScore, completenessScore, sourceCoverageScore, financialSignalScore, consumerSignalScore],
      seriesName: t('aiAnalyze.panel.radarSeries')
    },
    line: {
      categories: [
        t('aiAnalyze.panel.lineSignal'),
        t('aiAnalyze.panel.lineModel'),
        t('aiAnalyze.panel.lineNarrative'),
        t('aiAnalyze.panel.lineAction'),
        t('aiAnalyze.panel.lineFinal')
      ],
      values: trendBase,
      seriesName: t('aiAnalyze.panel.lineSeries'),
      unit: t('aiAnalyze.panel.lineUnit')
    },
    bar: {
      categories: barCategories,
      values: barValues,
      seriesName: barSeriesName,
      unit: barUnit
    },
    graph: {
      categories: [
        { name: t('aiAnalyze.panel.graphCategoryTarget') },
        { name: t('aiAnalyze.panel.graphCategoryCompetitor') },
        { name: t('aiAnalyze.panel.graphCategorySignal') }
      ],
      nodes: graphNodes,
      links: graphLinks,
      seriesName: t('aiAnalyze.panel.graphSeries')
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
      ElMessage.error(backendMessage || t('aiAnalyze.toasts.loadHistoryResultFailed'))
    }
  }
  return null
}

const applyJobState = async (job: NormalizedAnalyzeJob, options: { fromPolling?: boolean } = {}) => {
  updatePendingJobState(job)
  upsertHistory(job)

  if (isCompletedStatus(job.status)) {
    const inlineResult = extractResultPayload(job.result)
    const resolvedResult = inlineResult || await fetchJobResult(job.jobId, true)
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
      ElMessage.success(t('aiAnalyze.toasts.completed'))
    }
    stopPolling()
    return
  }

  if (isFailedStatus(job.status)) {
    clearPersistedPendingJob()
    analysisStore.clearPendingJob()
    stopPolling()
    ElMessage.error(job.message || t('aiAnalyze.toasts.failed'))
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
      ElMessage.error(backendMessage || t('aiAnalyze.toasts.pollFailed'))
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
    ElMessage.error(backendMessage || t('aiAnalyze.toasts.loadHistoryFailed'))
  } finally {
    historyLoading.value = false
  }
}

const openHistoryResult = async (row: AnalysisHistoryRecord) => {
  if (!row?.jobId) return
  const inlineResult = extractResultPayload(row.result)
  if (inlineResult) {
    setAnalysisResult(inlineResult)
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
    message: t('aiAnalyze.status.running'),
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
    ElMessage.warning(t('aiAnalyze.toasts.inputRequired'))
    return
  }

  loading.value = true
  try {
    await startAnalyzeJob(target)
    await loadHistory()
    ElMessage.success(t('aiAnalyze.toasts.submitSuccess'))
  } catch (err: any) {
    const backendMessage = err?.response?.data?.message || err?.response?.data?.error
    ElMessage.error(backendMessage || err?.message || t('aiAnalyze.toasts.submitFailed'))
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
  overflow-x: hidden;
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

.table-scroll-x {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table {
  min-width: 760px;
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

.coverage-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.coverage-card {
  border: 1px solid #d8e7ff;
  border-radius: 12px;
  background: linear-gradient(180deg, #f7fbff 0%, #ffffff 100%);
  padding: 12px;
  min-height: 108px;
}

.coverage-label {
  font-size: 12px;
  color: #64748b;
}

.coverage-value {
  margin-top: 6px;
  font-size: 24px;
  line-height: 1.2;
  color: #1d4ed8;
  font-weight: 700;
}

.coverage-note {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
}

.coverage-alert {
  margin-top: 12px;
}

.gap-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gap-chip,
.query-chip {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.4;
}

.gap-chip {
  background: #fff5ec;
  color: #9a3412;
}

.query-card {
  margin-top: 12px;
}

.query-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.query-chip {
  background: #edf4ff;
  color: #1e3a8a;
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

.intel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.intel-card {
  border: 1px solid #dbe7ff;
  border-radius: 14px;
  background: linear-gradient(160deg, rgba(245, 250, 255, 0.82) 0%, rgba(255, 255, 255, 0.92) 100%);
  backdrop-filter: blur(12px);
}

.intel-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.intel-card--references {
  margin-top: 14px;
}

.intel-list {
  display: grid;
  gap: 10px;
}

.intel-item {
  border: 1px solid #e6edf8;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  transition: box-shadow 180ms ease, transform 180ms ease;
}

.intel-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
}

.intel-item-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  color: #1e293b;
}

.intel-item-meta {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: #667085;
}

.intel-item-desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #475467;
}

.intel-link {
  margin-top: 6px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: color 180ms ease;
}

.profile-group + .profile-group {
  margin-top: 12px;
}

.profile-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.profile-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-chip {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #ebf2ff;
  color: #1f4578;
  font-size: 12px;
}

.profile-chip strong {
  color: #1d4ed8;
  font-weight: 700;
}

.profile-chip--segment {
  background: #fff4e8;
  color: #8f3a0c;
}

.profile-chip--segment strong {
  color: #d9480f;
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

  .coverage-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .intel-grid {
    grid-template-columns: 1fr;
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

  .data-table {
    min-width: 640px;
  }

  .intel-item {
    padding: 10px;
  }

  .coverage-grid {
    grid-template-columns: 1fr;
  }

  .coverage-card {
    min-height: 92px;
  }

  .profile-chip {
    min-height: 32px;
  }
}
</style>
