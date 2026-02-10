<template>
  <div class="upload-container">
    <h2>上传数据</h2>
    <el-upload
      ref="uploadRef"
      drag
      :action="uploadUrl"
      :accept="acceptTypes"
      :before-upload="beforeUpload"
      :on-success="handleSuccess"
      :on-error="handleError"
      :on-progress="handleProgress"
      :file-list="fileList"
      :auto-upload="false"
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">拖拽文件到此处或<em>点击上传</em></div>
      <template #tip>
        <div class="el-upload__tip">支持 .csv, .xlsx, .json 格式</div>
      </template>
    </el-upload>

    <el-button type="primary" @click="submitUpload" :disabled="fileList.length === 0" style="margin-top: 20px;">
      开始上传
    </el-button>
    <el-button @click="resetUpload" v-if="uploadComplete">重新上传</el-button>

    <el-progress v-if="uploading" :percentage="uploadProgress" style="margin-top: 20px;"></el-progress>

    <div v-if="previewData.length > 0" style="margin-top: 30px;">
      <h3>数据预览</h3>
      <el-table :data="previewData" border style="width: 100%">
        <el-table-column v-for="col in previewColumns" :key="col" :prop="col" :label="col"></el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'

const uploadUrl = '/api/upload'
const acceptTypes = '.csv,.xlsx,.json'
const uploadRef = ref()
const fileList = ref([])
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadComplete = ref(false)
const previewData = ref([])
const previewColumns = ref([])

const beforeUpload = (file) => {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
  if (!['.csv', '.xlsx', '.json'].includes(ext)) {
    ElMessage.error('只支持 .csv, .xlsx, .json 格式文件')
    return false
  }
  return true
}

const submitUpload = () => {
  uploadRef.value.submit()
  uploading.value = true
}

const handleProgress = (event) => {
  uploadProgress.value = Math.floor(event.percent)
}

const handleSuccess = (response) => {
  uploading.value = false
  uploadComplete.value = true
  ElMessage.success('上传成功')

  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    previewData.value = response.data.slice(0, 10)
    previewColumns.value = Object.keys(response.data[0])
  }
}

const handleError = () => {
  uploading.value = false
  ElMessage.error('上传失败，请重试')
}

const resetUpload = () => {
  uploadRef.value.clearFiles()
  fileList.value = []
  uploadComplete.value = false
  uploadProgress.value = 0
  previewData.value = []
  previewColumns.value = []
}
</script>

<style scoped>
.upload-container {
  padding: 20px;
}
</style>
