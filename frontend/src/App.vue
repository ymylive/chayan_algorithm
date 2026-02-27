<template>
  <MainLayout v-if="showMainLayout" />
  <RouterView v-else />
  <GlobalLoadingOverlay :visible="isGlobalLoading" :text="loadingText" />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { computed, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import MainLayout from './layouts/MainLayout.vue'
import { useUiStore } from './stores/ui'
import GlobalLoadingOverlay from './components/feedback/GlobalLoadingOverlay.vue'

const route = useRoute()
const uiStore = useUiStore()
const { message, isGlobalLoading, loadingText } = storeToRefs(uiStore)

const showMainLayout = computed(() => route.meta.requiresAuth !== false)

watch(
  message,
  payload => {
    if (!payload?.text) return

    ElMessage({
      message: payload.text,
      type: payload.type ?? 'info',
      duration: payload.duration ?? 3000,
      showClose: payload.showClose ?? true
    })

    uiStore.clearMessage()
  },
  { flush: 'post' }
)
</script>
