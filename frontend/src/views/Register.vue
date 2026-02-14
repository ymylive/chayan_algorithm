<template>
  <div class="register-page">
    <div class="register-card">
      <div class="register-header">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo-icon" aria-hidden="true">
          <rect x="3" y="12" width="4" height="8" rx="1" fill="#1a73e8" />
          <rect x="10" y="8" width="4" height="12" rx="1" fill="#63a4ff" />
          <rect x="17" y="5" width="4" height="15" rx="1" fill="#8ab4f8" />
        </svg>
        <h1 class="register-title">创建账号</h1>
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
            placeholder="邮箱"
            :prefix-icon="Message"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码（至少 6 位）"
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
            placeholder="确认密码"
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
            注册
          </el-button>
        </el-form-item>

        <div class="auth-link-row">
          <span>已有账号？</span>
          <router-link class="auth-link" to="/login">返回登录</router-link>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, Message } from '@element-plus/icons-vue'
import request from '../utils/request'

const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  email: '',
  password: '',
  confirmPassword: ''
})

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效邮箱地址', trigger: ['blur', 'change'] }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: ['blur', 'change'] }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!value) {
          callback(new Error('请再次输入密码'))
          return
        }

        if (value !== form.password) {
          callback(new Error('两次输入的密码不一致'))
          return
        }

        callback()
      },
      trigger: ['blur', 'change']
    }
  ]
}

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
    return '注册失败，请检查网络连接'
  }

  const response = (error as { response?: { data?: { message?: string } } }).response
  return response?.data?.message || '注册失败，请检查网络连接'
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
      ElMessage.success(payload.message || '注册成功')
      const redirect = (router.currentRoute.value.query.redirect as string) || '/'
      router.replace(redirect === '/login' || redirect === '/register' ? '/' : redirect)
      return
    }

    ElMessage.error(payload.message || '注册失败')
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
