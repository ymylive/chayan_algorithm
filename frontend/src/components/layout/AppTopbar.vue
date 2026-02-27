<template>
  <header class="app-topbar">
    <div class="topbar-left">
      <button
        v-if="props.isMobile"
        type="button"
        class="menu-button"
        :aria-expanded="props.mobileMenuOpen"
        :aria-label="props.mobileMenuOpen ? t('layout.closeMenu') : t('layout.openMenu')"
        @click="emit('toggle-menu')"
      >
        <svg
          v-if="!props.mobileMenuOpen"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div class="title-group">
        <p class="title">{{ props.title }}</p>
        <p v-if="props.subtitle" class="subtitle">{{ props.subtitle }}</p>
      </div>
    </div>

    <div class="topbar-right">
      <slot name="right">
        <span class="user-chip" aria-hidden="true">
          <span class="user-dot" />
          <span class="user-name">{{ props.userName }}</span>
        </span>
        <button
          v-if="props.showLogout"
          type="button"
          class="logout-button"
          @click="emit('logout')"
        >
          {{ t('layout.logout') }}
        </button>
      </slot>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    userName?: string
    isMobile?: boolean
    mobileMenuOpen?: boolean
    showLogout?: boolean
  }>(),
  {
    title: 'ChaYan Analytics',
    subtitle: '',
    userName: 'Admin',
    isMobile: false,
    mobileMenuOpen: false,
    showLogout: true
  }
)

const emit = defineEmits<{
  (e: 'toggle-menu'): void
  (e: 'logout'): void
}>()
</script>

<style scoped>
.app-topbar {
  height: 60px;
  padding: 0 20px;
  background: #f8fafc;
  border-bottom: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.topbar-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.menu-button {
  width: 44px;
  height: 44px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
}

.menu-button path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
}

.menu-button:hover {
  color: #1e40af;
  border-color: #93c5fd;
  background: #eff6ff;
}

.title-group {
  min-width: 0;
}

.title {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.subtitle {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.topbar-right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.user-chip {
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.user-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #60a5fa;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
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
  .app-topbar {
    height: 56px;
    padding: 0 12px;
  }

  .user-chip {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu-button,
  .logout-button {
    transition-duration: 1ms !important;
  }
}
</style>
