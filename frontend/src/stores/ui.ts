import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type UiMessageType = 'success' | 'warning' | 'info' | 'error'

export interface UiMessagePayload {
  text: string
  type?: UiMessageType
  duration?: number
  showClose?: boolean
}

export const useUiStore = defineStore('ui', () => {
  const loadingCount = ref(0)
  const loadingText = ref('Loading...')
  const message = ref<UiMessagePayload | null>(null)

  const isGlobalLoading = computed(() => loadingCount.value > 0)

  const startLoading = (text?: string) => {
    if (text && text.trim()) {
      loadingText.value = text.trim()
    }
    loadingCount.value += 1
  }

  const stopLoading = () => {
    loadingCount.value = Math.max(0, loadingCount.value - 1)
    if (loadingCount.value === 0) {
      loadingText.value = 'Loading...'
    }
  }

  const resetLoading = () => {
    loadingCount.value = 0
    loadingText.value = 'Loading...'
  }

  const setMessage = (payload: UiMessagePayload | null) => {
    if (!payload?.text) {
      message.value = null
      return
    }

    message.value = {
      text: payload.text,
      type: payload.type ?? 'info',
      duration: payload.duration,
      showClose: payload.showClose
    }
  }

  const clearMessage = () => {
    message.value = null
  }

  return {
    loadingCount,
    loadingText,
    isGlobalLoading,
    message,
    startLoading,
    stopLoading,
    resetLoading,
    setMessage,
    clearMessage
  }
})
