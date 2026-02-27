<template>
  <div class="deep-research-page">
    <el-card>
      <template #header>
        <div class="header-row">
          <span class="title-icon"><el-icon><Search /></el-icon></span>
          <div>
            <div class="title-main">深度研究</div>
            <div class="title-sub">实时搜索、抓取、分析市场数据与竞争对手</div>
          </div>
        </div>
      </template>

      <el-form :model="form" label-width="100px">
        <el-form-item label="研究主题">
          <el-input v-model="form.topic" placeholder="例如：新能源汽车市场" clearable @keyup.enter="startResearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="startResearch">启动研究</el-button>
        </el-form-item>
      </el-form>

      <div v-if="currentTask" class="progress-section">
        <div class="progress-header">
          <span class="status-badge" :class="statusClass">{{ statusText }}</span>
          <span class="progress-pct">{{ progressPct }}%</span>
        </div>
        <el-progress :percentage="progressPct" :status="progressStatus" />
        <div class="progress-detail">{{ progressDetail }}</div>
      </div>

      <el-card v-if="result" class="result-card">
        <template #header>
          <span class="result-icon"><el-icon><Document /></el-icon></span>
          <span>研究结果</span>
        </template>

        <div class="section" v-if="result.marketData">
          <h4>市场数据</h4>
          <pre>{{ JSON.stringify(result.marketData, null, 2) }}</pre>
        </div>

        <div class="section" v-if="result.competitors?.length">
          <h4>竞争对手</h4>
          <el-table :data="result.competitors" border stripe size="small">
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="relevance" label="相关度" width="100" />
            <el-table-column prop="source" label="来源" width="120" />
          </el-table>
        </div>

        <div class="section" v-if="result.sources?.length">
          <h4>来源列表</h4>
          <ul class="source-list">
            <li v-for="(src, idx) in result.sources" :key="idx">
              <a :href="src.url" target="_blank">{{ src.title || src.url }}</a>
            </li>
          </ul>
        </div>
      </el-card>
    </el-card>

    <el-card v-if="history.length" class="history-card">
      <template #header>历史记录</template>
      <el-table :data="history" border stripe size="small" @row-click="loadHistory">
        <el-table-column prop="topic" label="主题" />
        <el-table-column prop="createdAt" label="时间" width="180" />
        <el-table-column prop="status" label="状态" width="100" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../utils/request'

const form = reactive({ topic: '' })
const loading = ref(false)
const currentTask = ref<any>(null)
const result = ref<any>(null)
const history = ref<any[]>([])
const ws = ref<WebSocket | null>(null)

const progressPct = computed(() => {
  if (!currentTask.value) return 0
  const { phase, fetched = 0, total = 0 } = currentTask.value
  if (phase === 'searching') return 10
  if (phase === 'fetching') return 10 + Math.floor((fetched / Math.max(total, 1)) * 60)
  if (phase === 'analyzing') return 80
  if (phase === 'completed') return 100
  return 0
})

const statusText = computed(() => {
  const phase = currentTask.value?.phase
  if (phase === 'searching') return '搜索中'
  if (phase === 'fetching') return '抓取中'
  if (phase === 'analyzing') return '分析中'
  if (phase === 'completed') return '已完成'
  return '待启动'
})

const statusClass = computed(() => {
  const phase = currentTask.value?.phase
  if (phase === 'completed') return 'status-success'
  if (phase === 'error') return 'status-error'
  return 'status-running'
})

const progressStatus = computed(() => {
  if (currentTask.value?.phase === 'completed') return 'success'
  if (currentTask.value?.phase === 'error') return 'exception'
  return undefined
})

const progressDetail = computed(() => {
  if (!currentTask.value) return ''
  const { phase, fetched = 0, total = 0 } = currentTask.value
  if (phase === 'fetching') return `已抓取 ${fetched}/${total}`
  return ''
})

const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws/research`
  ws.value = new WebSocket(wsUrl)

  ws.value.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'progress') {
      currentTask.value = { ...currentTask.value, ...data.payload }
    } else if (data.type === 'completed') {
      currentTask.value = { ...currentTask.value, phase: 'completed' }
      result.value = data.payload
      localStorage.removeItem('research_task_id')
      loadHistory()
    } else if (data.type === 'error') {
      currentTask.value = { ...currentTask.value, phase: 'error' }
      ElMessage.error(data.message || '研究失败')
    }
  }

  ws.value.onerror = () => {
    ElMessage.warning('WebSocket 连接异常')
  }
}

const startResearch = async () => {
  if (!form.topic.trim()) {
    ElMessage.warning('请输入研究主题')
    return
  }

  loading.value = true
  try {
    const res = await request.post('/research/start', { topic: form.topic }) as any
    const payload = (res && typeof res === 'object' && res.data && typeof res.data === 'object')
      ? res.data
      : res
    const taskId = String(payload?.taskId || payload?.jobId || '').trim()
    if (payload?.success && taskId) {
      currentTask.value = { taskId, phase: 'searching' }
      localStorage.setItem('research_task_id', taskId)
      ElMessage.success('研究已启动')
    }
  } catch (err: any) {
    ElMessage.error(err.message || '启动失败')
  } finally {
    loading.value = false
  }
}

const loadHistory = async (row?: any) => {
  if (row) {
    result.value = row.result
    currentTask.value = null
  } else {
    const res = await request.get('/research/history') as any
    const payload = (res && typeof res === 'object' && res.data && typeof res.data === 'object')
      ? res.data
      : res
    history.value = payload?.data || payload?.items || payload || []
  }
}

onMounted(() => {
  connectWebSocket()
  loadHistory()
  const savedTaskId = localStorage.getItem('research_task_id')
  if (savedTaskId) {
    currentTask.value = { taskId: savedTaskId, phase: 'searching' }
  }
})

onUnmounted(() => {
  ws.value?.close()
})
</script>

<style scoped>
.deep-research-page {
  padding: 24px;
  max-width: 1280px;
  margin: 0 auto;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon, .result-icon {
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

.progress-section {
  margin-top: 20px;
  padding: 16px;
  background: #f5f9ff;
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}

.status-running {
  background: #e6f7ff;
  color: #1890ff;
}

.status-success {
  background: #f6ffed;
  color: #52c41a;
}

.status-error {
  background: #fff1f0;
  color: #ff4d4f;
}

.progress-pct {
  font-size: 16px;
  font-weight: 700;
  color: #1890ff;
}

.progress-detail {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}

.result-card, .history-card {
  margin-top: 20px;
}

.section {
  margin-top: 20px;
}

.section h4 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
  margin: 0 0 12px;
}

.source-list {
  margin: 0;
  padding-left: 20px;
}

.source-list li {
  margin-bottom: 8px;
  line-height: 1.6;
}

.source-list a {
  color: #1890ff;
  text-decoration: none;
}

.source-list a:hover {
  text-decoration: underline;
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
  }

  .progress-section {
    padding: 12px;
  }
}
</style>

