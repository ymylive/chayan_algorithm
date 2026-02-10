import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAnalysisStore = defineStore('analysis', () => {
  const currentData = ref<any>(null)
  const results = ref<any[]>([])

  return { currentData, results }
})
