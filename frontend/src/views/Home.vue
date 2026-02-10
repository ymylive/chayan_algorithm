<template>
  <div class="home">
    <el-card>
      <el-form :inline="true">
        <el-form-item label="企业名称">
          <el-input v-model="searchName" placeholder="请输入企业名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadEnterprises">搜索</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table :data="enterprises" style="margin-top: 20px">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="企业名称" />
      <el-table-column prop="industry" label="行业" />
      <el-table-column prop="created_at" label="创建时间" />
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="loadEnterprises"
      style="margin-top: 20px; justify-content: center"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const searchName = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const enterprises = ref([])

const loadEnterprises = async () => {
  const { data, total: t } = await request.get('/enterprises', {
    params: { name: searchName.value, page: page.value, page_size: pageSize.value }
  })
  enterprises.value = data
  total.value = t
}

onMounted(loadEnterprises)
</script>

<style scoped>
.home { padding: 20px; }
</style>
