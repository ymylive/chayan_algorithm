<template>
  <div class="recommendations-page">
    <div class="content-shell">
      <div class="section-title">
        <el-icon><promotion /></el-icon>
        <h2>决策建议</h2>
      </div>

      <el-card shadow="hover" class="controls-card">
        <div class="control-bar">
          <el-select v-model="enterpriseId" placeholder="选择企业" class="enterprise-select" @change="fetchRecommendations">
            <template #prefix>
              <el-icon><search /></el-icon>
            </template>
            <el-option v-for="item in enterprises" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>

          <div class="control-actions">
            <el-button type="primary" plain :icon="Download" :disabled="!enterpriseId">导出建议</el-button>
            <el-button :icon="Refresh" @click="fetchRecommendations">刷新</el-button>
          </div>
        </div>
      </el-card>

      <div v-if="loading" class="loading-list">
        <div class="loading-header">
          <el-icon class="is-loading" :size="22"><loading /></el-icon>
          <span>正在生成建议...</span>
        </div>
        <el-card v-for="item in 3" :key="item" class="skeleton-card" shadow="never">
          <el-skeleton animated :rows="3" />
        </el-card>
      </div>

      <div v-else-if="recommendations.length > 0" class="recommendation-list">
        <el-card
          v-for="rec in recommendations"
          :key="rec.id"
          class="rec-card"
          shadow="hover"
          :style="{ borderLeftColor: rec.priorityValue >= 7 ? '#ea4335' : rec.priorityValue >= 4 ? '#fbbc04' : '#1a73e8' }"
        >
          <div class="rec-header">
            <el-tag :type="getCategoryType(rec.category)" size="small">{{ rec.category }}</el-tag>
            <el-tag :type="getPriorityType(rec.priority)" size="small">{{ rec.priority }}</el-tag>
            <span class="rec-title">{{ rec.title }}</span>
          </div>

          <div class="rec-content">{{ rec.content }}</div>
          <div v-if="rec.impact" class="rec-content"><strong>预期影响：</strong>{{ rec.impact }}</div>
          <div v-if="rec.createdAt" class="rec-meta">生成时间：{{ rec.createdAt }}</div>
        </el-card>
      </div>

      <el-empty v-else class="empty-state">
        <template #description>请先选择企业，开始查看智能决策建议</template>
        <el-button
          type="primary"
          @click="enterpriseId = enterprises.length ? enterprises[0].id : ''; enterpriseId && fetchRecommendations()"
        >
          选择企业开始查看
        </el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, Promotion, Download, Search, Refresh } from '@element-plus/icons-vue'
import request from '../utils/request'

const enterpriseId = ref('')
const enterprises = ref([])
const recommendations = ref([])
const loading = ref(false)

const categoryDisplayMap = {
  strategy: '战略',
  strategic: '战略',
  operation: '运营',
  operations: '运营',
  financial: '财务',
  finance: '财务',
  market: '市场',
  innovation: '创新',
  general: '通用'
}

const normalizeCategory = (category) => {
  if (typeof category !== 'string' || !category.trim()) {
    return '通用'
  }

  const key = category.trim().toLowerCase()
  return categoryDisplayMap[key] || category.trim()
}

const normalizePriorityValue = (priority) => {
  const value = Number(priority)
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(10, Math.round(value)))
}

const toPriorityLabel = (priorityValue) => {
  if (priorityValue >= 7) return '高'
  if (priorityValue >= 4) return '中'
  return '低'
}

const extractTitleAndContent = (row) => {
  const recommendationText = typeof row.recommendation_text === 'string' ? row.recommendation_text.trim() : ''
  const rawTitle = typeof row.title === 'string' ? row.title.trim() : ''
  const rawContent = typeof row.content === 'string' ? row.content.trim() : ''

  if (rawTitle && rawContent) {
    return { title: rawTitle, content: rawContent }
  }

  if (rawTitle && recommendationText) {
    return { title: rawTitle, content: recommendationText }
  }

  const split = recommendationText.match(/^([^:：]{1,24})[:：]\s*(.+)$/)
  if (split) {
    return {
      title: split[1].trim(),
      content: split[2].trim()
    }
  }

  return {
    title: rawTitle || '智能建议',
    content: recommendationText || rawContent || '暂无建议内容'
  }
}

