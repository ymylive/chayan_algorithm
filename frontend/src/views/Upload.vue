<template>
  <div class="upload-page">
    <div class="content-shell">
      <div class="section-title">
        <el-icon><upload-filled /></el-icon>
        <h2>数据上传</h2>
      </div>

      <el-card shadow="hover" class="upload-card">
        <div class="upload-area">
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
            class="upload-component"
          >
            <el-icon class="upload-icon"><upload-filled /></el-icon>
            <div class="upload-text">将文件拖拽到此处，或 <em>点击上传</em></div>
          </el-upload>

          <div class="upload-tip">
            <span>支持以下文件格式：</span>
            <el-tag size="small">.csv</el-tag>
            <el-tag size="small" type="success">.xlsx</el-tag>
            <el-tag size="small" type="warning">.json</el-tag>
          </div>
        </div>

        <div class="upload-actions">
          <div class="action-buttons">
            <el-button type="primary" :disabled="fileList.length === 0" @click="submitUpload">开始上传</el-button>
            <el-button v-if="uploadComplete" @click="resetUpload">重新上传</el-button>
          </div>
        </div>
      </el-card>

      <el-card v-if="uploading" shadow="never" class="progress-card">
        <el-progress :percentage="uploadProgress" striped striped-flow />
      </el-card>

      <el-card v-if="previewData.length > 0" shadow="hover" class="preview-card">
        <template #header>
          <div class="preview-header">
            <span>数据预览</span>
            <span class="preview-count">显示前 10 条记录</span>
          </div>
        </template>
        <div class="preview-table-wrap">
          <el-table :data="previewData" border stripe class="preview-table">
            <el-table-column v-for="col in previewColumns" :key="col" :prop="col" :label="col" />
          </el-table>
        </div>
      </el-card>
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

  const preview = Array.isArray(response?.preview)
    ? response.preview
    : (Array.isArray(response?.data?.preview) ? response.data.preview : [])
  const rows = preview.length > 0
    ? preview
    : (Array.isArray(response?.data) ? response.data : [])

  if (rows.length > 0) {
    previewData.value = rows.slice(0, 10)
    previewColumns.value = Object.keys(rows[0])
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
.upload-page {
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

.upload-card,
.progress-card,
.preview-card {
  border-radius: 8px;
  margin-bottom: 0;
}

.upload-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.upload-area {
  border: 2px dashed #d9d9d9;
  border-radius: 12px;
  padding: 36px 40px;
  text-align: center;
  transition: border-color 0.3s ease, background-color 0.3s ease;
}

.upload-area:hover {
  border-color: #1a73e8;
  background: #f0f5ff;
}

.upload-component {
  width: 100%;
}

.upload-component :deep(.el-upload) {
  width: 100%;
}

.upload-component :deep(.el-upload-dragger) {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
}

.upload-icon {
  font-size: 48px;
  color: #1a73e8;
  margin-bottom: 16px;
}

.upload-text {
  color: #606266;
  font-size: 16px;
}

.upload-text em {
  color: #1a73e8;
  font-style: normal;
  font-weight: 600;
}

.upload-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  color: #909399;
  flex-wrap: wrap;
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
}

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.action-buttons :deep(.el-button) {
  min-width: 108px;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  color: #303133;
}

.preview-count {
  color: #909399;
  font-size: 13px;
}

.preview-table {
  min-width: 720px;
  border-radius: 8px;
  overflow: hidden;
}

.preview-table-wrap {
  width: 100%;
  overflow-x: auto;
}

@media (max-width: 992px) {
  .upload-page {
    padding: 20px 16px;
  }

  .content-shell {
    width: min(100%, 920px);
    gap: 18px;
  }

  .upload-card :deep(.el-card__body) {
    gap: 18px;
  }

  .upload-area {
    padding: 28px 24px;
  }
}

@media (max-width: 768px) {
  .upload-page {
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

  .upload-area {
    padding: 18px 14px;
  }

  .upload-icon {
    font-size: 36px;
    margin-bottom: 10px;
  }

  .upload-text {
    font-size: 14px;
    line-height: 1.6;
  }

  .upload-tip {
    margin-top: 12px;
    gap: 6px;
  }

  .upload-actions {
    justify-content: stretch;
  }

  .action-buttons {
    width: 100%;
    justify-content: stretch;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .action-buttons :deep(.el-button) {
    width: 100%;
    margin-left: 0 !important;
  }

  .preview-header {
    align-items: flex-start;
    row-gap: 6px;
  }

  .preview-count {
    font-size: 12px;
  }

  .preview-table {
    min-width: 640px;
  }
}
</style>
