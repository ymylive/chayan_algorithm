<template>
  <section
    class="app-card"
    :class="{
      'is-hoverable': props.hoverable,
      'is-borderless': props.borderless
    }"
  >
    <header
      v-if="$slots.header || props.title || props.subtitle"
      class="card-header"
      :class="{ 'with-divider': props.headerDivider }"
    >
      <slot name="header">
        <div class="header-text">
          <h3 v-if="props.title" class="card-title">{{ props.title }}</h3>
          <p v-if="props.subtitle" class="card-subtitle">{{ props.subtitle }}</p>
        </div>
      </slot>
    </header>

    <div class="card-body" :class="paddingClass">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    padding?: CardPadding
    hoverable?: boolean
    borderless?: boolean
    headerDivider?: boolean
  }>(),
  {
    title: '',
    subtitle: '',
    padding: 'md',
    hoverable: false,
    borderless: false,
    headerDivider: true
  }
)

const paddingClass = computed(() => `padding-${props.padding}`)
</script>

<style scoped>
.app-card {
  width: 100%;
  background: #ffffff;
  border: 1px solid #dbe4ee;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
  color: #1f2937;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.app-card.is-hoverable:hover {
  transform: translateY(-1px);
  border-color: #bfdbfe;
  box-shadow: 0 10px 24px rgba(30, 64, 175, 0.14);
}

.app-card.is-borderless {
  border-color: transparent;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
}

.card-header {
  padding: 14px 18px 12px;
}

.card-header.with-divider {
  border-bottom: 1px solid #e2e8f0;
}

.header-text {
  min-width: 0;
}

.card-title {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  line-height: 1.3;
  font-weight: 600;
}

.card-subtitle {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.4;
}

.card-body.padding-none {
  padding: 0;
}

.card-body.padding-sm {
  padding: 10px 12px;
}

.card-body.padding-md {
  padding: 16px;
}

.card-body.padding-lg {
  padding: 22px;
}

.card-footer {
  padding: 12px 16px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .app-card {
    transition-duration: 1ms !important;
  }
}
</style>