const formatCreatedAt = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { hour12: false })
}

const mapRecommendationRows = (rows) => rows.map((row) => {
  const { title, content } = extractTitleAndContent(row)
  const priorityValue = normalizePriorityValue(row?.priority)

  return {
    id: row?.id,
    title,
    content,
    priorityValue,
    priority: toPriorityLabel(priorityValue),
    category: normalizeCategory(row?.category),
    impact: typeof row?.impact === 'string' ? row.impact : '',
    createdAt: formatCreatedAt(row?.created_at || row?.createdAt)
  }
})

const loadEnterprises = async () => {
  try {
    const res = await request.get('/enterprises', { params: { limit: 100 } })
    enterprises.value = Array.isArray(res?.data) ? res.data : []
  } catch {
    enterprises.value = []
  }
}

const fetchRecommendations = async () => {
  if (!enterpriseId.value) return

  loading.value = true
  try {
    const res = await request.get(`/recommendations/${enterpriseId.value}`)
    const rows = Array.isArray(res?.data) ? res.data : []
    recommendations.value = mapRecommendationRows(rows)
  } catch {
    ElMessage.error('获取建议失败')
    recommendations.value = []
  } finally {
    loading.value = false
  }
}

const getCategoryType = (category) => {
  const map = { '战略': 'danger', '运营': 'warning', '财务': 'success', '市场': 'info', '创新': 'success', '通用': 'info' }
  return map[category] || ''
}

const getPriorityType = (priority) => {
  const map = { '高': 'danger', '中': 'warning', '低': 'info' }
  return map[priority] || ''
}

onMounted(async () => {
  await loadEnterprises()
  if (enterprises.value.length > 0) {
    enterpriseId.value = enterprises.value[0].id
    fetchRecommendations()
  }
})
</script>

<style scoped>
.recommendations-page {
  padding: 24px;
}

.content-shell {
  width: min(100%, 1120px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
}

.section-title :deep(.el-icon) {
  color: #1a73e8;
  font-size: 22px;
}

.section-title h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.controls-card {
  border-radius: 8px;
  margin-bottom: 0;
}

.control-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.enterprise-select {
  width: 380px;
  max-width: 100%;
}

.control-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  flex-wrap: wrap;
}

.control-actions :deep(.el-button) {
  min-width: 100px;
}

.loading-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.loading-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
}

.skeleton-card {
  border-radius: 8px;
}

.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rec-card {
  border-radius: 8px;
  transition: all 0.3s;
  border-left: 4px solid;
  margin-bottom: 0;
}

.rec-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.rec-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.rec-header :deep(.el-tag) {
  flex-shrink: 0;
}

.rec-title {
  flex: 1;
  min-width: 0;
  color: #303133;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-content {
  color: #606266;
  line-height: 1.8;
  margin-top: 12px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.rec-meta {
  color: #909399;
  font-size: 13px;
  margin-top: 8px;
}

.empty-state {
  margin-top: 6px;
}

@media (max-width: 992px) {
  .recommendations-page {
    padding: 20px 16px;
  }

  .content-shell {
    width: min(100%, 920px);
    gap: 18px;
  }

  .control-bar {
    gap: 12px;
  }

  .enterprise-select {
    width: 320px;
  }

  .loading-list,
  .recommendation-list {
    gap: 12px;
  }
}

@media (max-width: 768px) {
  .recommendations-page {
    padding: 12px;
  }

  .content-shell {
    gap: 14px;
  }

  .section-title {
    gap: 6px;
  }

  .section-title :deep(.el-icon) {
    font-size: 19px;
  }

  .section-title h2 {
    font-size: 20px;
  }

  .control-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .enterprise-select {
    width: 100%;
  }

  .control-actions {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    margin-left: 0;
    gap: 10px;
  }

  .control-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0 !important;
  }

  .loading-list,
  .recommendation-list {
    gap: 10px;
  }

  .rec-header {
    align-items: flex-start;
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .rec-title {
    flex-basis: 100%;
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    line-height: 1.5;
  }

  .rec-content {
    margin-top: 10px;
    line-height: 1.7;
  }

  .empty-state {
    margin-top: 2px;
  }
}
</style>
