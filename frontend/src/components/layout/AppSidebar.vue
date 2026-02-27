<template>
  <aside
    class="app-sidebar"
    :class="{
      'is-collapsed': props.collapsed && !props.isMobile,
      'is-mobile': props.isMobile,
      'is-mobile-open': props.isMobile && props.mobileOpen
    }"
    :style="sidebarStyle"
    aria-label="Primary navigation"
  >
    <div class="sidebar-brand">
      <span class="brand-mark" aria-hidden="true" />
      <span v-if="!props.collapsed || props.isMobile" class="brand-text">{{ props.appName }}</span>
    </div>

    <nav class="sidebar-nav" aria-label="Main">
      <RouterLink
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ 'is-active': isActive(item.path) }"
        @click="handleNavigate(item.path)"
      >
        <span class="nav-bullet" aria-hidden="true" />
        <span v-if="!props.collapsed || props.isMobile" class="nav-label">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div v-if="!props.isMobile && props.showCollapseToggle" class="sidebar-footer">
      <button
        type="button"
        class="collapse-toggle"
        :aria-label="props.collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="emit('toggle-collapse')"
      >
        <span class="toggle-icon" aria-hidden="true">{{ props.collapsed ? '>' : '<' }}</span>
        <span v-if="!props.collapsed" class="toggle-label">Collapse</span>
      </button>
    </div>
  </aside>

  <Transition name="sidebar-mask">
    <button
      v-if="props.isMobile && props.mobileOpen"
      class="sidebar-mask"
      type="button"
      aria-label="Close navigation menu"
      @click="closeMobileMenu"
    />
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

interface SidebarMenuItem {
  path: string
  label: string
}

const props = withDefaults(
  defineProps<{
    appName?: string
    collapsed?: boolean
    isMobile?: boolean
    mobileOpen?: boolean
    width?: number
    collapsedWidth?: number
    showCollapseToggle?: boolean
  }>(),
  {
    appName: 'ChaYan Analytics',
    collapsed: false,
    isMobile: false,
    mobileOpen: false,
    width: 232,
    collapsedWidth: 72,
    showCollapseToggle: true
  }
)

const emit = defineEmits<{
  (e: 'navigate', path: string): void
  (e: 'update:mobileOpen', value: boolean): void
  (e: 'toggle-collapse'): void
}>()

const route = useRoute()

const menuItems: SidebarMenuItem[] = [
  { path: '/', label: 'Overview' },
  { path: '/upload', label: 'Upload' },
  { path: '/analysis', label: 'Analysis' },
  { path: '/recommendations', label: 'Recommendations' },
  { path: '/ai-analyze', label: 'AI Analyze' },
  { path: '/ai-settings', label: 'AI Settings' },
  { path: '/deep-research', label: 'Deep Research' }
]

const sidebarStyle = computed(() => {
  if (props.isMobile) {
    return { width: `${props.width}px` }
  }

  return { width: `${props.collapsed ? props.collapsedWidth : props.width}px` }
})

const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}

const handleNavigate = (path: string) => {
  emit('navigate', path)
  if (props.isMobile) {
    emit('update:mobileOpen', false)
  }
}

const closeMobileMenu = () => {
  emit('update:mobileOpen', false)
}
</script>

<style scoped>
.app-sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: linear-gradient(180deg, #0f172a 0%, #111b33 100%);
  border-right: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 2px 0 12px rgba(15, 23, 42, 0.28);
  overflow: hidden;
  z-index: 1201;
  transition: width 220ms ease, transform 220ms ease, box-shadow 220ms ease;
}

.sidebar-brand {
  height: 60px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.brand-mark {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: linear-gradient(145deg, #60a5fa 0%, #3b82f6 100%);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.22);
  flex: 0 0 auto;
}

.brand-text {
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  letter-spacing: 0.2px;
}

.sidebar-nav {
  padding: 12px 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1;
}

.nav-item {
  min-height: 44px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #cbd5e1;
  text-decoration: none;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease;
}

.nav-item:hover {
  color: #f8fafc;
  background: rgba(51, 65, 85, 0.6);
  border-color: rgba(100, 116, 139, 0.55);
}

.nav-item.is-active {
  color: #eff6ff;
  background: rgba(30, 64, 175, 0.4);
  border-color: rgba(96, 165, 250, 0.55);
}

.nav-bullet {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  flex: 0 0 auto;
}

.nav-item.is-active .nav-bullet {
  background: #93c5fd;
}

.nav-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.sidebar-footer {
  padding: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.collapse-toggle {
  width: 100%;
  min-height: 44px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.42);
  color: #cbd5e1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
}

.collapse-toggle:hover {
  color: #f8fafc;
  background: rgba(30, 64, 175, 0.36);
  border-color: rgba(147, 197, 253, 0.6);
}

.toggle-icon {
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.toggle-label {
  font-size: 13px;
  font-weight: 500;
}

.is-collapsed .sidebar-brand,
.is-collapsed .nav-item {
  justify-content: center;
}

.is-collapsed .collapse-toggle {
  padding: 0;
}

.is-mobile {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  transform: translateX(-100%);
  box-shadow: none;
}

.is-mobile.is-mobile-open {
  transform: translateX(0);
  box-shadow: 8px 0 24px rgba(15, 23, 42, 0.38);
}

.sidebar-mask {
  position: fixed;
  inset: 0;
  border: none;
  margin: 0;
  padding: 0;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(1px);
  cursor: pointer;
  z-index: 1200;
}

.sidebar-mask-enter-active,
.sidebar-mask-leave-active {
  transition: opacity 220ms ease;
}

.sidebar-mask-enter-from,
.sidebar-mask-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar,
  .nav-item,
  .sidebar-mask-enter-active,
  .sidebar-mask-leave-active {
    transition-duration: 1ms !important;
  }
}
</style>
