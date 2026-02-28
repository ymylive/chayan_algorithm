<template>
  <div class="intelligence-hub-page">
    <el-card class="hub-switcher" shadow="never">
      <div class="hub-title-wrap">
        <h2 class="hub-title">{{ t('aiAnalyze.unified.title') }}</h2>
        <p class="hub-subtitle">{{ t('aiAnalyze.unified.subtitle') }}</p>
      </div>
      <el-tabs v-model="activeTab" class="hub-tabs" stretch>
        <el-tab-pane :label="t('aiAnalyze.unified.tabs.analyze')" name="analyze" />
        <el-tab-pane :label="t('aiAnalyze.unified.tabs.research')" name="research" />
      </el-tabs>
    </el-card>

    <div class="hub-content">
      <KeepAlive>
        <component :is="activeView" />
      </KeepAlive>
    </div>
  </div>
</template>

<script setup lang="ts">
import { KeepAlive, computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

type HubTab = 'analyze' | 'research'

const AIAnalyzeView = defineAsyncComponent(() => import('./AIAnalyze.vue'))
const DeepResearchView = defineAsyncComponent(() => import('./DeepResearch.vue'))

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const normalizeTab = (raw: unknown): HubTab => {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'research' || route.path === '/deep-research') return 'research'
  return 'analyze'
}

const activeTab = ref<HubTab>(normalizeTab(route.query.tab))

watch(
  () => [route.path, route.query.tab],
  () => {
    const nextTab = normalizeTab(route.query.tab)
    if (activeTab.value !== nextTab) {
      activeTab.value = nextTab
    }
  }
)

watch(activeTab, (tab) => {
  const currentTab = normalizeTab(route.query.tab)
  if (currentTab === tab && route.path === '/ai-analyze') return
  void router.replace({
    path: '/ai-analyze',
    query: {
      ...route.query,
      tab
    }
  })
})

const activeView = computed(() => (activeTab.value === 'research' ? DeepResearchView : AIAnalyzeView))
</script>

<style scoped>
.intelligence-hub-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.hub-switcher {
  border-radius: 12px;
}

.hub-switcher :deep(.el-card__body) {
  padding: 14px 16px 8px;
}

.hub-title-wrap {
  margin-bottom: 8px;
}

.hub-title {
  margin: 0;
  font-size: 18px;
  line-height: 1.35;
  color: #0f172a;
}

.hub-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: #475569;
}

.hub-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.hub-content {
  min-width: 0;
}

@media (max-width: 768px) {
  .intelligence-hub-page {
    gap: 10px;
  }

  .hub-switcher :deep(.el-card__body) {
    padding: 12px 12px 6px;
  }

  .hub-title {
    font-size: 16px;
  }
}
</style>
