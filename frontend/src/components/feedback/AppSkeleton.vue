<template>
  <div
    class="app-skeleton"
    :class="{
      'is-animated': props.animated,
      'is-avatar': props.variant === 'avatar'
    }"
  >
    <template v-if="props.variant === 'text' || props.variant === 'title'">
      <span
        v-for="(lineStyle, index) in lineStyles"
        :key="`line-${index}`"
        class="skeleton-line"
        :style="lineStyle"
      />
    </template>

    <span v-else class="skeleton-block" :style="blockStyle" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type SkeletonVariant = 'text' | 'title' | 'rect' | 'avatar'

const props = withDefaults(
  defineProps<{
    variant?: SkeletonVariant
    width?: string
    height?: string
    radius?: string
    lines?: number
    animated?: boolean
  }>(),
  {
    variant: 'text',
    width: '100%',
    height: '',
    radius: '',
    lines: 1,
    animated: true
  }
)

const safeLines = computed(() => Math.max(1, props.lines))

const resolvedHeight = computed(() => {
  if (props.height) {
    return props.height
  }
  if (props.variant === 'title') {
    return '18px'
  }
  if (props.variant === 'avatar') {
    return '44px'
  }
  if (props.variant === 'rect') {
    return '120px'
  }
  return '13px'
})

const resolvedRadius = computed(() => {
  if (props.radius) {
    return props.radius
  }
  if (props.variant === 'avatar') {
    return '999px'
  }
  if (props.variant === 'rect') {
    return '10px'
  }
  return '6px'
})

const blockStyle = computed(() => ({
  width: props.variant === 'avatar' ? resolvedHeight.value : props.width,
  height: resolvedHeight.value,
  borderRadius: resolvedRadius.value
}))

const lineStyles = computed(() => {
  return Array.from({ length: safeLines.value }, (_, index) => {
    const isLast = index === safeLines.value - 1
    const width = safeLines.value === 1 ? props.width : isLast ? '74%' : '100%'
    return {
      width,
      height: resolvedHeight.value,
      borderRadius: resolvedRadius.value
    }
  })
})
</script>

<style scoped>
.app-skeleton {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.is-avatar {
  width: auto;
}

.skeleton-line,
.skeleton-block {
  position: relative;
  display: block;
  background: #d9e2ec;
  overflow: hidden;
}

.is-animated .skeleton-line::after,
.is-animated .skeleton-block::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(241, 245, 249, 0.75) 45%, transparent 100%);
  transform: translateX(-100%);
  animation: skeleton-shimmer 260ms linear infinite;
}

@keyframes skeleton-shimmer {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-animated .skeleton-line::after,
  .is-animated .skeleton-block::after {
    animation: none !important;
  }
}
</style>
