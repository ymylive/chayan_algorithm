<template>
  <div class="dashboard">
    <div class="content-shell">
      <el-card class="welcome-banner" shadow="never">
        <div class="banner-content">
          <div class="banner-text">
            <h1>欢迎使用茶研算法分析系统</h1>
            <p>基于 AI 的企业数据分析与决策支持平台</p>
          </div>
          <div class="banner-decor" aria-hidden="true">
            <span class="decor-circle circle-lg"></span>
            <span class="decor-circle circle-md"></span>
            <span class="decor-circle circle-sm"></span>
          </div>
        </div>
      </el-card>

      <section class="stats-grid">
        <el-card
          v-for="item in statsCards"
          :key="item.label"
          class="stat-card"
          shadow="hover"
          :style="{ borderLeftColor: item.color }"
        >
          <div class="stat-top">
            <span class="stat-icon" :style="{ backgroundColor: `${item.color}1A`, color: item.color }">
              <el-icon><component :is="item.icon" /></el-icon>
            </span>
            <span class="stat-number">{{ item.value }}</span>
          </div>
          <div class="stat-label">{{ item.label }}</div>
          <div class="stat-desc">{{ item.desc }}</div>
        </el-card>
      </section>

      <section class="actions-grid">
        <el-card
          v-for="action in quickActions"
          :key="action.title"
          class="action-card"
          shadow="hover"
          @click="router.push(action.path)"
        >
          <span class="action-icon" :style="{ backgroundColor: `${action.color}1A`, color: action.color }">
            <el-icon><component :is="action.icon" /></el-icon>
          </span>
          <h3>{{ action.title }}</h3>
          <p>{{ action.desc }}</p>
        </el-card>
      </section>

      <el-card class="enterprise-card">
        <template #header>
          <div class="enterprise-header">
            <div class="enterprise-heading">
              <span class="enterprise-title">企业列表</span>
            </div>
            <div class="search-group">
              <el-input
                v-model="searchName"
                class="search-input"
                placeholder="请输入企业名称"
                clearable
                @keyup.enter="handleSearch"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <el-button type="primary" class="search-button" @click="handleSearch">搜索</el-button>
            </div>
          </div>
        </template>

        <div class="table-scroll">
          <el-table :data="enterprises" class="enterprise-table">
            <el-table-column prop="id" label="ID" width="90" />
            <el-table-column prop="name" label="企业名称" min-width="220" />
            <el-table-column prop="industry" label="行业" min-width="160" />
            <el-table-column prop="created_at" label="创建时间" min-width="200" :formatter="formatCreatedAt" />
          </el-table>
        </div>

        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="loadEnterprises"
            @size-change="handlePageSizeChange"
          />
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { Cpu, DataLine, Document, PieChart, Promotion, Search, Upload } from '@element-plus/icons-vue'
import request from '../utils/request'

interface Enterprise {
  id: number | string
  name: string
  industry: string
  created_at?: string
}

interface DashboardCard {
  label: string
  value: number | string
  desc: string
  color: string
  icon: Component
}

interface QuickAction {
  title: string
  desc: string
  path: string
  color: string
  icon: Component
}

const router = useRouter()
const searchName = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const enterprises = ref<Enterprise[]>([])

const loadEnterprises = async () => {
  const res = await request.get('/enterprises', {
    params: {
      name: searchName.value,
      page: page.value,
      limit: pageSize.value,
      page_size: pageSize.value
    }
  })
  const list = Array.isArray(res.data) ? res.data : []
  const responseTotal = Reflect.get(res, 'total')
  enterprises.value = list
  total.value = typeof responseTotal === 'number' ? responseTotal : list.length
}

const statsCards = computed<DashboardCard[]>(() => [
  {
    label: '企业总数',
    value: total.value,
    desc: '平台已纳入企业数据总量',
    color: '#1a73e8',
    icon: DataLine
  },
  {
    label: '分析报告',
    value: '12',
    desc: '近期生成的企业分析报告',
    color: '#34a853',
    icon: PieChart
  },
  {
    label: '决策建议',
    value: '28',
    desc: '已生成可执行策略建议',
    color: '#fbbc04',
    icon: Promotion
  },
  {
    label: '数据文件',
    value: '6',
    desc: '当前可用数据资产文件',
    color: '#ea4335',
    icon: Document
  }
])

