<template>
  <div class="integrated-page">
    <el-card class="entry-card">
      <template #header>
        <div class="section-header">
          <span class="title-icon"><el-icon><MagicStick /></el-icon></span>
          <div>
            <div class="title-main">{{ t('aiAnalyze.integrated.title') }}</div>
            <div class="title-sub">{{ t('aiAnalyze.integrated.subtitle') }}</div>
          </div>
        </div>
      </template>

      <el-form :model="form" label-width="120px" class="form-area">
        <el-form-item :label="t('aiAnalyze.integrated.form.topic')">
          <el-input
            v-model="form.topic"
            :placeholder="t('aiAnalyze.integrated.form.topicPlaceholder')"
            clearable
            @keyup.enter="startIntegratedRun"
          />
        </el-form-item>

        <el-form-item :label="t('aiAnalyze.integrated.form.target')">
          <el-input
            v-model="form.target"
            :placeholder="t('aiAnalyze.integrated.form.targetPlaceholder')"
            clearable
            @keyup.enter="startIntegratedRun"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="loading" @click="startIntegratedRun">
            {{ t('aiAnalyze.integrated.form.start') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="pipeline-hint">
        <span class="pipeline-step">{{ t('aiAnalyze.integrated.steps.research') }}</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-step">{{ t('aiAnalyze.integrated.steps.evidence') }}</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-step">{{ t('aiAnalyze.integrated.steps.analyze') }}</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-step">{{ t('aiAnalyze.integrated.steps.deliver') }}</span>
      </div>
    </el-card>

    <el-card v-if="currentPipeline" class="progress-card">
      <template #header>
        <div class="section-header">
          <span class="title-icon"><el-icon><Loading /></el-icon></span>
          <div class="header-main">
            <span>{{ t('aiAnalyze.integrated.current.title') }}</span>
            <el-tag :type="statusTagType(currentPipeline.status)" size="small">{{ statusText(currentPipeline.status) }}</el-tag>
          </div>
        </div>
      </template>

      <div class="progress-head">
        <div class="progress-topic">{{ currentPipeline.topic }}</div>
        <div class="progress-percent">{{ currentPipeline.progress }}%</div>
      </div>
      <el-progress :percentage="currentPipeline.progress" :status="progressStatusType(currentPipeline.status)" />
      <p class="progress-message" v-if="currentPipeline.message">{{ currentPipeline.message }}</p>

      <div class="phase-grid">
        <div class="phase-card">
          <div class="phase-head">
            <span>{{ t('aiAnalyze.integrated.current.researchPhase') }}</span>
            <el-tag :type="statusTagType(currentPipeline.research.status)" size="small">{{ statusText(currentPipeline.research.status) }}</el-tag>
          </div>
          <el-progress :percentage="currentPipeline.research.progress" :status="progressStatusType(currentPipeline.research.status)" :stroke-width="8" />
          <p class="phase-message">{{ currentPipeline.research.step || currentPipeline.research.message || '-' }}</p>
          <p v-if="currentPipeline.researchSummary" class="summary-text">{{ currentPipeline.researchSummary }}</p>
        </div>

        <div class="phase-card">
          <div class="phase-head">
            <span>{{ t('aiAnalyze.integrated.current.analyzePhase') }}</span>
            <el-tag :type="statusTagType(currentPipeline.analyze.status)" size="small">{{ statusText(currentPipeline.analyze.status) }}</el-tag>
          </div>
          <el-progress :percentage="currentPipeline.analyze.progress" :status="progressStatusType(currentPipeline.analyze.status)" :stroke-width="8" />
          <p class="phase-message">{{ currentPipeline.analyze.step || currentPipeline.analyze.message || '-' }}</p>
          <p v-if="currentPipeline.analyzeSummary" class="summary-text">{{ currentPipeline.analyzeSummary }}</p>
        </div>
      </div>

      <div class="phase-actions">
        <el-button class="nav-btn" @click="openHubTab('research')">{{ t('aiAnalyze.integrated.actions.openResearch') }}</el-button>
        <el-button class="nav-btn" @click="openHubTab('analyze')">{{ t('aiAnalyze.integrated.actions.openAnalyze') }}</el-button>
      </div>
    </el-card>

    <el-card class="history-card">
      <template #header>
        <div class="section-header">
          <span class="title-icon"><el-icon><Document /></el-icon></span>
          <div class="header-main">
            <span>{{ t('aiAnalyze.integrated.history.title') }}</span>
            <el-button text class="history-refresh" @click="reloadCurrent">{{ t('aiAnalyze.integrated.history.refresh') }}</el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!historyRows.length" :description="t('aiAnalyze.integrated.history.empty')" />

      <div v-else class="table-scroll-x">
        <el-table :data="historyRows" border stripe size="small" class="data-table">
          <el-table-column prop="topic" :label="t('aiAnalyze.integrated.history.topic')" min-width="180" show-overflow-tooltip />
          <el-table-column prop="target" :label="t('aiAnalyze.integrated.history.target')" min-width="140" show-overflow-tooltip />
          <el-table-column prop="status" :label="t('aiAnalyze.integrated.history.status')" width="120">
            <template #default="scope">
              <el-tag :type="statusTagType(scope.row.status)" size="small">{{ statusText(scope.row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="progress" :label="t('aiAnalyze.integrated.history.progress')" width="90" />
          <el-table-column prop="updatedAt" :label="t('aiAnalyze.integrated.history.updatedAt')" min-width="180">
            <template #default="scope">{{ formatTime(scope.row.updatedAt || scope.row.createdAt) }}</template>
          </el-table-column>
          <el-table-column :label="t('aiAnalyze.integrated.history.actions')" width="180" fixed="right">
            <template #default="scope">
              <el-button text class="history-action" @click="restorePipeline(scope.row)">
                {{ t('aiAnalyze.integrated.history.restore') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, Loading, MagicStick } from '@element-plus/icons-vue'
import request from '../utils/request'

type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unknown' | string

type PipelinePhase = 'research' | 'analyze' | 'completed' | 'failed'

type PhaseState = {
  jobId: string
  status: JobStatus
  progress: number
  step: string
  message: string
  updatedAt: string
  result?: any
}

type IntegratedPipelineRecord = {
  pipelineId: string
  topic: string
  target: string
  phase: PipelinePhase
  status: JobStatus
  progress: number
  createdAt: string
  updatedAt: string
  message: string
  researchSummary: string
  analyzeSummary: string
  research: PhaseState
  analyze: PhaseState
}

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const form = reactive({
  topic: '',
  target: ''
})

const loading = ref(false)
const pollingPending = ref(false)
const currentPipeline = ref<IntegratedPipelineRecord | null>(null)
const history = ref<IntegratedPipelineRecord[]>([])
let pollingTimer: ReturnType<typeof setInterval> | null = null

const INTEGRATED_ACTIVE_KEY = 'ai_integrated_active_pipeline'
const INTEGRATED_HISTORY_KEY = 'ai_integrated_pipeline_history'
const POLL_INTERVAL_MS = 2000

const COMPLETED_STATUS_SET = new Set(['completed', 'success', 'done'])
const FAILED_STATUS_SET = new Set(['failed', 'error', 'aborted', 'cancelled'])
const RUNNING_STATUS_SET = new Set(['running', 'processing', 'in_progress', 'searching', 'fetching', 'analyzing'])
const PENDING_STATUS_SET = new Set(['pending', 'queued'])

const historyRows = computed(() => [...history.value].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))

const unwrapData = <T = any>(payload: any): T => {
  if (payload && typeof payload === 'object' && payload.data !== undefined) {
    return payload.data as T
  }
  return payload as T
}

const normalizeStatus = (value: unknown): JobStatus => {
  const normalized = String(value || '').trim().toLowerCase()
  if (COMPLETED_STATUS_SET.has(normalized)) return 'completed'
  if (FAILED_STATUS_SET.has(normalized)) return 'failed'
  if (RUNNING_STATUS_SET.has(normalized)) return 'running'
  if (PENDING_STATUS_SET.has(normalized)) return 'pending'
  return normalized || 'unknown'
}

const clampPercent = (value: unknown, fallback = 0) => {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    const normalized = numeric > 1 ? numeric : numeric * 100
    return Math.max(0, Math.min(100, Math.round(normalized)))
  }
  return fallback
}

const estimateResearchProgress = (rawStatus: string, fetched = 0, total = 0) => {
  if (rawStatus === 'searching') return 10
  if (rawStatus === 'fetching') {
    const denominator = Math.max(total, 1)
    return 10 + Math.floor((fetched / denominator) * 60)
  }
  if (rawStatus === 'analyzing') return 80
  return 0
}

const extractResultPayload = (payload: any) => {
  const root = unwrapData<any>(payload)
  const candidates = [root?.data?.result, root?.result, root?.data?.data, root?.data, root]
  return candidates.find((item) => item && typeof item === 'object') || null
}

const extractSummaryText = (payload: any, path: 'research' | 'analysis') => {
  const root = payload || {}
  if (path === 'research') {
    return String(
      root?.research?.summary
      || root?.researchSummary
      || root?.summary
      || ''
    ).trim()
  }
  return String(
    root?.analysis?.summary
    || root?.summary
    || ''
  ).trim()
}

const statusTagType = (status: JobStatus) => {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return 'success'
  if (normalized === 'failed') return 'danger'
  if (normalized === 'running') return 'warning'
  return 'info'
}

const progressStatusType = (status: JobStatus) => {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return 'success'
  if (normalized === 'failed') return 'exception'
  return undefined
}

const statusText = (status: JobStatus) => {
  const normalized = normalizeStatus(status)
  if (normalized === 'pending') return t('aiAnalyze.status.pending')
  if (normalized === 'running') return t('aiAnalyze.status.running')
  if (normalized === 'completed') return t('aiAnalyze.status.completed')
  if (normalized === 'failed') return t('aiAnalyze.status.failed')
  return t('aiAnalyze.status.unknown')
}

const formatTime = (value?: string) => {
  const text = String(value || '').trim()
  if (!text) return '-'
  const timestamp = Date.parse(text)
  if (!Number.isFinite(timestamp)) return text
  return new Date(timestamp).toLocaleString()
}

const updateHistory = (record: IntegratedPipelineRecord) => {
  const index = history.value.findIndex((item) => item.pipelineId === record.pipelineId)
  if (index === -1) {
    history.value = [record, ...history.value].slice(0, 30)
  } else {
    const next = [...history.value]
    next[index] = record
    history.value = next
  }
  localStorage.setItem(INTEGRATED_HISTORY_KEY, JSON.stringify(history.value))
}

const setCurrentPipeline = (record: IntegratedPipelineRecord | null) => {
  currentPipeline.value = record
  if (!record) {
    localStorage.removeItem(INTEGRATED_ACTIVE_KEY)
    sessionStorage.removeItem(INTEGRATED_ACTIVE_KEY)
    return
  }
  const raw = JSON.stringify(record)
  localStorage.setItem(INTEGRATED_ACTIVE_KEY, raw)
  sessionStorage.setItem(INTEGRATED_ACTIVE_KEY, raw)
  updateHistory(record)
}

const computeOverallProgress = (record: IntegratedPipelineRecord) => {
  const researchProgress = clampPercent(record.research.progress, 0)
  const analyzeProgress = clampPercent(record.analyze.progress, 0)
  if (record.analyze.jobId) {
    return Math.max(50, Math.min(100, 50 + Math.round(analyzeProgress * 0.5)))
  }
  return Math.max(0, Math.min(50, Math.round(researchProgress * 0.5)))
}

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

const openHubTab = (tab: 'analyze' | 'research') => {
  void router.replace({
    path: '/ai-analyze',
    query: {
      ...route.query,
      tab
    }
  })
}

const normalizeResearchJob = (payload: any, fallbackTopic = ''): PhaseState | null => {
  const root = unwrapData<any>(payload)
  const raw = root?.job || root?.item || root
  const jobId = String(raw?.jobId || raw?.id || raw?.job_id || '').trim()
  if (!jobId) return null
  const rawStatus = String(raw?.status || raw?.phase || raw?.state || '').trim().toLowerCase()
  const status = normalizeStatus(rawStatus)
  const progress = clampPercent(
    raw?.progress ?? raw?.percent ?? raw?.percentage,
    status === 'completed'
      ? 100
      : estimateResearchProgress(rawStatus, Number(raw?.fetched || 0), Number(raw?.total || 0))
  )
  return {
    jobId,
    status,
    progress,
    step: String(raw?.step || raw?.stage || raw?.currentStep || '').trim(),
    message: String(raw?.message || raw?.detail || raw?.error || fallbackTopic || '').trim(),
    updatedAt: String(raw?.updatedAt || raw?.updated_at || '').trim(),
    result: extractResultPayload(raw?.result)
  }
}

const normalizeAnalyzeJob = (payload: any, fallbackTarget = ''): PhaseState | null => {
  const root = unwrapData<any>(payload)
  const raw = root?.job || root?.item || root
  const jobId = String(raw?.jobId || raw?.id || raw?.job_id || '').trim()
  if (!jobId) return null
  const status = normalizeStatus(raw?.status || raw?.phase || raw?.state)
  const progress = clampPercent(raw?.progress ?? raw?.percent ?? raw?.percentage, status === 'completed' ? 100 : 0)
  return {
    jobId,
    status,
    progress,
    step: String(raw?.step || raw?.stage || raw?.currentStep || '').trim(),
    message: String(raw?.message || raw?.detail || raw?.error || fallbackTarget || '').trim(),
    updatedAt: String(raw?.updatedAt || raw?.updated_at || '').trim(),
    result: extractResultPayload(raw?.result)
  }
}

const fetchResearchResult = async (jobId: string) => {
  const response = await request.get(`/research/analyze/jobs/${encodeURIComponent(jobId)}/result`)
  return extractResultPayload(response)
}

const fetchAnalyzeResult = async (jobId: string) => {
  const response = await request.get(`/mcp/ai-analyze/jobs/${encodeURIComponent(jobId)}/result`)
  return extractResultPayload(response)
}

const applyPipelineUpdate = (patch: Partial<IntegratedPipelineRecord>) => {
  const current = currentPipeline.value
  if (!current) return
  const next: IntegratedPipelineRecord = {
    ...current,
    ...patch
  }
  next.progress = computeOverallProgress(next)
  next.updatedAt = new Date().toISOString()
  setCurrentPipeline(next)
}

const beginAnalyzePhase = async () => {
  const current = currentPipeline.value
  if (!current) return
  const target = current.target || current.topic
  const response = await request.post('/mcp/ai-analyze/jobs', { target })
  const analyzeState = normalizeAnalyzeJob(response, target)
  if (!analyzeState) {
    throw new Error(t('aiAnalyze.integrated.toasts.analyzeStartFailed'))
  }
  applyPipelineUpdate({
    phase: 'analyze',
    status: 'running',
    message: t('aiAnalyze.integrated.toasts.analyzeStarted'),
    analyze: analyzeState
  })
}

const pollResearchPhase = async () => {
  const current = currentPipeline.value
  if (!current?.research.jobId) return
  const response = await request.get(`/research/analyze/jobs/${encodeURIComponent(current.research.jobId)}`)
  const state = normalizeResearchJob(response, current.topic)
  if (!state) return
  applyPipelineUpdate({
    research: { ...current.research, ...state },
    status: state.status === 'failed' ? 'failed' : 'running',
    message: state.step || state.message || current.message
  })

  if (normalizeStatus(state.status) === 'failed') {
    applyPipelineUpdate({
      phase: 'failed',
      status: 'failed',
      message: state.message || t('aiAnalyze.integrated.toasts.researchFailed')
    })
    stopPolling()
    return
  }

  if (normalizeStatus(state.status) !== 'completed') return

  let researchResult = state.result
  if (!researchResult) {
    researchResult = await fetchResearchResult(current.research.jobId)
  }
  const researchSummary = extractSummaryText(researchResult, 'research')
  applyPipelineUpdate({
    research: {
      ...current.research,
      ...state,
      status: 'completed',
      progress: 100,
      result: researchResult
    },
    researchSummary
  })

  if (!currentPipeline.value?.analyze.jobId) {
    await beginAnalyzePhase()
  }
}

const pollAnalyzePhase = async () => {
  const current = currentPipeline.value
  if (!current?.analyze.jobId) return
  const response = await request.get(`/mcp/ai-analyze/jobs/${encodeURIComponent(current.analyze.jobId)}`)
  const state = normalizeAnalyzeJob(response, current.target || current.topic)
  if (!state) return
  applyPipelineUpdate({
    analyze: { ...current.analyze, ...state },
    status: state.status === 'failed' ? 'failed' : 'running',
    message: state.step || state.message || current.message
  })

  if (normalizeStatus(state.status) === 'failed') {
    applyPipelineUpdate({
      phase: 'failed',
      status: 'failed',
      message: state.message || t('aiAnalyze.integrated.toasts.analyzeFailed')
    })
    stopPolling()
    return
  }

  if (normalizeStatus(state.status) !== 'completed') return

  let analyzeResult = state.result
  if (!analyzeResult) {
    analyzeResult = await fetchAnalyzeResult(current.analyze.jobId)
  }
  const analyzeSummary = extractSummaryText(analyzeResult, 'analysis')
  applyPipelineUpdate({
    phase: 'completed',
    status: 'completed',
    progress: 100,
    message: t('aiAnalyze.integrated.toasts.completed'),
    analyzeSummary,
    analyze: {
      ...current.analyze,
      ...state,
      status: 'completed',
      progress: 100,
      result: analyzeResult
    }
  })
  stopPolling()
  ElMessage.success(t('aiAnalyze.integrated.toasts.completed'))
}

const pollCurrentPipeline = async () => {
  if (!currentPipeline.value || pollingPending.value) return
  const normalizedStatus = normalizeStatus(currentPipeline.value.status)
  if (normalizedStatus === 'completed' || normalizedStatus === 'failed') {
    stopPolling()
    return
  }
  pollingPending.value = true
  try {
    if (currentPipeline.value.phase === 'research') {
      await pollResearchPhase()
      return
    }
    if (currentPipeline.value.phase === 'analyze') {
      await pollAnalyzePhase()
      return
    }
  } catch (err: any) {
    const backendMessage = err?.response?.data?.message || err?.response?.data?.error
    ElMessage.error(backendMessage || t('aiAnalyze.integrated.toasts.pollFailed'))
  } finally {
    pollingPending.value = false
  }
}

const startPolling = () => {
  stopPolling()
  void pollCurrentPipeline()
  pollingTimer = setInterval(() => {
    void pollCurrentPipeline()
  }, POLL_INTERVAL_MS)
}

const reloadCurrent = async () => {
  await pollCurrentPipeline()
}

const restorePipeline = (record: IntegratedPipelineRecord) => {
  setCurrentPipeline(record)
  form.topic = record.topic
  form.target = record.target
  const status = normalizeStatus(record.status)
  if (status === 'running' || status === 'pending') {
    startPolling()
  } else {
    stopPolling()
  }
}

const startIntegratedRun = async () => {
  const topic = form.topic.trim()
  const target = form.target.trim() || topic
  if (!topic) {
    ElMessage.warning(t('aiAnalyze.integrated.toasts.topicRequired'))
    return
  }

  loading.value = true
  try {
    const response = await request.post('/research/analyze/jobs', { topic })
    const researchState = normalizeResearchJob(response, topic)
    if (!researchState) {
      throw new Error(t('aiAnalyze.integrated.toasts.researchStartFailed'))
    }
    const now = new Date().toISOString()
    const record: IntegratedPipelineRecord = {
      pipelineId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      target,
      phase: 'research',
      status: 'running',
      progress: Math.max(1, Math.round(researchState.progress * 0.5)),
      createdAt: now,
      updatedAt: now,
      message: researchState.step || researchState.message || t('aiAnalyze.integrated.toasts.started'),
      researchSummary: '',
      analyzeSummary: '',
      research: researchState,
      analyze: {
        jobId: '',
        status: 'pending',
        progress: 0,
        step: '',
        message: '',
        updatedAt: now,
        result: null
      }
    }
    setCurrentPipeline(record)
    startPolling()
    ElMessage.success(t('aiAnalyze.integrated.toasts.started'))
  } catch (err: any) {
    const backendMessage = err?.response?.data?.message || err?.response?.data?.error
    ElMessage.error(backendMessage || err?.message || t('aiAnalyze.integrated.toasts.researchStartFailed'))
  } finally {
    loading.value = false
  }
}

const restoreFromStorage = () => {
  try {
    const rawHistory = localStorage.getItem(INTEGRATED_HISTORY_KEY)
    if (rawHistory) {
      const parsed = JSON.parse(rawHistory)
      if (Array.isArray(parsed)) {
        history.value = parsed.filter((item) => item && typeof item === 'object')
      }
    }
  } catch {
    history.value = []
  }

  const rawActive = localStorage.getItem(INTEGRATED_ACTIVE_KEY) || sessionStorage.getItem(INTEGRATED_ACTIVE_KEY)
  if (!rawActive) return
  try {
    const parsed = JSON.parse(rawActive)
    if (!parsed || typeof parsed !== 'object') return
    currentPipeline.value = parsed as IntegratedPipelineRecord
    form.topic = String(parsed.topic || '')
    form.target = String(parsed.target || '')
    const status = normalizeStatus(parsed.status)
    if (status === 'running' || status === 'pending') {
      startPolling()
    }
  } catch {
    currentPipeline.value = null
  }
}

onMounted(() => {
  restoreFromStorage()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.integrated-page {
  padding: 24px;
}

.entry-card,
.progress-card,
.history-card {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  max-width: 920px;
}

.pipeline-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
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

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.progress-topic {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.5;
}

.progress-percent {
  font-size: 18px;
  font-weight: 700;
  color: #1a73e8;
}

.progress-message {
  margin: 12px 0 0;
  color: #4b5563;
  line-height: 1.6;
}

.phase-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.phase-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
}

.phase-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.phase-message {
  margin: 10px 0 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
  min-height: 20px;
}

.summary-text {
  margin-top: 10px;
  color: #374151;
  font-size: 13px;
  line-height: 1.6;
}

.phase-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.nav-btn {
  min-height: 44px;
  cursor: pointer;
}

.history-refresh,
.history-action {
  cursor: pointer;
}

.table-scroll-x {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table {
  min-width: 880px;
}

@media (max-width: 900px) {
  .phase-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .integrated-page {
    padding: 16px;
  }

  .progress-head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
