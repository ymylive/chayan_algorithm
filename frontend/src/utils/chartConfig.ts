import type { EChartsOption } from 'echarts'

const COLORS = ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#5f6368', '#8e24aa', '#00acc1', '#ff7043'] as const

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.96)',
  borderColor: '#e8e8e8',
  borderWidth: 1,
  textStyle: { color: '#303133', fontSize: 13 },
  extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px;'
}

export const gaugeOption = (score: number): EChartsOption => ({
  tooltip: {
    ...TOOLTIP_STYLE,
    formatter: '{b}: {c}分'
  },
  animationDuration: 1000,
  series: [{
    type: 'gauge',
    startAngle: 180,
    endAngle: 0,
    min: 0,
    max: 100,
    splitNumber: 10,
    radius: '95%',
    center: ['50%', '70%'],
    axisLine: {
      lineStyle: {
        width: 16,
        color: [[0.3, '#ea4335'], [0.7, '#fbbc04'], [1, '#34a853']]
      }
    },
    pointer: {
      length: '72%',
      width: 6,
      itemStyle: { color: COLORS[0] }
    },
    axisTick: { show: false },
    splitLine: {
      distance: -18,
      length: 18,
      lineStyle: { color: '#ffffff', width: 2 }
    },
    axisLabel: { color: '#5f6368', distance: -46, fontSize: 12 },
    title: {
      offsetCenter: [0, '18%'],
      color: '#5f6368',
      fontSize: 14
    },
    detail: {
      valueAnimation: true,
      formatter: '{value}分',
      color: '#1f2d3d',
      fontSize: 28,
      fontWeight: 'bold',
      offsetCenter: [0, '48%'],
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: 'rgba(255,255,255,0.92)',
      shadowColor: 'rgba(0, 0, 0, 0.08)',
      shadowBlur: 12
    },
    data: [{ value: score, name: '健康度' }]
  }]
})

export const lineOption = (dates: string[], values: number[]): EChartsOption => ({
  color: [COLORS[0]],
  tooltip: {
    trigger: 'axis',
    ...TOOLTIP_STYLE,
    axisPointer: {
      type: 'line',
      lineStyle: { color: '#d0d7de' }
    }
  },
  grid: {
    left: 40,
    right: 20,
    top: 30,
    bottom: 30
  },
  xAxis: {
    type: 'category',
    data: dates,
    boundaryGap: false,
    axisLine: { lineStyle: { color: '#dcdfe6' } },
    axisTick: { show: true, lineStyle: { color: '#dcdfe6' } },
    axisLabel: { color: '#606266' }
  },
  yAxis: {
    type: 'value',
    axisLine: { lineStyle: { color: '#dcdfe6' } },
    axisTick: { show: true, lineStyle: { color: '#dcdfe6' } },
    splitLine: { lineStyle: { color: '#f0f2f5' } },
    axisLabel: { color: '#606266' }
  },
  series: [{
    data: values,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: {
      width: 3,
      color: COLORS[0]
    },
    itemStyle: {
      color: COLORS[0]
    },
    areaStyle: {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: '#1a73e833' },
          { offset: 1, color: 'rgba(26,115,232,0)' }
        ]
      }
    }
  }]
})

export const radarOption = (indicators: Array<{ name: string; max: number }>, values: number[]): EChartsOption => ({
  color: [COLORS[0]],
  tooltip: {
    ...TOOLTIP_STYLE,
    trigger: 'item'
  },
  radar: {
    indicator: indicators,
    shape: 'polygon',
    splitNumber: 5,
    axisName: {
      color: '#606266',
      fontSize: 12
    },
    splitLine: {
      lineStyle: {
        color: ['#e7ecf3', '#dde5ef', '#d3deeb', '#c8d7e6', '#bed0e2']
      }
    },
    splitArea: {
      areaStyle: {
        color: ['rgba(26,115,232,0.03)', 'rgba(26,115,232,0.06)']
      }
    },
    axisLine: {
      lineStyle: {
        color: '#d3deeb'
      }
    }
  },
  series: [{
    type: 'radar',
    data: [{ value: values, name: '综合竞争力' }],
    lineStyle: {
      width: 2,
      color: COLORS[0]
    },
    itemStyle: {
      color: COLORS[0]
    },
    areaStyle: {
      color: COLORS[0],
      opacity: 0.2
    }
  }]
})

export const barOption = (categories: string[], values: number[]): EChartsOption => ({
  color: [COLORS[0]],
  tooltip: {
    trigger: 'axis',
    ...TOOLTIP_STYLE,
    axisPointer: {
      type: 'shadow'
    }
  },
  grid: {
    left: 40,
    right: 20,
    top: 30,
    bottom: 30
  },
  xAxis: {
    type: 'category',
    data: categories,
    axisLine: { lineStyle: { color: '#dcdfe6' } },
    axisTick: { show: true, lineStyle: { color: '#dcdfe6' } },
    axisLabel: { color: '#606266' }
  },
  yAxis: {
    type: 'value',
    axisLine: { lineStyle: { color: '#dcdfe6' } },
    axisTick: { show: true, lineStyle: { color: '#dcdfe6' } },
    splitLine: { lineStyle: { color: '#f0f2f5' } },
    axisLabel: { color: '#606266' }
  },
  series: [{
    data: values,
    type: 'bar',
    barMaxWidth: 40,
    itemStyle: {
      color: COLORS[0],
      borderRadius: [4, 4, 0, 0]
    }
  }]
})
