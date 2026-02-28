import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, GaugeChart, GraphChart, LineChart, PieChart, RadarChart, ScatterChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { UniversalTransition } from 'echarts/features'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './style.css'

use([
  CanvasRenderer,
  GaugeChart,
  GraphChart,
  LineChart,
  RadarChart,
  BarChart,
  PieChart,
  ScatterChart,
  TooltipComponent,
  GridComponent,
  RadarComponent,
  LegendComponent,
  ToolboxComponent,
  DataZoomComponent,
  VisualMapComponent,
  AriaComponent,
  UniversalTransition,
])

const app = createApp(App)

app.use(createPinia()).use(router).use(i18n).use(ElementPlus).mount('#app')
