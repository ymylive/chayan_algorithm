import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
          if (id.includes('element-plus')) return 'element-plus'
          if (id.includes('@element-plus/icons-vue')) return 'element-icons'
          if (
            id.includes('vue') ||
            id.includes('pinia') ||
            id.includes('vue-router') ||
            id.includes('vue-i18n')
          ) {
            return 'vue-vendor'
          }
          return 'vendor'
        }
      }
    }
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '..')]
    }
  }
})
