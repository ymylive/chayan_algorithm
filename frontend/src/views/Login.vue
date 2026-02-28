<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo-icon" aria-hidden="true">
          <rect x="3" y="12" width="4" height="8" rx="1" fill="#1a73e8" />
          <rect x="10" y="8" width="4" height="12" rx="1" fill="#63a4ff" />
          <rect x="17" y="5" width="4" height="15" rx="1" fill="#8ab4f8" />
        </svg>
        <h1 class="login-title">{{ t('auth.login.title') }}</h1>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="0"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            :placeholder="t('auth.login.form.usernamePlaceholder')"
            :prefix-icon="User"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="t('auth.login.form.passwordPlaceholder')"
            :prefix-icon="Lock"
            size="large"
            show-password
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-button"
            @click="handleLogin"
          >
            {{ t('auth.login.action.submit') }}
          </el-button>
        </el-form-item>

        <div class="auth-link-row">
          <span>{{ t('auth.login.link.noAccount') }}</span>
          <router-link class="auth-link" to="/register">{{ t('auth.login.link.goRegister') }}</router-link>
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
import { Lock, User } from '@element-plus/icons-vue'
import request from '../utils/request'

const { t } = useI18n()
const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = computed<FormRules>(() => ({
  username: [{ required: true, message: t('auth.login.validation.usernameRequired'), trigger: 'blur' }],
  password: [{ required: true, message: t('auth.login.validation.passwordRequired'), trigger: 'blur' }]
}))

const getErrorMessage = (error: unknown): string => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return t('auth.login.toast.networkError')
  }

  const response = (error as { response?: { data?: { message?: string } } }).response
  return response?.data?.message || t('auth.login.toast.networkError')
}

type LoginPayload = {
  success?: boolean
  message?: string
  token?: string
  data?: {
    token?: string
  }
}

const toLoginPayload = (value: unknown): LoginPayload => {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as LoginPayload
}

const normalizeLoginPayload = (value: unknown): LoginPayload => {
  const top = toLoginPayload(value)
  if (typeof top.success === 'boolean') {
    return top
  }

  const nested = toLoginPayload(top.data)
  if (typeof nested.success === 'boolean') {
    return nested
  }

  if (nested.token) {
    return { ...nested, success: true }
  }

  if (top.token) {
    return { ...top, success: true }
  }

  return top
}

const handleLogin = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  try {
    loading.value = true
    const res = await request.post('/auth/login', {
      username: form.username,
      password: form.password
    })
    const payload = normalizeLoginPayload(res)

    const isSuccess = payload?.success === true

    if (isSuccess) {
      localStorage.removeItem('token')
      sessionStorage.setItem('session_active', '1')
      ElMessage.success(t('auth.login.toast.success'))
      const redirect = (router.currentRoute.value.query.redirect as string) || '/'
      router.replace(redirect)
    } else {
      sessionStorage.removeItem('session_active')
      ElMessage.error(payload?.message || t('auth.login.toast.failed'))
    }
  } catch (err: unknown) {
    sessionStorage.removeItem('session_active')
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Mobile adaptation: use relative card spacing and enforce 44px+ primary action area. */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f0fe 0%, #f0f2f5 100%);
  padding: 1.25rem;
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 2.5rem 2.25rem 2rem;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.login-header {
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

.login-title {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  margin: 0;
}

.login-form :deep(.el-input__wrapper) {
  border-radius: 8px;
}

.login-button {
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
  .login-card {
    padding: 2rem 1.5rem 1.5rem;
  }

  .login-title {
    font-size: 20px;
  }
}
</style>
