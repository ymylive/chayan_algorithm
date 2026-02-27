import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unknown'

export interface PendingAnalysisJob {
  jobId: string
  target: string
  status: AnalysisJobStatus | string
  progress: number
  step?: string
  message?: string
  createdAt?: string
  updatedAt?: string
}

export interface AnalysisHistoryRecord {
  jobId: string
  target: string
  status: string
  progress: number
  step?: string
  message?: string
  createdAt?: string
  updatedAt?: string
  completedAt?: string
  result?: any
}

export const useAnalysisStore = defineStore('analysis', () => {
  const currentData = ref<any>(null)
  const results = ref<any[]>([])
  const pendingJob = ref<PendingAnalysisJob | null>(null)
  const history = ref<AnalysisHistoryRecord[]>([])

  const setCurrentData = (payload: any) => {
    currentData.value = payload ?? null
  }

  const setResults = (payload: any[]) => {
    results.value = Array.isArray(payload) ? [...payload] : []
  }

  const appendResult = (payload: any) => {
    if (!payload) return
    results.value = [payload, ...results.value]
  }

  const setPendingJob = (payload: PendingAnalysisJob | null) => {
    pendingJob.value = payload ? { ...payload } : null
  }

  const clearPendingJob = () => {
    pendingJob.value = null
  }

  const setHistory = (payload: AnalysisHistoryRecord[]) => {
    history.value = Array.isArray(payload) ? [...payload] : []
  }

  const upsertHistoryRecord = (payload: AnalysisHistoryRecord) => {
    if (!payload?.jobId) return
    const index = history.value.findIndex((entry) => entry.jobId === payload.jobId)
    if (index === -1) {
      history.value = [payload, ...history.value]
      return
    }
    const next = [...history.value]
    next[index] = { ...next[index], ...payload }
    history.value = next
  }

  return {
    currentData,
    results,
    pendingJob,
    history,
    setCurrentData,
    setResults,
    appendResult,
    setPendingJob,
    clearPendingJob,
    setHistory,
    upsertHistoryRecord
  }
})
