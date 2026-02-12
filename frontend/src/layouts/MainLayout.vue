<template>
  <el-container class="main-layout" :class="{ 'is-mobile': isMobile }">
    <el-aside class="sidebar" :class="{ 'is-mobile': isMobile, 'is-open': isMobile && mobileMenuOpen }" :style="sidebarStyle">
      <div class="sidebar-shell">
        <div class="logo-area">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo-icon" aria-hidden="true">
            <rect x="3" y="12" width="4" height="8" rx="1" fill="#1a73e8" />
            <rect x="10" y="8" width="4" height="12" rx="1" fill="#63a4ff" />
            <rect x="17" y="5" width="4" height="15" rx="1" fill="#8ab4f8" />
          </svg>
          <span v-if="!menuCollapsed" class="logo-text">茶研分析</span>
        </div>

        <el-menu
          class="sidebar-menu"
          :default-active="route.path"
          :collapse="menuCollapsed"
          :collapse-transition="false"
          router
          background-color="#001529"
          text-color="#ffffffb3"
          active-text-color="#fff"
          @select="handleMenuSelect"
        >
          <el-menu-item index="/">
            <el-icon><DataLine /></el-icon>
            <template #title>首页概览</template>
          </el-menu-item>
          <el-menu-item index="/upload">
            <el-icon><Upload /></el-icon>
            <template #title>数据上传</template>
          </el-menu-item>
          <el-menu-item index="/analysis">
            <el-icon><PieChart /></el-icon>
            <template #title>数据分析</template>
          </el-menu-item>
          <el-menu-item index="/recommendations">
            <el-icon><Promotion /></el-icon>
            <template #title>决策建议</template>
          </el-menu-item>
          <el-menu-item index="/ai-analyze">
            <el-icon><Cpu /></el-icon>
            <template #title>AI 分析</template>
          </el-menu-item>
          <el-menu-item index="/ai-settings">
            <el-icon><Setting /></el-icon>
            <template #title>AI 设置</template>
          </el-menu-item>
        </el-menu>

        <div v-if="!isMobile" class="collapse-trigger">
          <el-button class="collapse-button" text @click="toggleSidebar">
            <el-icon>
              <Fold v-if="!isCollapsed" />
              <Expand v-else />
            </el-icon>
            <span v-if="!isCollapsed">收起导航</span>
          </el-button>
        </div>
      </div>
    </el-aside>

    <transition name="mask-fade">
      <div v-if="isMobile && mobileMenuOpen" class="sidebar-mask" @click="closeMobileMenu" />
    </transition>

    <el-container class="layout-main">
      <el-header class="top-header">
        <div class="header-left">
          <el-button v-if="isMobile" class="mobile-menu-trigger" text @click="toggleMobileMenu">
            <el-icon>
              <Expand v-if="!mobileMenuOpen" />
              <Fold v-else />
            </el-icon>
          </el-button>

          <el-breadcrumb separator="/" class="header-breadcrumb">
            <el-breadcrumb-item>茶研分析系统</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentPageName }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-user">
          <span class="avatar-placeholder">
            <el-icon><User /></el-icon>
          </span>
          <span class="user-name">管理员</span>
        </div>
      </el-header>

      <el-main class="content-area">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Cpu,
  DataLine,
  Expand,
  Fold,
  PieChart,
  Promotion,
  Setting,
  Upload,
  User
} from '@element-plus/icons-vue'

const MOBILE_BREAKPOINT = 992

const isCollapsed = ref(false)
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false)
const mobileMenuOpen = ref(false)
const route = useRoute()

const menuCollapsed = computed(() => !isMobile.value && isCollapsed.value)

const sidebarStyle = computed(() => {
  if (isMobile.value) {
    return { width: '220px' }
  }

  return { width: isCollapsed.value ? '64px' : '220px' }
})

const pageNameMap: Record<string, string> = {
  '/': '首页概览',
  '/upload': '数据上传',
  '/analysis': '数据分析',
  '/recommendations': '决策建议',
  '/ai-analyze': 'AI 分析',
  '/ai-settings': 'AI 设置'
}

const currentPageName = computed(() => {
  const exactMatch = pageNameMap[route.path]
  if (exactMatch) {
    return exactMatch
  }

  const partialMatch = Object.entries(pageNameMap).find(([path]) => route.path.startsWith(`${path}/`))
  return partialMatch?.[1] ?? '页面'
})

const updateIsMobile = () => {
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT

  if (!isMobile.value) {
    mobileMenuOpen.value = false
  }
}

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
}

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

const closeMobileMenu = () => {
  mobileMenuOpen.value = false
}

const handleMenuSelect = () => {
  if (isMobile.value) {
    closeMobileMenu()
  }
}

watch(
  () => route.path,
  () => {
    if (isMobile.value) {
      closeMobileMenu()
    }
  }
)

onMounted(() => {
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile)
})
</script>

<style scoped>
.main-layout {
  height: 100vh;
  overflow: hidden;
  background: #f0f2f5;
  position: relative;
}

.sidebar {
  background: #001529;
  transition: width 0.24s ease, transform 0.24s ease, box-shadow 0.24s ease;
  overflow: hidden;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.18);
  z-index: 1201;
}

.sidebar-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.logo-area {
  height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.logo-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
}

.logo-text {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
}

:deep(.sidebar-menu .el-menu-item) {
  border-left: 3px solid transparent;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

:deep(.sidebar-menu .el-menu-item:hover) {
  background-color: rgba(255, 255, 255, 0.08) !important;
  color: #fff !important;
}

:deep(.sidebar-menu .el-menu-item.is-active) {
  border-left-color: #1a73e8;
  background-color: rgba(255, 255, 255, 0.14) !important;
  color: #fff !important;
}

:deep(.sidebar-menu .el-menu-item .el-icon) {
  font-size: 18px;
}

.collapse-trigger {
  padding: 10px 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.collapse-button {
  width: 100%;
  justify-content: flex-start;
  color: #ffffffd9;
}

.collapse-button:hover {
  color: #fff;
}

.layout-main {
  min-width: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  transition: padding 0.2s ease;
}

.top-header {
  height: 60px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-breadcrumb {
  min-width: 0;
}

:deep(.header-breadcrumb .el-breadcrumb__inner) {
  white-space: nowrap;
}

.mobile-menu-trigger {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #303133;
  border-radius: 8px;
}

.mobile-menu-trigger:hover {
  background: rgba(26, 115, 232, 0.08);
  color: #1a73e8;
}

.header-user {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #262626;
}

.avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #595959;
}

.user-name {
  font-size: 14px;
}

.content-area {
  background: #f0f2f5;
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sidebar-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
  z-index: 1200;
}

.mask-fade-enter-active,
.mask-fade-leave-active {
  transition: opacity 0.2s ease;
}

.mask-fade-enter-from,
.mask-fade-leave-to {
  opacity: 0;
}

@media (max-width: 992px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 220px !important;
    transform: translateX(-100%);
    box-shadow: none;
  }

  .sidebar.is-open {
    transform: translateX(0);
    box-shadow: 2px 0 16px rgba(0, 0, 0, 0.24);
  }

  .top-header {
    padding: 0 14px;
    height: 56px;
  }

  .user-name {
    display: none;
  }
}
</style>
