<template>
  <el-container class="main-layout">
    <AppSidebar
      app-name="ChaYan Analytics"
      :is-mobile="isMobile"
      :mobile-open="mobileMenuOpen"
      :collapsed="isCollapsed"
      @update:mobileOpen="mobileMenuOpen = $event"
      @navigate="handleMenuNavigate"
      @toggle-collapse="toggleSidebar"
    />

    <el-container class="layout-main">
      <AppTopbar
        :title="currentPageName"
        :subtitle="topbarSubtitle"
        :is-mobile="isMobile"
        :mobile-menu-open="mobileMenuOpen"
        @toggle-menu="toggleMobileMenu"
        @logout="handleLogout"
      >
        <template #right>
          <span class="avatar-placeholder" aria-hidden="true">A</span>
          <span class="user-name">Admin</span>
          <button type="button" class="logout-button" @click="handleLogout">Logout</button>
        </template>
      </AppTopbar>

      <el-main class="content-area">
        <router-view v-slot="{ Component }">
          <Suspense>
            <component :is="Component" />
            <template #fallback>
              <div class="route-skeleton">
                <AppSkeleton variant="title" width="220px" />
                <AppSkeleton variant="text" :lines="4" />
                <AppSkeleton variant="rect" height="180px" />
              </div>
            </template>
          </Suspense>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/layout/AppSidebar.vue'
import AppTopbar from '../components/layout/AppTopbar.vue'
import AppSkeleton from '../components/feedback/AppSkeleton.vue'
import request from '../utils/request'

const MOBILE_BREAKPOINT = 992
const SIDEBAR_COLLAPSED_KEY = 'layout_sidebar_collapsed'

const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false)
const mobileMenuOpen = ref(false)
const isCollapsed = ref(false)
const route = useRoute()
const router = useRouter()

if (typeof window !== 'undefined') {
  isCollapsed.value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

const pageNameMap: Record<string, string> = {
  '/': 'Overview',
  '/upload': 'Data Upload',
  '/analysis': 'Analysis',
  '/recommendations': 'Recommendations',
  '/ai-analyze': 'AI Analyze',
  '/ai-settings': 'AI Settings',
  '/deep-research': 'Deep Research'
}

const currentPageName = computed(() => {
  const exactMatch = pageNameMap[route.path]
  if (exactMatch) return exactMatch

  const partialMatch = Object.entries(pageNameMap).find(([path]) => route.path.startsWith(`${path}/`))
  return partialMatch?.[1] ?? 'Workspace'
})

const topbarSubtitle = computed(() => 'LLM Multi-Dimensional Enterprise Intelligence')

const updateIsMobile = () => {
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT
  if (!isMobile.value) {
    mobileMenuOpen.value = false
    return
  }
  isCollapsed.value = false
}

const toggleSidebar = () => {
  if (isMobile.value) return
  isCollapsed.value = !isCollapsed.value
}

const toggleMobileMenu = () => {
  if (!isMobile.value) return
  mobileMenuOpen.value = !mobileMenuOpen.value
}

const handleMenuNavigate = () => {
  if (isMobile.value) {
    mobileMenuOpen.value = false
  }
}

const handleLogout = async () => {
  try {
    await request.post('/auth/logout', null, {
      headers: { 'X-Skip-Global-Loading': '1' }
    })
  } catch {
  } finally {
    sessionStorage.removeItem('session_active')
    localStorage.removeItem('token')
    await router.replace('/login')
  }
}

watch(
  () => route.path,
  () => {
    if (isMobile.value) {
      mobileMenuOpen.value = false
    }
  }
)

watch(isCollapsed, value => {
  if (typeof window === 'undefined') return
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0')
})

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
  background: #f8fafc;
  position: relative;
}

.layout-main {
  min-width: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.content-area {
  background: #f8fafc;
  padding: 20px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.route-skeleton {
  display: grid;
  gap: 14px;
  max-width: 1120px;
}

.mobile-menu-trigger {
  width: 36px;
  height: 36px;
}

.avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.user-name {
  color: #334155;
  font-size: 13px;
  font-weight: 500;
}

.logout-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
}

.logout-button:hover {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fef2f2;
}

@media (max-width: 992px) {
  .content-area {
    padding: 12px;
  }

  .user-name {
    display: none;
  }
}
</style>