const quickActions: QuickAction[] = [
  {
    title: '上传数据',
    desc: '上传 CSV/Excel/JSON 数据文件',
    path: '/upload',
    color: '#1a73e8',
    icon: Upload
  },
  {
    title: '数据分析',
    desc: '查看企业财务与竞争力分析',
    path: '/analysis',
    color: '#34a853',
    icon: PieChart
  },
  {
    title: 'AI 分析',
    desc: '使用 AI 进行深度洞察分析',
    path: '/ai-analyze',
    color: '#fbbc04',
    icon: Cpu
  },
  {
    title: '决策建议',
    desc: '获取智能决策建议',
    path: '/recommendations',
    color: '#ea4335',
    icon: Promotion
  }
]

const handleSearch = () => {
  page.value = 1
  loadEnterprises()
}

const handlePageSizeChange = () => {
  page.value = 1
  loadEnterprises()
}

const formatCreatedAt = (_row: Enterprise, _column: unknown, value: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

onMounted(loadEnterprises)
</script>

<style scoped>
.dashboard {
  --primary: #1a73e8;
  --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  --radius: 8px;
  padding: 20px 24px 24px;
  background: #f5f7fb;
  min-height: 100%;
}

.content-shell {
  width: min(1360px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.welcome-banner {
  border: none;
  background: linear-gradient(135deg, #1a73e8, #4a9af5);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  overflow: hidden;
}

.welcome-banner :deep(.el-card__body) {
  padding: 24px 28px;
}

.banner-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  color: #fff;
}

.banner-text h1 {
  margin: 0;
  font-size: clamp(24px, 2.2vw, 30px);
  line-height: 1.3;
  font-weight: 700;
}

.banner-text p {
  margin: 10px 0 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.banner-decor {
  position: relative;
  width: 190px;
  height: 104px;
  flex-shrink: 0;
}

.decor-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
}

.circle-lg {
  width: 110px;
  height: 110px;
  right: 0;
  top: -4px;
}

.circle-md {
  width: 74px;
  height: 74px;
  right: 92px;
  top: 38px;
}

.circle-sm {
  width: 44px;
  height: 44px;
  right: 134px;
  top: 0;
}

.stats-grid,
.actions-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 18px;
}

.stat-card {
  border-left: 3px solid var(--primary);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
}

.stat-card :deep(.el-card__body) {
  padding: 18px 16px;
}

.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.stat-number {
  font-size: 28px;
  font-weight: 700;
  color: #1f2d3d;
}

.stat-label {
  margin-top: 12px;
  color: #303133;
  font-weight: 600;
}

.stat-desc {
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
}

.action-card {
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  min-height: 156px;
}

.action-card:hover {
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.14);
}

.action-card :deep(.el-card__body) {
  height: 100%;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.action-icon {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.action-card h3 {
  margin: 12px 0 6px;
  font-size: 16px;
  color: #303133;
}

.action-card p {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.enterprise-card {
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}

.enterprise-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.enterprise-heading {
  display: flex;
  align-items: center;
  min-height: 32px;
}

.enterprise-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.search-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.search-input {
  width: min(320px, 100%);
}

.search-button {
  flex-shrink: 0;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
}

.table-scroll :deep(.el-table) {
  min-width: 700px;
}

.enterprise-table :deep(.el-table__header th.el-table__cell) {
  background: #fafafa;
}

.enterprise-table :deep(.el-table__body tr:hover > td) {
  background: #eef4ff;
}

.pagination-wrap {
  margin-top: 18px;
  display: flex;
  justify-content: center;
  overflow-x: auto;
}

.pagination-wrap :deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: center;
  row-gap: 8px;
}

@media (max-width: 1200px) {
  .stats-grid,
  .actions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .search-group {
    margin-left: 0;
  }
}

@media (max-width: 768px) {
  .dashboard {
    padding: 16px;
  }

  .content-shell {
    gap: 14px;
  }

  .welcome-banner :deep(.el-card__body) {
    padding: 18px;
  }

  .banner-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }

  .banner-text h1 {
    font-size: 22px;
  }

  .banner-text p {
    margin-top: 8px;
    font-size: 13px;
  }

  .banner-decor {
    width: 100%;
    max-width: 180px;
    height: 84px;
  }

  .stats-grid,
  .actions-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .action-card {
    min-height: 140px;
  }

  .enterprise-header {
    align-items: stretch;
    gap: 12px;
  }

  .search-group {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .search-input {
    width: 100%;
  }

  .search-button {
    width: 100%;
  }

  .pagination-wrap {
    justify-content: flex-start;
    padding-bottom: 4px;
  }

  .pagination-wrap :deep(.el-pagination) {
    justify-content: flex-start;
  }
}
</style>
