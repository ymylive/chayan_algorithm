<template>
  <div class="ai-settings-page">
    <div class="content-shell">
      <div class="section-title">
        <el-icon><Setting /></el-icon>
        <span>{{ t('aiSettings.header.title') }}</span>
      </div>

      <el-card class="settings-card">
        <el-form label-width="140px" :model="form" class="settings-form">
          <div class="group-grid">
            <div class="settings-group">
              <div class="group-title">{{ t('aiSettings.groups.primary') }}</div>

              <el-form-item :label="t('aiSettings.field.apiEndpoint')">
                <el-input v-model="form.apiEndpoint" :placeholder="t('aiSettings.placeholder.apiEndpoint')" clearable />
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.apiKey')">
                <el-input
                  v-model="form.apiKey"
                  type="password"
                  show-password
                  :placeholder="t('aiSettings.placeholder.apiKey')"
                  clearable
                />
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.model')">
                <el-input v-model="form.model" :placeholder="t('aiSettings.placeholder.model')" clearable />
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.protocol')">
                <el-select v-model="form.protocol" class="full-width" :placeholder="t('aiSettings.placeholder.selectProtocol')">
                  <el-option
                    v-for="item in protocolOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </div>

            <div class="settings-group">
              <div class="group-title">{{ t('aiSettings.groups.fallback') }}</div>

              <el-form-item :label="t('aiSettings.field.fallbackModel')">
                <el-input v-model="form.fallbackModel" :placeholder="t('aiSettings.placeholder.fallbackModel')" clearable />
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.modelFallbacks')">
                <el-input
                  v-model="form.modelFallbacks"
                  type="textarea"
                  :rows="3"
                  :placeholder="t('aiSettings.placeholder.modelFallbacks')"
                />
              </el-form-item>
            </div>
          </div>

          <div class="group-grid">
            <div class="settings-group">
              <div class="group-title">{{ t('aiSettings.groups.secondary') }}</div>

              <el-form-item :label="t('aiSettings.field.secondaryApiEndpoint')">
                <el-input v-model="form.secondaryApiEndpoint" :placeholder="t('aiSettings.placeholder.secondaryApiEndpoint')" clearable />
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.secondaryProtocol')">
                <el-select v-model="form.secondaryProtocol" class="full-width" :placeholder="t('aiSettings.placeholder.selectProtocol')">
                  <el-option
                    v-for="item in protocolOptions"
                    :key="`secondary-${item.value}`"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.secondaryApiKey')">
                <el-input
                  v-model="form.secondaryApiKey"
                  type="password"
                  show-password
                  :placeholder="t('aiSettings.placeholder.secondaryApiKey')"
                  clearable
                />
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.secondaryModel')">
                <el-input v-model="form.secondaryModel" :placeholder="t('aiSettings.placeholder.secondaryModel')" clearable />
              </el-form-item>
            </div>

            <div class="settings-group">
              <div class="group-title">{{ t('aiSettings.groups.tertiary') }}</div>

              <el-form-item :label="t('aiSettings.field.tertiaryApiEndpoint')">
                <el-input v-model="form.tertiaryApiEndpoint" :placeholder="t('aiSettings.placeholder.tertiaryApiEndpoint')" clearable />
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.tertiaryProtocol')">
                <el-select v-model="form.tertiaryProtocol" class="full-width" :placeholder="t('aiSettings.placeholder.selectProtocol')">
                  <el-option
                    v-for="item in protocolOptions"
                    :key="`tertiary-${item.value}`"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.tertiaryApiKey')">
                <el-input
                  v-model="form.tertiaryApiKey"
                  type="password"
                  show-password
                  :placeholder="t('aiSettings.placeholder.tertiaryApiKey')"
                  clearable
                />
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.tertiaryModel')">
                <el-input v-model="form.tertiaryModel" :placeholder="t('aiSettings.placeholder.tertiaryModel')" clearable />
              </el-form-item>
            </div>

            <div class="settings-group">
              <div class="group-title">{{ t('aiSettings.groups.model') }}</div>

              <el-form-item :label="t('aiSettings.field.temperature')">
                <div class="slider-row">
                  <el-slider
                    v-model="form.temperature"
                    :min="0"
                    :max="2"
                    :step="0.1"
                    :marks="temperatureMarks"
                  />
                  <span class="slider-value">{{ form.temperature.toFixed(1) }}</span>
                </div>
              </el-form-item>

              <el-form-item :label="t('aiSettings.field.maxTokens')">
                <el-input-number v-model="form.maxTokens" :min="64" :max="8192" :step="64" />
              </el-form-item>
            </div>
          </div>

          <el-form-item class="action-row">
            <el-button type="primary" @click="saveSettings">{{ t('aiSettings.actions.save') }}</el-button>
            <el-button plain @click="resetSettings">{{ t('aiSettings.actions.reset') }}</el-button>
          </el-form-item>
        </el-form>

        <div class="help-tip">{{ t('aiSettings.helpTip') }}</div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import request from '../utils/request'

