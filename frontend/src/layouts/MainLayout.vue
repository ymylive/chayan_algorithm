<template>
  <el-container class="main-layout">
    <AppSidebar
      :app-name="t('layout.appName')"
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
          <div class="locale-switch" role="group" :aria-label="t('layout.language')">
            <button
              v-for="item in localeOptions"
              :key="item.value"
              type="button"
              class="locale-button"
              :class="{ 'is-active': currentLocale === item.value }"
              @click="setLocale(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
          <span class="avatar-placeholder" aria-hidden="true">A</span>
          <span class="user-name">{{ t('layout.user') }}</span>
          <button type="button" class="logout-button" @click="handleLogout">{{ t('layout.logout') }}</button>
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
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/layout/AppSidebar.vue'
import AppTopbar from '../components/layout/AppTopbar.vue'
import AppSkeleton from '../components/feedback/AppSkeleton.vue'
import request from '../utils/request'
import { getSupportedLocales, persistLocale } from '../i18n'

const MOBILE_BREAKPOINT = 992
const SIDEBAR_COLLAPSED_KEY = 'layout_sidebar_collapsed'

const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false)
const mobileMenuOpen = ref(false)
const isCollapsed = ref(false)
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const localeOptions = computed(() => getSupportedLocales().map((item) => ({
  value: item,
  label: item === 'en-US' ? t('layout.en') : t('layout.zh')
})))
const currentLocale = computed(() => String(locale.value || 'zh-CN'))

if (typeof window !== 'undefined') {
  isCollapsed.value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

const currentPageName = computed(() => {
  const titleKey = String(route.meta?.titleKey || 'layout.workspace').trim()
  return titleKey ? t(titleKey) : t('layout.workspace')
})

const topbarSubtitle = computed(() => t('layout.subtitle'))

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

const setLocale = (nextLocale: string) => {
  if (nextLocale !== 'zh-CN' && nextLocale !== 'en-US') return
  locale.value = nextLocale
  persistLocale(nextLocale)
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

.locale-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
}

.locale-button {
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #475569;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease;
}

.locale-button.is-active {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}

.locale-button:hover {
  border-color: #cbd5e1;
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

  .locale-switch {
    padding: 2px;
    gap: 4px;
  }

  .locale-button {
    min-height: 32px;
    padding: 0 8px;
    font-size: 11px;
  }

  .user-name {
    display: none;
  }
}
</style>
