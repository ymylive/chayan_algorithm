<template>
  <MainLayout v-if="showMainLayout" />
  <RouterView v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import MainLayout from './layouts/MainLayout.vue'

const route = useRoute()
const showMainLayout = computed(() => route.meta.requiresAuth !== false)
</script>
