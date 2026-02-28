<template>
  <div class="deep-research-page">
    <div class="content-shell">
      <el-card>
        <template #header>
          <div class="header-row">
            <span class="title-icon"><el-icon><Search /></el-icon></span>
            <div>
              <div class="title-main">{{ t('deepResearch.header.title') }}</div>
              <div class="title-sub">{{ t('deepResearch.header.subtitle') }}</div>
            </div>
          </div>
        </template>

        <el-form :model="form" label-width="110px" class="form-area">
          <el-form-item :label="t('deepResearch.form.topicLabel')">
            <el-input
              v-model="form.topic"
              :placeholder="t('deepResearch.form.topicPlaceholder')"
              clearable
              @keyup.enter="startResearch"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" class="start-button" :loading="loading" @click="startResearch">
              {{ t('deepResearch.form.startButton') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="running-card">
        <template #header>
          <div class="section-header">
            <div class="result-header">
              <span class="result-icon"><el-icon><List /></el-icon></span>
              <span>{{ t('deepResearch.running.title') }}</span>
            </div>
            <el-button text class="section-refresh" @click="loadJobs">{{ t('deepResearch.common.refresh') }}</el-button>
          </div>
        </template>

        <el-empty v-if="!runningJobs.length" :description="t('deepResearch.running.empty')" />

        <div v-else class="running-list">
          <button
            v-for="item in runningJobs"
            :key="item.jobId"
            type="button"
            class="running-item"
            :class="{ 'is-active': activeJob?.jobId === item.jobId }"
            @click="focusRunningTask(item)"
          >
            <div class="running-item-head">
              <span class="running-item-topic">{{ item.topic || t('deepResearch.running.topicFallback') }}</span>
              <el-tag :type="statusTagType(item.status, item.rawStatus)" size="small">
                {{ formatStatusText(item.status, item.rawStatus) }}
              </el-tag>
            </div>
            <div class="running-item-meta">
              <span>{{ item.progress }}%</span>
              <span v-if="item.step || item.message">{{ item.step || item.message }}</span>
            </div>
            <el-progress
              :percentage="item.progress"
              :status="progressStatusType(item.status, item.rawStatus)"
              :stroke-width="8"
            />
          </button>
        </div>
      </el-card>

      <el-card v-if="activeJob" class="progress-card">
        <template #header>
          <div class="result-header">
            <span class="result-icon"><el-icon><Loading /></el-icon></span>
            <span>{{ t('deepResearch.current.title') }}</span>
          </div>
        </template>

        <div class="progress-head">
          <el-tag :type="statusTagType(activeJob.status, activeJob.rawStatus)">
            {{ formatStatusText(activeJob.status, activeJob.rawStatus) }}
          </el-tag>
          <span class="progress-percent">{{ activeJob.progress }}%</span>
        </div>
        <el-progress
          :percentage="activeJob.progress"
          :status="progressStatusType(activeJob.status, activeJob.rawStatus)"
          :stroke-width="10"
        />
        <p class="progress-topic">
          <strong>{{ t('deepResearch.current.topic') }}:</strong>
          <span>{{ activeJob.topic || t('deepResearch.running.topicFallback') }}</span>
        </p>
        <p v-if="activeJob.step || activeJob.message" class="progress-message">{{ activeJob.step || activeJob.message }}</p>
      </el-card>

      <el-card class="history-card">
        <template #header>
          <div class="section-header">
            <div class="result-header">
              <span class="result-icon"><el-icon><Document /></el-icon></span>
              <span>{{ t('deepResearch.history.title') }}</span>
            </div>
            <el-button text class="section-refresh" @click="loadJobs">{{ t('deepResearch.common.refresh') }}</el-button>
          </div>
        </template>

        <el-empty v-if="!jobsLoading && !historyJobs.length" :description="t('deepResearch.history.empty')" />

        <div v-else class="table-scroll-x">
          <el-table
            v-loading="jobsLoading"
            :data="historyJobs"
            border
            stripe
            size="small"
            class="data-table"
            :row-class-name="historyRowClassName"
            @row-click="openHistoryResult"
          >
            <el-table-column prop="topic" :label="t('deepResearch.history.topic')" min-width="180" show-overflow-tooltip />
            <el-table-column prop="status" :label="t('deepResearch.history.status')" width="120">
              <template #default="scope">
                <el-tag :type="statusTagType(scope.row.status, scope.row.rawStatus)" size="small">
                  {{ formatStatusText(scope.row.status, scope.row.rawStatus) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="progress" :label="t('deepResearch.history.progress')" width="100" />
            <el-table-column prop="updatedAt" :label="t('deepResearch.history.updatedAt')" min-width="180">
              <template #default="scope">{{ formatTime(scope.row.updatedAt || scope.row.createdAt) }}</template>
            </el-table-column>
            <el-table-column :label="t('deepResearch.history.action')" width="120" fixed="right">
              <template #default="scope">
                <el-button
                  text
                  class="history-action"
                  :loading="historyResultLoadingJobId === scope.row.jobId"
                  :disabled="!isCompletedStatus(scope.row.status)"
                  @click.stop="openHistoryResult(scope.row)"
                >
                  {{ t('deepResearch.history.viewResult') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>

      <el-card v-if="resultPayload" class="result-card">
        <template #header>
          <div class="result-header">
            <span class="result-icon"><el-icon><Document /></el-icon></span>
            <span>{{ t('deepResearch.result.title') }}</span>
          </div>
        </template>

        <div class="section" v-if="researchSummary">
          <h4>{{ t('deepResearch.result.researchSummary') }}</h4>
          <p class="long-text">{{ researchSummary }}</p>
        </div>

        <div class="section" v-if="researchSources.length">
          <h4>{{ t('deepResearch.result.sources') }}</h4>
          <ul class="source-list">
            <li v-for="(src, idx) in researchSources" :key="`${src.url || src.title}-${idx}`">
              <a v-if="src.url" class="source-link" :href="src.url" target="_blank" rel="noopener noreferrer">{{ src.title || src.url }}</a>
              <span v-else>{{ src.title }}</span>
            </li>
          </ul>
        </div>

        <div class="section" v-if="analysisNarrative">
          <h4>{{ t('deepResearch.result.analysisNarrative') }}</h4>
          <p class="long-text">{{ analysisNarrative }}</p>
        </div>

        <div class="section" v-if="analysisKeyFindings.length">
          <h4>{{ t('deepResearch.result.keyFindings') }}</h4>
          <ul class="insight-list">
            <li v-for="(item, idx) in analysisKeyFindings" :key="`finding-${idx}`" class="finding-item">{{ item }}</li>
          </ul>
        </div>

        <div class="section" v-if="analysisSuggestions.length">
          <h4>{{ t('deepResearch.result.suggestions') }}</h4>
          <ul class="insight-list">
            <li v-for="(item, idx) in analysisSuggestions" :key="`suggestion-${idx}`" class="suggestion-item">{{ item }}</li>
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
import { Document, List, Loading, Search } from '@element-plus/icons-vue'
import request from '../utils/request'

type ResearchJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unknown' | string

type ResearchJobRecord = {
  jobId: string
  topic: string
  status: ResearchJobStatus
  rawStatus: string
  progress: number
  step: string
  message: string
  createdAt: string
  updatedAt: string
  completedAt: string
  result?: any
}

type ResultSourceItem = {
  title: string
  url: string
}

const { t } = useI18n()
const form = reactive({ topic: '' })
const loading = ref(false)
const jobsLoading = ref(false)
const pollingRequestPending = ref(false)
const historyResultLoadingJobId = ref('')

const jobs = ref<ResearchJobRecord[]>([])
const activeJob = ref<ResearchJobRecord | null>(null)
const resultPayload = ref<any>(null)
let pollingTimer: ReturnType<typeof setInterval> | null = null

const RESEARCH_ACTIVE_JOB_KEY = 'deep_research_active_job_id'
const RESEARCH_ACTIVE_TOPIC_KEY = 'deep_research_active_topic'
const POLL_INTERVAL_MS = 2000

const COMPLETED_STATUS_SET = new Set(['completed', 'success', 'done'])
const FAILED_STATUS_SET = new Set(['failed', 'error', 'aborted', 'cancelled'])
const RUNNING_STATUS_SET = new Set(['running', 'processing', 'in_progress', 'searching', 'fetching', 'analyzing'])
const PENDING_STATUS_SET = new Set(['pending', 'queued'])

const unwrapData = <T = any>(payload: any): T => {
  if (payload && typeof payload === 'object' && payload.data !== undefined) {
    return payload.data as T
  }
  return payload as T
}

const firstNonEmptyText = (values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

const hasResultPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return false
  return Boolean(
    payload.research ||
    payload.analysis ||
    payload.summary ||
    payload.sources ||
    payload.marketData ||
    payload.competitors ||
    payload.narrative ||
    payload.keyFindings ||
    payload.suggestions
  )
}

const extractResultPayload = (payload: any) => {
  const root = unwrapData<any>(payload)
  const candidates = [
    root?.data?.result,
    root?.result,
    root?.data?.data,
    root?.data,
    root
  ]
  return candidates.find((candidate) => hasResultPayload(candidate)) || null
}

const normalizeStatus = (value: unknown): ResearchJobStatus => {
  const normalized = String(value || '').trim().toLowerCase()
  if (COMPLETED_STATUS_SET.has(normalized)) return 'completed'
  if (FAILED_STATUS_SET.has(normalized)) return 'failed'
  if (RUNNING_STATUS_SET.has(normalized)) return 'running'
  if (PENDING_STATUS_SET.has(normalized)) return 'pending'
  return normalized || 'unknown'
}

const estimateProgressByStatus = (rawStatus: string, fetched = 0, total = 0) => {
  if (rawStatus === 'searching') return 10
  if (rawStatus === 'fetching') {
    const denominator = Math.max(total, 1)
    return 10 + Math.floor((fetched / denominator) * 60)
  }
  if (rawStatus === 'analyzing') return 80
  return 0
}

const normalizeProgress = (value: unknown, status: ResearchJobStatus, rawStatus: string, raw: any) => {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    const normalized = numeric > 1 ? numeric : numeric * 100
    return Math.max(0, Math.min(100, Math.round(normalized)))
  }
  if (status === 'completed') return 100
  return estimateProgressByStatus(rawStatus, Number(raw?.fetched || 0), Number(raw?.total || 0))
}

const normalizeJobRecord = (raw: any, fallbackTopic = ''): ResearchJobRecord | null => {
  if (!raw || typeof raw !== 'object') return null
  const jobId = String(raw.jobId || raw.id || raw.job_id || raw.taskId || '').trim()
  if (!jobId) return null

  const rawStatus = String(raw.status || raw.phase || raw.state || '').trim().toLowerCase()
  const status = normalizeStatus(rawStatus)
  const progress = normalizeProgress(raw.progress ?? raw.percent ?? raw.percentage, status, rawStatus, raw)

  return {
    jobId,
    topic: String(raw.topic || raw.query || raw.target || fallbackTopic || '').trim(),
    status,
    rawStatus,
    progress,
    step: String(raw.step || raw.stage || raw.currentStep || raw.workflowStep || '').trim(),
    message: String(raw.message || raw.detail || raw.error || '').trim(),
    createdAt: String(raw.createdAt || raw.created_at || '').trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || '').trim(),
    completedAt: String(raw.completedAt || raw.completed_at || '').trim(),
    result: extractResultPayload(raw.result)
  }
}

const normalizeJobPayload = (payload: any, fallbackTopic = '') => {
  const root = unwrapData<any>(payload)
  return normalizeJobRecord(root?.job || root?.item || root, fallbackTopic)
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

const readPersistedActiveJob = () => ({
  jobId: String(localStorage.getItem(RESEARCH_ACTIVE_JOB_KEY) || '').trim(),
  topic: String(localStorage.getItem(RESEARCH_ACTIVE_TOPIC_KEY) || '').trim()
})

const persistActiveJob = (jobId: string, topic: string) => {
  if (!jobId) return
  localStorage.setItem(RESEARCH_ACTIVE_JOB_KEY, jobId)
  localStorage.setItem(RESEARCH_ACTIVE_TOPIC_KEY, topic || '')
}

const clearPersistedActiveJob = () => {
  localStorage.removeItem(RESEARCH_ACTIVE_JOB_KEY)
  localStorage.removeItem(RESEARCH_ACTIVE_TOPIC_KEY)
}

const sortByRecent = (a: ResearchJobRecord, b: ResearchJobRecord) => {
  const timeA = Date.parse(a.updatedAt || a.createdAt || a.completedAt || '')
  const timeB = Date.parse(b.updatedAt || b.createdAt || b.completedAt || '')
  if (Number.isFinite(timeA) && Number.isFinite(timeB)) return timeB - timeA
  if (Number.isFinite(timeA)) return -1
  if (Number.isFinite(timeB)) return 1
  return b.jobId.localeCompare(a.jobId)
}

const upsertJob = (job: ResearchJobRecord) => {
  const existingIndex = jobs.value.findIndex((item) => item.jobId === job.jobId)
  if (existingIndex === -1) {
    jobs.value = [job, ...jobs.value].sort(sortByRecent)
    return
  }
  const next = [...jobs.value]
  next[existingIndex] = { ...next[existingIndex], ...job }
  jobs.value = next.sort(sortByRecent)
}

const statusTagType = (status: ResearchJobStatus, rawStatus = '') => {
  if (isCompletedStatus(status)) return 'success'
  if (isFailedStatus(status)) return 'danger'
  if (rawStatus === 'searching') return 'info'
  return 'warning'
}

const progressStatusType = (status: ResearchJobStatus, _rawStatus = '') => {
  if (isCompletedStatus(status)) return 'success'
  if (isFailedStatus(status)) return 'exception'
  return undefined
}

const formatStatusText = (status: ResearchJobStatus, rawStatus = '') => {
  if (rawStatus === 'searching') return t('deepResearch.status.searching')
  if (rawStatus === 'fetching') return t('deepResearch.status.fetching')
  if (rawStatus === 'analyzing') return t('deepResearch.status.analyzing')
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'pending') return t('deepResearch.status.pending')
  if (normalized === 'running') return t('deepResearch.status.running')
  if (normalized === 'completed') return t('deepResearch.status.completed')
  if (normalized === 'failed') return t('deepResearch.status.failed')
  return t('deepResearch.status.unknown')
}

const isCompletedStatus = (status: ResearchJobStatus) => String(status || '').trim().toLowerCase() === 'completed'
const isFailedStatus = (status: ResearchJobStatus) => String(status || '').trim().toLowerCase() === 'failed'
const isRunningStatus = (status: ResearchJobStatus) => {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized === 'running' || normalized === 'pending'
}

const allJobs = computed(() => {
  if (!activeJob.value?.jobId) return jobs.value
  const map = new Map<string, ResearchJobRecord>()
  jobs.value.forEach((item) => map.set(item.jobId, item))
  map.set(activeJob.value.jobId, { ...(map.get(activeJob.value.jobId) || {}), ...activeJob.value } as ResearchJobRecord)
  return Array.from(map.values()).sort(sortByRecent)
})

const runningJobs = computed(() => allJobs.value.filter((item) => isRunningStatus(item.status)))
const historyJobs = computed(() => allJobs.value.filter((item) => !isRunningStatus(item.status)))

const normalizeSourceItem = (item: any): ResultSourceItem | null => {
  if (typeof item === 'string') {
    const text = item.trim()
    if (!text) return null
    const isUrl = /^https?:\/\//i.test(text)
    return { title: text, url: isUrl ? text : '' }
  }
  if (!item || typeof item !== 'object') return null
  const url = String(item.url || item.link || item.href || '').trim()
  const title = String(item.title || item.name || item.source || url).trim()
  if (!url && !title) return null
  return { title: title || url, url }
}

const researchSummary = computed(() => {
  const root = resultPayload.value || {}
  return firstNonEmptyText([
    root?.research?.summary,
    root?.research?.report?.summary,
    root?.researchSummary,
    root?.summary,
    root?.research?.overview
  ])
})

const researchSources = computed<ResultSourceItem[]>(() => {
  const root = resultPayload.value || {}
  const rawSources = root?.research?.sources
    || root?.research?.report?.sources
    || root?.sources
    || root?.analysis?.sources
    || []
  if (!Array.isArray(rawSources)) return []
  return rawSources
    .map((item) => normalizeSourceItem(item))
    .filter((item): item is ResultSourceItem => Boolean(item))
})

const analysisNarrative = computed(() => {
  const root = resultPayload.value || {}
  return firstNonEmptyText([
    root?.analysis?.narrative,
    root?.analysis?.aiNarrative,
    root?.analysisNarrative,
    root?.narrative
  ])
})

const analysisKeyFindings = computed(() => {
  const root = resultPayload.value || {}
  return toStringArray(
    root?.analysis?.keyFindings
    || root?.analysis?.findings
    || root?.research?.keyFindings
    || root?.keyFindings
  )
})

const analysisSuggestions = computed(() => {
  const root = resultPayload.value || {}
  return toStringArray(
    root?.analysis?.suggestions
    || root?.analysis?.recommendations
    || root?.research?.suggestions
    || root?.suggestions
  )
})

const formatTime = (value: string) => {
  if (!value) return '-'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Date(timestamp).toLocaleString()
}

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

const applyJobState = async (job: ResearchJobRecord, options: { fromPolling?: boolean } = {}) => {
  activeJob.value = job
  upsertJob(job)

  if (isCompletedStatus(job.status)) {
    clearPersistedActiveJob()
    stopPolling()
    const inlineResult = extractResultPayload(job.result)
    if (inlineResult) {
      resultPayload.value = inlineResult
      return
    }
    await fetchJobResult(job.jobId, true)
    if (options.fromPolling) {
      ElMessage.success(t('deepResearch.message.completed'))
    }
    return
  }

  if (isFailedStatus(job.status)) {
    clearPersistedActiveJob()
    stopPolling()
    if (options.fromPolling) {
      ElMessage.error(job.message || t('deepResearch.message.failed'))
    }
    return
  }

  persistActiveJob(job.jobId, job.topic)
}

const fetchJobResult = async (jobId: string, silentError = false) => {
  if (!jobId) return null
  try {
    const response = await request.get(`/research/analyze/jobs/${encodeURIComponent(jobId)}/result`)
    const resolved = extractResultPayload(response)
    if (!resolved) return null
    resultPayload.value = resolved
    const index = jobs.value.findIndex((item) => item.jobId === jobId)
    if (index >= 0) {
      const current = jobs.value[index]
      if (current) {
        upsertJob({ ...current, result: resolved })
      }
    }
    return resolved
  } catch (err: any) {
    if (!silentError) {
      const backendMessage = err?.response?.data?.message || err?.response?.data?.error
      ElMessage.error(backendMessage || t('deepResearch.message.loadResultFailed'))
    }
  }
  return null
}

const fetchJobStatus = async (jobId: string, options: { silent?: boolean } = {}) => {
  if (!jobId || pollingRequestPending.value) return
  pollingRequestPending.value = true
  try {
    const response = await request.get(`/research/analyze/jobs/${encodeURIComponent(jobId)}`)
    const normalized = normalizeJobPayload(response)
    if (!normalized) return
    await applyJobState(normalized, { fromPolling: true })
  } catch (err: any) {
    if (!options.silent) {
      const backendMessage = err?.response?.data?.message || err?.response?.data?.error
      ElMessage.error(backendMessage || t('deepResearch.message.pollFailed'))
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
  }, POLL_INTERVAL_MS)
}

const loadJobs = async () => {
  jobsLoading.value = true
  try {
    const response = await request.get('/research/analyze/jobs', {
      params: { limit: 30, offset: 0 }
    })
    const list = extractJobList(response)
    jobs.value = list
      .map((item: any) => normalizeJobRecord(item))
      .filter((item: ResearchJobRecord | null): item is ResearchJobRecord => Boolean(item))
      .sort(sortByRecent)
  } catch (err: any) {
    const backendMessage = err?.response?.data?.message || err?.response?.data?.error
    ElMessage.error(backendMessage || t('deepResearch.message.loadJobsFailed'))
  } finally {
    jobsLoading.value = false
  }
}

const focusRunningTask = (job: ResearchJobRecord) => {
  activeJob.value = job
  persistActiveJob(job.jobId, job.topic)
  startPolling(job.jobId)
}

const historyRowClassName = ({ row }: { row: ResearchJobRecord }) => {
  return isCompletedStatus(row.status) ? 'history-row-clickable' : ''
}

const openHistoryResult = async (row: ResearchJobRecord) => {
  if (!row?.jobId || !isCompletedStatus(row.status)) return
  activeJob.value = row
  const inlineResult = extractResultPayload(row.result)
  if (inlineResult) {
    resultPayload.value = inlineResult
    return
  }
  historyResultLoadingJobId.value = row.jobId
  try {
    await fetchJobResult(row.jobId)
  } finally {
    historyResultLoadingJobId.value = ''
  }
}

const restoreActiveJob = async () => {
  const persisted = readPersistedActiveJob()
  if (persisted.topic && !form.topic.trim()) {
    form.topic = persisted.topic
  }

  if (persisted.jobId) {
    activeJob.value = {
      jobId: persisted.jobId,
      topic: persisted.topic,
      status: 'running',
      rawStatus: 'running',
      progress: 0,
      step: '',
      message: '',
      createdAt: '',
      updatedAt: '',
      completedAt: ''
    }
    startPolling(persisted.jobId)
    ElMessage.info(t('deepResearch.message.restored'))
    return
  }

  const firstRunningJob = runningJobs.value[0]
  if (firstRunningJob) {
    focusRunningTask(firstRunningJob)
  }
}

const startResearch = async () => {
  const topic = form.topic.trim()
  if (!topic) {
    ElMessage.warning(t('deepResearch.message.topicRequired'))
    return
  }

  loading.value = true
  try {
    const response = await request.post('/research/analyze/jobs', { topic })
    const normalized = normalizeJobPayload(response, topic)
    if (!normalized) {
      throw new Error(t('deepResearch.message.submitFailed'))
    }
    resultPayload.value = null
    await applyJobState(normalized)
    startPolling(normalized.jobId)
    await loadJobs()
    ElMessage.success(t('deepResearch.message.submitSuccess'))
  } catch (err: any) {
    const backendMessage = err?.response?.data?.message || err?.response?.data?.error
    ElMessage.error(backendMessage || err?.message || t('deepResearch.message.submitFailed'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadJobs()
  await restoreActiveJob()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.deep-research-page {
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
  gap: 12px;
}

.title-icon,
.result-icon {
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
  max-width: 860px;
}

.start-button {
  min-height: 44px;
}

.running-card,
.progress-card,
.history-card,
.result-card {
  margin-top: 20px;
}

.section-header,
.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-header {
  justify-content: space-between;
}

.section-refresh,
.history-action {
  min-height: 44px;
  cursor: pointer;
}

.running-list {
  display: grid;
  gap: 10px;
}

.running-item {
  width: 100%;
  border: 1px solid #dbe7ff;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  text-align: left;
  min-height: 88px;
  cursor: pointer;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.running-item:hover {
  border-color: #96bbff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.1);
  transform: translateY(-1px);
}

.running-item.is-active {
  border-color: #1a73e8;
  background: #f5f9ff;
}

.running-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.running-item-topic {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.5;
}

.running-item-meta {
  margin: 10px 0 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #606266;
  font-size: 12px;
  line-height: 1.5;
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

.progress-topic,
.progress-message {
  margin: 12px 0 0;
  color: #606266;
  line-height: 1.6;
}

.table-scroll-x {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table {
  min-width: 760px;
}

:deep(.history-row-clickable) {
  cursor: pointer;
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
  margin: 0 0 12px;
}

.long-text {
  margin: 0;
  color: #303133;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.source-list {
  margin: 0;
  padding-left: 20px;
}

.source-list li {
  margin-bottom: 8px;
  line-height: 1.6;
  word-break: break-word;
}

.source-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  color: #1a73e8;
  text-decoration: none;
  cursor: pointer;
  transition: color 180ms ease;
}

.source-link:hover {
  color: #165fc0;
  text-decoration: underline;
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

@media (max-width: 768px) {
  .deep-research-page {
    padding: 12px;
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

  .data-table {
    min-width: 640px;
  }

  .running-item {
    min-height: 92px;
    padding: 10px;
  }
}
</style>
