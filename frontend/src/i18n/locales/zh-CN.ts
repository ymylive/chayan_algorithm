export default {
  nav: {
    login: '登录',
    register: '注册',
    overview: '总览',
    upload: '数据上传',
    analysis: '分析',
    recommendations: '建议',
    aiAnalyze: 'AI 分析',
    aiSettings: 'AI 设置',
    deepResearch: '深度研究',
    collapse: '收起'
  },
  layout: {
    appName: '茶研算法',
    subtitle: 'LLM 多维企业智能分析',
    logout: '退出登录',
    user: '管理员',
    openMenu: '打开菜单',
    closeMenu: '关闭菜单',
    expandSidebar: '展开侧边栏',
    collapseSidebar: '收起侧边栏',
    primaryNavigation: '主导航',
    mainNavigation: '主要菜单',
    closeNavigationMenu: '关闭导航菜单',
    language: '语言',
    zh: '中文',
    en: 'English',
    workspace: '工作区'
  },
  chart: {
    loading: '图表加载中...',
    empty: '暂无可渲染数据',
    type: {
      radar: '雷达图',
      line: '折线图',
      bar: '柱状图',
      graph: '关系图'
    }
  },
  aiAnalyze: {
    header: {
      title: 'AI 智能分析',
      subtitle: '分步骤分析公司数据，支持离开页面后后台持续运行。'
    },
    form: {
      target: '分析对象',
      placeholder: '例如：茶颜悦色、特斯拉、苹果、华为',
      start: '开始分析'
    },
    pipeline: {
      detectPeers: '识别竞品公司',
      mcpSearch: 'MCP 检索信号',
      modelScore: '模型评分',
      narrative: 'AI 叙事生成'
    },
    progress: {
      title: '实时分析进度'
    },
    history: {
      title: '历史分析记录',
      refresh: '刷新',
      empty: '暂无历史记录',
      viewResult: '查看结果',
      target: '分析对象',
      status: '状态',
      progress: '进度',
      step: '步骤',
      createdAt: '创建时间',
      action: '操作'
    },
    report: {
      title: '分析报告',
      summaryTitle: '摘要结论',
      summaryEmpty: '暂无摘要',
      dashboardTitle: '多维分析图谱',
      dashboardName: 'LLM 洞察看板',
      dashboardDescription: '质量、证据完整度、竞品信号与关系网络。',
      narrativeTitle: 'AI 深度解读',
      keyFindings: '关键结论',
      suggestions: '建议动作'
    },
    meta: {
      model: '模型',
      realtime: '实时生成',
      degraded: '降级输出',
      qualityScore: '质量分',
      mcpStatus: 'MCP 检索',
      mcpNormal: '正常',
      mcpFallback: '含回退'
    },
    section: {
      competitorEvidence: '竞品证据',
      financeConsumer: '财报对比与消费者画像',
      peerFinancialEvidence: '同行财报证据',
      consumerProfile: '消费者画像',
      structuredSignals: '结构化信号',
      ageRanges: '主要年龄段',
      segments: '主要消费群体',
      consumerResearchEvidence: '消费者研究证据',
      suggestedQueries: '建议补数检索词',
      dataGap: '数据缺口',
      coverage: '数据覆盖快照',
      referencesCount: '条'
    },
    table: {
      competitor: '竞品',
      source: '来源',
      relevance: '相关度',
      url: '链接'
    },
    coverage: {
      completeness: '数据完整度',
      completenessNote: '来自 dataCompleteness 评估',
      sourceCoverage: '来源覆盖',
      sourceCoverageNote: '竞品来源去重后统计',
      financialCoverage: '财报证据',
      financialCoverageNote: '目标与同行财务线索',
      consumerCoverage: '消费者信号',
      consumerCoverageNote: '画像引用与结构化分群'
    },
    chart: {
      marketEvidence: '市场证据',
      financialEvidence: '财报证据',
      consumerEvidence: '消费证据',
      competitorSignals: '竞品信号',
      competitorRelevance: '竞品相关度',
      evidenceCoverage: '证据覆盖度',
      scoreUnit: '分',
      countUnit: '条',
      marketNode: '市场',
      financialNode: '财报',
      consumerNode: '消费'
    },
    panel: {
      title: '多维洞察面板',
      description: '统一展示雷达、趋势、对比与关系网络视图。',
      radarTitle: '能力雷达',
      radarSubtitle: '跨维度能力结构',
      lineTitle: '趋势追踪',
      lineSubtitle: '分析流程动量变化',
      barTitle: '证据对比',
      barSubtitle: '关键维度指标对比',
      graphTitle: '关系网络',
      graphSubtitle: '目标与竞品关联关系',
      radarQuality: '质量',
      radarCoverage: '数据覆盖',
      radarSourceCoverage: '来源覆盖',
      radarFinancialSignals: '财务信号',
      radarConsumerSignals: '消费信号',
      lineSignal: '信号',
      lineModel: '模型',
      lineNarrative: '叙事',
      lineAction: '行动',
      lineFinal: '最终',
      radarSeries: 'AI 洞察质量',
      lineSeries: '流程动量',
      lineUnit: '分',
      graphSeries: '竞争网络',
      graphCategoryTarget: '目标对象',
      graphCategoryCompetitor: '竞品',
      graphCategorySignal: '信号维度'
    },
    status: {
      pending: '等待中',
      running: '进行中',
      completed: '已完成',
      failed: '失败',
      unknown: '未知'
    },
    toasts: {
      inputRequired: '请先填写 AI 分析对象',
      submitSuccess: '分析任务已提交，后台正在持续执行',
      submitFailed: '提交分析任务失败',
      completed: 'AI 分析已完成',
      loadHistoryFailed: '加载历史分析记录失败',
      loadHistoryResultFailed: '加载历史分析结果失败',
      pollFailed: '查询分析进度失败',
      failed: 'AI 分析任务执行失败'
    },
    fallback: {
      unknownCompetitor: '未知竞品',
      sourceMcp: 'mcp'
    },
    gapReasons: {
      industrySignalsMissing: '行业信号不足',
      competitorsInsufficient: '竞品样本不足',
      competitorRelevanceLow: '竞品相关度偏低',
      marketReferencesMissing: '市场报告证据不足',
      financialReferencesMissing: '财报与财务证据不足',
      sourceCoverageWeak: '来源覆盖度偏弱'
    },
    mcpFallbackReasons: {
      mcp_client_unavailable: 'MCP 客户端不可用',
      mcp_tool_failed: 'MCP 工具调用失败',
      mcp_payload_invalid: 'MCP 返回结构异常',
      mcp_fallback_empty: 'MCP 未返回有效数据',
      query_request_failed: '检索请求失败',
      partial_failure: '部分检索失败'
    }
  },
  aiSettings: {
    header: {
      title: 'AI 配置中心'
    },
    groups: {
      primary: '主服务配置',
      fallback: '回退链配置',
      secondary: '次级服务（可选）',
      tertiary: '三级服务（可选）',
      model: '模型参数'
    },
    field: {
      apiEndpoint: 'AI API 地址',
      apiKey: 'API Key',
      model: '主模型',
      protocol: '协议类型',
      fallbackModel: '单模型回退',
      modelFallbacks: '模型回退链',
      secondaryApiEndpoint: '次级 API 地址',
      secondaryProtocol: '次级协议',
      secondaryApiKey: '次级 API Key',
      secondaryModel: '次级模型',
      tertiaryApiEndpoint: '三级 API 地址',
      tertiaryProtocol: '三级协议',
      tertiaryApiKey: '三级 API Key',
      tertiaryModel: '三级模型',
      temperature: '温度 Temperature',
      maxTokens: '最大 Tokens'
    },
    placeholder: {
      apiEndpoint: 'https://gmn.chuangzuoli.com/v1',
      apiKey: '请输入 API Key（留空则保持现有）',
      model: 'gpt-5.2',
      selectProtocol: '请选择协议',
      fallbackModel: '可选：主模型失败时使用',
      modelFallbacks: '逗号分隔，例如 model/a, model/b',
      secondaryApiEndpoint: 'https://api-inference.modelscope.cn/v1',
      secondaryApiKey: '请输入次级 API Key（留空则保持现有）',
      secondaryModel: 'ZhipuAI/GLM-5',
      tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
      tertiaryApiKey: '请输入三级 API Key（留空则保持现有）',
      tertiaryModel: 'deepseek/deepseek-r1-0528:free'
    },
    protocol: {
      responses: 'OpenAI Responses',
      chatCompletions: 'OpenAI Completions'
    },
    temperatureMarks: {
      low: '保守',
      mid: '平衡',
      high: '创造'
    },
    actions: {
      save: '保存设置',
      reset: '恢复默认'
    },
    helpTip: '配置按当前登录用户单独保存，密钥字段保存后将掩码显示。',
    toasts: {
      loadFailed: '加载 AI 设置失败，已使用默认值',
      saveSuccess: 'AI 设置已保存',
      saveFailed: '保存 AI 设置失败',
      resetSuccess: '默认设置已恢复',
      resetFailed: '恢复默认设置失败'
    },
    validate: {
      apiEndpointRequired: '请先填写 AI API 地址',
      modelRequired: '请先填写主模型名称',
      protocolInvalid: '请选择有效的协议类型',
      secondaryApiEndpointRequired: '请补充次级 API 地址',
      secondaryModelRequired: '请补充次级模型名称',
      secondaryProtocolInvalid: '请选择有效的次级协议类型',
      tertiaryApiEndpointRequired: '请补充三级 API 地址',
      tertiaryModelRequired: '请补充三级模型名称',
      tertiaryProtocolInvalid: '请选择有效的三级协议类型'
    }
  }
};
