<template>
  <div class="recommendations-container">
    <h2>决策建议</h2>

    <el-select v-model="enterpriseId" placeholder="选择企业" style="width: 300px; margin-bottom: 20px;" @change="fetchRecommendations">
      <el-option v-for="item in enterprises" :key="item.id" :label="item.name" :value="item.id" />
    </el-select>

    <el-button type="primary" :disabled="!enterpriseId" style="margin-left: 10px;">导出建议</el-button>

    <div v-if="loading" style="text-align: center; padding: 40px;">
      <el-icon class="is-loading" :size="40"><loading /></el-icon>
    </div>

    <div v-else-if="recommendations.length > 0" style="margin-top: 20px;">
      <el-collapse>
        <el-collapse-item v-for="rec in recommendations" :key="rec.id">
          <template #title>
            <div style="display: flex; align-items: center; width: 100%;">
              <el-tag :type="getCategoryType(rec.category)" size="small" style="margin-right: 10px;">
                {{ rec.category }}
              </el-tag>
              <el-tag :type="getPriorityType(rec.priority)" size="small" style="margin-right: 10px;">
                {{ rec.priority }}
              </el-tag>
              <span>{{ rec.title }}</span>
            </div>
          </template>
          <div style="padding: 10px;">
            <p><strong>建议内容：</strong>{{ rec.content }}</p>
            <p v-if="rec.impact"><strong>预期影响：</strong>{{ rec.impact }}</p>
            <p v-if="rec.createdAt"><strong>生成时间：</strong>{{ rec.createdAt }}</p>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <el-empty v-else description="暂无建议数据" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import request from '../utils/request'

const enterpriseId = ref('')
const enterprises = ref([
  { id: '1', name: '企业A' },
  { id: '2', name: '企业B' },
  { id: '3', name: '企业C' }
])
const recommendations = ref([])
const loading = ref(false)

const fetchRecommendations = async () => {
  if (!enterpriseId.value) return

  loading.value = true
  try {
    const res = await request.get(`/api/recommendations/${enterpriseId.value}`)
    recommendations.value = res.data || []
  } catch (error) {
    ElMessage.error('获取建议失败')
    recommendations.value = []
  } finally {
    loading.value = false
  }
}

const getCategoryType = (category) => {
  const map = { '战略': 'danger', '运营': 'warning', '财务': 'success', '市场': 'info' }
  return map[category] || ''
}

const getPriorityType = (priority) => {
  const map = { '高': 'danger', '中': 'warning', '低': 'info' }
  return map[priority] || ''
}

onMounted(() => {
  if (enterprises.value.length > 0) {
    enterpriseId.value = enterprises.value[0].id
    fetchRecommendations()
  }
})
</script>

<style scoped>
.recommendations-container {
  padding: 20px;
}
</style>