const SECRET_MASK = '********'
const PROTOCOLS = ['chat_completions', 'responses'] as const
const { t } = useI18n()

type ProtocolType = (typeof PROTOCOLS)[number]

type AISettings = {
  apiEndpoint: string
  apiKey: string
  model: string
  protocol: ProtocolType
  fallbackModel: string
  modelFallbacks: string
  secondaryApiEndpoint: string
  secondaryProtocol: ProtocolType
  secondaryApiKey: string
  secondaryModel: string
  tertiaryApiEndpoint: string
  tertiaryProtocol: ProtocolType
  tertiaryApiKey: string
  tertiaryModel: string
  temperature: number
  maxTokens: number
}

type AISettingsPayload = Partial<AISettings> & {
  modelFallbacks?: string | string[]
}

const defaultSettings: AISettings = {
  apiEndpoint: 'https://gmn.chuangzuoli.com/v1',
  apiKey: '',
  model: 'gpt-5.2',
  protocol: 'responses',
  fallbackModel: 'gpt-5.2',
  modelFallbacks: '',
  secondaryApiEndpoint: 'https://api-inference.modelscope.cn/v1',
  secondaryProtocol: 'chat_completions',
  secondaryApiKey: '',
  secondaryModel: 'ZhipuAI/GLM-5',
  tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
  tertiaryProtocol: 'chat_completions',
  tertiaryApiKey: '',
  tertiaryModel: 'deepseek/deepseek-r1-0528:free',
  temperature: 0.35,
  maxTokens: 1400,
}

const form = reactive<AISettings>({ ...defaultSettings })
const protocolOptions = computed(() => ([
  { label: t('aiSettings.protocol.responses'), value: 'responses' as ProtocolType },
  { label: t('aiSettings.protocol.chatCompletions'), value: 'chat_completions' as ProtocolType }
]))
const temperatureMarks = computed(() => ({
  0: t('aiSettings.temperatureMarks.low'),
  1: t('aiSettings.temperatureMarks.mid'),
  2: t('aiSettings.temperatureMarks.high')
}))

const normalizeModelFallbacks = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(', ')
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ')
  }
  return ''
}

const normalizeProtocol = (value: unknown): ProtocolType => {
  if (value === 'responses') {
    return 'responses'
  }
  return 'chat_completions'
}

const sanitizeSecretWrite = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed || trimmed === SECRET_MASK) {
    return ''
  }
  return trimmed
}

const applySettings = (settings: AISettingsPayload | undefined) => {
  Object.assign(form, {
    apiEndpoint: settings?.apiEndpoint || defaultSettings.apiEndpoint,
    apiKey: settings?.apiKey || '',
    model: settings?.model || defaultSettings.model,
    protocol: normalizeProtocol(settings?.protocol),
    fallbackModel: settings?.fallbackModel || '',
    modelFallbacks: normalizeModelFallbacks(settings?.modelFallbacks),
    secondaryApiEndpoint: settings?.secondaryApiEndpoint || '',
    secondaryProtocol: normalizeProtocol(settings?.secondaryProtocol),
    secondaryApiKey: settings?.secondaryApiKey || '',
    secondaryModel: settings?.secondaryModel || '',
    tertiaryApiEndpoint: settings?.tertiaryApiEndpoint || '',
    tertiaryProtocol: normalizeProtocol(settings?.tertiaryProtocol),
    tertiaryApiKey: settings?.tertiaryApiKey || '',
    tertiaryModel: settings?.tertiaryModel || '',
    temperature: typeof settings?.temperature === 'number' ? settings.temperature : defaultSettings.temperature,
    maxTokens: typeof settings?.maxTokens === 'number' ? settings.maxTokens : defaultSettings.maxTokens,
  })
}

