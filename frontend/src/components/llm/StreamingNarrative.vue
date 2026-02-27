<template>
  <div class="streaming-narrative" role="status" aria-live="polite">
    <span class="streaming-narrative__text">{{ displayedText }}</span>
    <span
      v-if="showCursor"
      class="streaming-narrative__cursor"
      aria-hidden="true"
    >
      |
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string
    speed?: number
    autoplay?: boolean
  }>(),
  {
    speed: 30,
    autoplay: true
  }
)

const displayedText = ref('')
const isStreaming = ref(false)
const reduceMotion = ref(false)

let streamTimer: ReturnType<typeof setTimeout> | null = null
let motionMediaQuery: MediaQueryList | null = null

const safeSpeed = computed(() => {
  const parsed = Number(props.speed)
  if (!Number.isFinite(parsed)) {
    return 30
  }
  return Math.max(1, Math.round(parsed))
})

const showCursor = computed(() => {
  return isStreaming.value && displayedText.value.length < props.text.length
})

const stopStream = () => {
  if (streamTimer) {
    clearTimeout(streamTimer)
    streamTimer = null
  }
  isStreaming.value = false
}

const renderFullText = () => {
  stopStream()
  displayedText.value = props.text
}

const stepStream = () => {
  const nextLength = displayedText.value.length + 1
  displayedText.value = props.text.slice(0, nextLength)

  if (nextLength >= props.text.length) {
    stopStream()
    return
  }

  streamTimer = setTimeout(stepStream, safeSpeed.value)
}

const startStream = () => {
  if (!props.text) {
    displayedText.value = ''
    stopStream()
    return
  }

  if (reduceMotion.value || !props.autoplay) {
    renderFullText()
    return
  }

  stopStream()
  displayedText.value = ''
  isStreaming.value = true
  streamTimer = setTimeout(stepStream, safeSpeed.value)
}

const handleMotionChange = (event: MediaQueryListEvent) => {
  reduceMotion.value = event.matches
}

onMounted(() => {
  if (typeof window !== 'undefined' && 'matchMedia' in window) {
    motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduceMotion.value = motionMediaQuery.matches
    motionMediaQuery.addEventListener('change', handleMotionChange)
  }

  startStream()
})

watch(
  () => [props.text, props.speed, props.autoplay, reduceMotion.value],
  () => {
    startStream()
  }
)

onBeforeUnmount(() => {
  stopStream()

  if (!motionMediaQuery) {
    return
  }
  motionMediaQuery.removeEventListener('change', handleMotionChange)
})
</script>

<style scoped>
.streaming-narrative {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.6;
}

.streaming-narrative__cursor {
  display: inline-block;
  margin-left: 2px;
  opacity: 0.8;
  animation: cursor-breathe 1200ms ease-in-out infinite;
}

@keyframes cursor-breathe {
  0%,
  100% {
    opacity: 0.25;
  }

  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .streaming-narrative__cursor {
    animation: none !important;
  }
}
</style>
