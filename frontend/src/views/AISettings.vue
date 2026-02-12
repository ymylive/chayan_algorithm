<template>
  <div class="ai-settings-page">
    <div class="content-shell">
      <div class="section-title">
        <el-icon><Setting /></el-icon>
        <span>AI 配置中心</span>
      </div>

      <el-card class="settings-card">
        <el-form label-width="140px" :model="form" class="settings-form">
          <div class="group-grid">
            <div class="settings-group">
              <div class="group-title">连接配置</div>
              <el-form-item label="AI API 地址">
                <el-input v-model="form.apiEndpoint" placeholder="https://openrouter.ai/api/v1" clearable />
              </el-form-item>

              <el-form-item label="API Key">
                <el-input v-model="form.apiKey" type="password" show-password placeholder="请输�?API Key" clearable />
              </el-form-item>

              <el-form-item label="模型名称">
                <el-input v-model="form.model" placeholder="tngtech/deepseek-r1t2-chimera:free" clearable />
              </el-form-item>
            </div>

            <div class="settings-group">
              <div class="group-title">模型参数</div>
              <el-form-item label="温度 Temperature">
                <div class="slider-row">
                  <el-slider
                    v-model="form.temperature"
                    :min="0"
                    :max="2"
                    :step="0.1"
                    :marks="{ 0: '保守', 1: '平衡', 2: '创造' }"
                  />
                  <span class="slider-value">{{ form.temperature.toFixed(1) }}</span>
                </div>
              </el-form-item>

              <el-form-item label="最�?Tokens">
                <el-input-number v-model="form.maxTokens" :min="64" :max="8192" :step="64" />
              </el-form-item>
            </div>
          </div>

          <div class="settings-group">
            <div class="group-title">开发选项</div>
            <el-form-item label="启用 Mock">
              <el-switch v-model="form.useMock" />
            </el-form-item>
          </div>

          <el-form-item class="action-row">
            <el-button type="primary" @click="saveSettings">保存设置</el-button>
            <el-button plain @click="resetSettings">恢复默认</el-button>
          </el-form-item>
        </el-form>

        <div class="help-tip">配置将保存到后端服务端存储中</div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import request from '../utils/request'

type AISettings = {
  apiEndpoint: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  useMock: boolean
}

const defaultSettings: AISettings = {
  apiEndpoint: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: 'tngtech/deepseek-r1t2-chimera:free',
  temperature: 0.7,
  maxTokens: 2048,
  useMock: true,
}

const form = reactive<AISettings>({ ...defaultSettings })

const applySettings = (settings: Partial<AISettings> | undefined) => {
  Object.assign(form, {
    apiEndpoint: settings?.apiEndpoint || defaultSettings.apiEndpoint,
    apiKey: settings?.apiKey || '',
    model: settings?.model || defaultSettings.model,
    temperature: typeof settings?.temperature === 'number' ? settings.temperature : defaultSettings.temperature,
    maxTokens: typeof settings?.maxTokens === 'number' ? settings.maxTokens : defaultSettings.maxTokens,
    useMock: typeof settings?.useMock === 'boolean' ? settings.useMock : defaultSettings.useMock,
  })
}

const loadSettings = async () => {
  try {
    const res = await request.get('/settings/ai')
    const payload = (res?.data ?? res) as { data?: Partial<AISettings> }
    applySettings(payload?.data)
  } catch {
    applySettings(defaultSettings)
    ElMessage.warning('Failed to load AI settings, using defaults')
  }
}

const saveSettings = () => {
  if (!form.apiEndpoint) {
    ElMessage.warning('请先填写 AI API 地址')
    return
  }

  request.post('/settings/ai', {
    apiEndpoint: form.apiEndpoint,
    apiKey: form.apiKey,
    model: form.model,
    temperature: form.temperature,
    maxTokens: form.maxTokens,
    useMock: form.useMock,
  }).then(() => {
    ElMessage.success('AI settings saved')
    if (form.apiKey) {
      form.apiKey = '********'
    }
  }).catch(() => {
    ElMessage.error('保存 AI 设置失败')
  })
}

const resetSettings = () => {
  Object.assign(form, defaultSettings)
  request.post('/settings/ai', {
    apiEndpoint: defaultSettings.apiEndpoint,
    apiKey: '',
    model: defaultSettings.model,
    temperature: defaultSettings.temperature,
    maxTokens: defaultSettings.maxTokens,
    useMock: defaultSettings.useMock,
  }).then(() => {
    ElMessage.success('Defaults restored')
  }).catch(() => {
    ElMessage.error('恢复默认设置失败')
  })
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.ai-settings-page {
  padding: 24px;
}

.content-shell {
  max-width: 1080px;
  margin: 0 auto;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  font-size: 20px;
  font-weight: 700;
  color: #303133;
}

.settings-card {
  border-radius: 10px;
  max-width: 980px;
}

.settings-card :deep(.el-card__body) {
  padding: 24px 26px 20px;
}

.settings-form {
  max-width: 920px;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.settings-group {
  margin-bottom: 24px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 16px;
  padding-left: 10px;
  border-left: 3px solid #1a73e8;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-width: 0;
}

.slider-row :deep(.el-slider) {
  flex: 1;
  min-width: 0;
}

.slider-value {
  min-width: 44px;
  flex: 0 0 auto;
  text-align: right;
  color: #303133;
  font-weight: 500;
}

.settings-form :deep(.el-input-number) {
  width: 100%;
  max-width: 240px;
}

.action-row :deep(.el-form-item__content) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.help-tip {
  margin-top: 10px;
  color: #909399;
  font-size: 13px;
}

@media (max-width: 992px) {
  .ai-settings-page {
    padding: 18px;
  }

  .settings-card {
    max-width: 100%;
  }

  .settings-card :deep(.el-card__body) {
    padding: 20px;
  }

  .settings-form {
    max-width: 100%;
  }

  .group-grid {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .settings-group {
    margin-bottom: 20px;
  }

  .settings-form :deep(.el-form-item__label) {
    width: 128px !important;
  }

  .settings-form :deep(.el-input-number) {
    max-width: 100%;
  }
}

@media (max-width: 768px) {
  .ai-settings-page {
    padding: 12px;
  }

  .section-title {
    font-size: 18px;
    margin-bottom: 14px;
  }

  .settings-card :deep(.el-card__body) {
    padding: 16px 14px;
  }

  .settings-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    line-height: 1.4;
    padding-bottom: 6px;
  }

  .settings-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
    min-width: 0;
  }

  .slider-row {
    gap: 10px;
  }

  .slider-value {
    min-width: 36px;
    font-size: 13px;
  }

  .action-row {
    margin-top: 6px;
  }

  .action-row :deep(.el-form-item__content) {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .action-row :deep(.el-button) {
    width: 100%;
    margin-left: 0 !important;
  }
}
</style>