const validateForm = () => {
  if (!form.apiEndpoint.trim()) {
    ElMessage.warning(t('aiSettings.validate.apiEndpointRequired'))
    return false
  }

  if (!form.model.trim()) {
    ElMessage.warning(t('aiSettings.validate.modelRequired'))
    return false
  }

  if (!PROTOCOLS.includes(form.protocol)) {
    ElMessage.warning(t('aiSettings.validate.protocolInvalid'))
    return false
  }

  const hasSecondary = Boolean(
    form.secondaryApiEndpoint.trim() || form.secondaryApiKey.trim() || form.secondaryModel.trim()
  )
  if (hasSecondary) {
    if (!form.secondaryApiEndpoint.trim()) {
      ElMessage.warning(t('aiSettings.validate.secondaryApiEndpointRequired'))
      return false
    }
    if (!form.secondaryModel.trim()) {
      ElMessage.warning(t('aiSettings.validate.secondaryModelRequired'))
      return false
    }
    if (!PROTOCOLS.includes(form.secondaryProtocol)) {
      ElMessage.warning(t('aiSettings.validate.secondaryProtocolInvalid'))
      return false
    }
  }

  const hasTertiary = Boolean(
    form.tertiaryApiEndpoint.trim() || form.tertiaryApiKey.trim() || form.tertiaryModel.trim()
  )
  if (hasTertiary) {
    if (!form.tertiaryApiEndpoint.trim()) {
      ElMessage.warning(t('aiSettings.validate.tertiaryApiEndpointRequired'))
      return false
    }
    if (!form.tertiaryModel.trim()) {
      ElMessage.warning(t('aiSettings.validate.tertiaryModelRequired'))
      return false
    }
    if (!PROTOCOLS.includes(form.tertiaryProtocol)) {
      ElMessage.warning(t('aiSettings.validate.tertiaryProtocolInvalid'))
      return false
    }
  }

  return true
}

const loadSettings = async () => {
  try {
    const res = await request.get('/settings/ai')
    const payload = (res?.data ?? res) as { data?: AISettingsPayload }
    applySettings(payload?.data)
  } catch {
    applySettings(defaultSettings)
    ElMessage.warning(t('aiSettings.toasts.loadFailed'))
  }
}

const saveSettings = async () => {
  if (!validateForm()) {
    return
  }

  try {
    await request.post('/settings/ai', {
      apiEndpoint: form.apiEndpoint.trim(),
      apiKey: sanitizeSecretWrite(form.apiKey),
      model: form.model.trim(),
      protocol: form.protocol,
      fallbackModel: form.fallbackModel.trim(),
      modelFallbacks: form.modelFallbacks,
      secondaryApiEndpoint: form.secondaryApiEndpoint.trim(),
      secondaryProtocol: form.secondaryProtocol,
      secondaryApiKey: sanitizeSecretWrite(form.secondaryApiKey),
      secondaryModel: form.secondaryModel.trim(),
      tertiaryApiEndpoint: form.tertiaryApiEndpoint.trim(),
      tertiaryProtocol: form.tertiaryProtocol,
      tertiaryApiKey: sanitizeSecretWrite(form.tertiaryApiKey),
      tertiaryModel: form.tertiaryModel.trim(),
      temperature: form.temperature,
      maxTokens: form.maxTokens,
    })

    ElMessage.success(t('aiSettings.toasts.saveSuccess'))
    if (form.apiKey) {
      form.apiKey = '********'
    }
    if (form.secondaryApiKey) {
      form.secondaryApiKey = SECRET_MASK
    }
    if (form.tertiaryApiKey) {
      form.tertiaryApiKey = SECRET_MASK
    }
  } catch {
    ElMessage.error(t('aiSettings.toasts.saveFailed'))
  }
}

const resetSettings = async () => {
  Object.assign(form, defaultSettings)

  try {
    await request.post('/settings/ai', {
      apiEndpoint: defaultSettings.apiEndpoint,
      apiKey: '',
      model: defaultSettings.model,
      protocol: defaultSettings.protocol,
      fallbackModel: defaultSettings.fallbackModel,
      modelFallbacks: defaultSettings.modelFallbacks,
      secondaryApiEndpoint: defaultSettings.secondaryApiEndpoint,
      secondaryProtocol: defaultSettings.secondaryProtocol,
      secondaryApiKey: '',
      secondaryModel: defaultSettings.secondaryModel,
      tertiaryApiEndpoint: defaultSettings.tertiaryApiEndpoint,
      tertiaryProtocol: defaultSettings.tertiaryProtocol,
      tertiaryApiKey: '',
      tertiaryModel: defaultSettings.tertiaryModel,
      temperature: defaultSettings.temperature,
      maxTokens: defaultSettings.maxTokens,
    })

    ElMessage.success(t('aiSettings.toasts.resetSuccess'))
  } catch {
    ElMessage.error(t('aiSettings.toasts.resetFailed'))
  }
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
}

.settings-form {
  width: 100%;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.settings-group {
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 14px;
  background: #fff;
}

.group-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.full-width {
  width: 100%;
}

.slider-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.slider-value {
  min-width: 38px;
  text-align: right;
  color: #2563eb;
  font-weight: 600;
}

.action-row {
  margin-top: 8px;
}

.action-row :deep(.el-form-item__content) {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.help-tip {
  margin-top: 10px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 992px) {
  .ai-settings-page {
    padding: 16px;
  }

  .group-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .ai-settings-page {
    padding: 12px;
  }

  .section-title {
    font-size: 18px;
  }

  .settings-group {
    padding: 12px;
  }

  .settings-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    line-height: 1.4;
    padding-bottom: 6px;
  }

  .settings-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }

  .action-row :deep(.el-button) {
    min-height: 44px;
  }
}
</style>
