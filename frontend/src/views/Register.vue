<template>
  <div class="register-page">
    <div class="register-card">
      <div class="register-header">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo-icon" aria-hidden="true">
          <rect x="3" y="12" width="4" height="8" rx="1" fill="#1a73e8" />
          <rect x="10" y="8" width="4" height="12" rx="1" fill="#63a4ff" />
          <rect x="17" y="5" width="4" height="15" rx="1" fill="#8ab4f8" />
        </svg>
        <h1 class="register-title">{{ t('auth.register.title') }}</h1>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="0"
        class="register-form"
        @submit.prevent="handleRegister"
      >
        <el-form-item prop="email">
          <el-input
            v-model="form.email"
            :placeholder="t('auth.register.form.emailPlaceholder')"
            :prefix-icon="Message"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="t('auth.register.form.passwordPlaceholder')"
            :prefix-icon="Lock"
            size="large"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            :placeholder="t('auth.register.form.confirmPasswordPlaceholder')"
            :prefix-icon="Lock"
            size="large"
            show-password
            clearable
            @keyup.enter="handleRegister"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="register-button"
            @click="handleRegister"
          >
            {{ t('auth.register.action.submit') }}
          </el-button>
        </el-form-item>

        <div class="auth-link-row">
          <span>{{ t('auth.register.link.hasAccount') }}</span>
          <router-link class="auth-link" to="/login">{{ t('auth.register.link.backToLogin') }}</router-link>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, Message } from '@element-plus/icons-vue'
import request from '../utils/request'

const { t } = useI18n()
const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  email: '',
  password: '',
  confirmPassword: ''
})

const rules = computed<FormRules>(() => ({
  email: [
    { required: true, message: t('auth.register.validation.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('auth.register.validation.emailInvalid'), trigger: ['blur', 'change'] }
  ],
  password: [
    { required: true, message: t('auth.register.validation.passwordRequired'), trigger: 'blur' },
    { min: 6, message: t('auth.register.validation.passwordMin'), trigger: ['blur', 'change'] }
  ],
  confirmPassword: [
    { required: true, message: t('auth.register.validation.confirmPasswordRequired'), trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!value) {
          callback(new Error(t('auth.register.validation.confirmPasswordRequired')))
          return
        }

        if (value !== form.password) {
          callback(new Error(t('auth.register.validation.passwordMismatch')))
          return
        }

        callback()
      },
      trigger: ['blur', 'change']
    }
  ]
}))

type RegisterPayload = {
  success?: boolean
  message?: string
  data?: {
    success?: boolean
    message?: string
  }
}

const getErrorMessage = (error: unknown): string => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return t('auth.register.toast.networkError')
  }

  const response = (error as { response?: { data?: { message?: string } } }).response
  return response?.data?.message || t('auth.register.toast.networkError')
}

const normalizeRegisterPayload = (value: unknown): RegisterPayload => {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const payload = value as RegisterPayload
  if (typeof payload.success === 'boolean') {
    return payload
  }

  if (payload.data && typeof payload.data.success === 'boolean') {
    return payload.data
  }

  return payload
}

const handleRegister = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  try {
    loading.value = true
    const res = await request.post('/auth/register', {
      email: form.email,
      password: form.password
    })
    const payload = normalizeRegisterPayload(res)
    const isSuccess = payload.success !== false

    if (isSuccess) {
      sessionStorage.setItem('session_active', '1')
      ElMessage.success(payload.message || t('auth.register.toast.success'))
      const redirect = (router.currentRoute.value.query.redirect as string) || '/'
      router.replace(redirect === '/login' || redirect === '/register' ? '/' : redirect)
      return
    }

    ElMessage.error(payload.message || t('auth.register.toast.failed'))
  } catch (error) {
    sessionStorage.removeItem('session_active')
    ElMessage.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f0fe 0%, #f0f2f5 100%);
  padding: 1.25rem;
}

.register-card {
  width: 100%;
  max-width: 400px;
  padding: 2.5rem 2.25rem 2rem;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.register-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 32px;
}

.logo-icon {
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
}

.register-title {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  margin: 0;
}

.register-form :deep(.el-input__wrapper) {
  border-radius: 8px;
}

.register-button {
  width: 100%;
  min-height: 2.75rem;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
}

.auth-link-row {
  margin-top: 4px;
  text-align: center;
  font-size: 14px;
  color: #606266;
}

.auth-link {
  margin-left: 6px;
  color: #1a73e8;
  text-decoration: none;
}

.auth-link:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  .register-card {
    padding: 2rem 1.5rem 1.5rem;
  }

  .register-title {
    font-size: 20px;
  }
}
</style>
