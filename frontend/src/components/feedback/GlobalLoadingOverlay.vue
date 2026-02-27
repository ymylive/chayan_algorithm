<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div
        v-if="props.visible"
        class="loading-overlay"
        :style="overlayStyle"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="loading-panel">
          <div class="loader-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p class="loading-text">{{ props.text }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    visible?: boolean
    text?: string
    zIndex?: number
    blur?: number
  }>(),
  {
    visible: false,
    text: 'Loading...',
    zIndex: 1600,
    blur: 1
  }
)

const overlayStyle = computed(() => ({
  zIndex: String(props.zIndex),
  backdropFilter: `blur(${props.blur}px)`
}))
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.36);
}

.loading-panel {
  min-width: 170px;
  padding: 16px 18px 14px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.loader-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.loader-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2563eb;
  animation: loading-pulse 220ms ease-in-out infinite alternate;
}

.loader-dots span:nth-child(2) {
  animation-delay: 70ms;
}

.loader-dots span:nth-child(3) {
  animation-delay: 140ms;
}

.loading-text {
  margin: 0;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 200ms ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

@keyframes loading-pulse {
  from {
    transform: translateY(0);
    opacity: 0.5;
  }
  to {
    transform: translateY(-2px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loader-dots span {
    animation: none !important;
  }

  .overlay-fade-enter-active,
  .overlay-fade-leave-active {
    transition-duration: 1ms !important;
  }
}
</style>
