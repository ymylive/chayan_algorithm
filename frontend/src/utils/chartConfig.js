export const gaugeOption = (score) => ({
  series: [{
    type: 'gauge',
    startAngle: 180,
    endAngle: 0,
    min: 0,
    max: 100,
    splitNumber: 10,
    axisLine: {
      lineStyle: {
        width: 6,
        color: [[0.3, '#FF6E76'], [0.7, '#FDDD60'], [1, '#58D9F9']]
      }
    },
    pointer: { itemStyle: { color: 'auto' } },
    axisTick: { distance: -30, length: 8, lineStyle: { color: '#fff', width: 2 } },
    splitLine: { distance: -30, length: 30, lineStyle: { color: '#fff', width: 4 } },
    axisLabel: { color: 'auto', distance: 40, fontSize: 12 },
    detail: { valueAnimation: true, formatter: '{value}分', color: 'auto', fontSize: 20 },
    data: [{ value: score, name: '健康度' }]
  }]
});

export const lineOption = (dates, values) => ({
  xAxis: { type: 'category', data: dates },
  yAxis: { type: 'value' },
  series: [{ data: values, type: 'line', smooth: true }],
  tooltip: { trigger: 'axis' }
});

export const radarOption = (indicators, values) => ({
  radar: { indicator: indicators },
  series: [{ type: 'radar', data: [{ value: values }] }]
});

export const barOption = (categories, values) => ({
  xAxis: { type: 'category', data: categories },
  yAxis: { type: 'value' },
  series: [{ data: values, type: 'bar' }],
  tooltip: { trigger: 'axis' }
});
