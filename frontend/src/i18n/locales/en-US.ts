export default {
  nav: {
    login: 'Login',
    register: 'Register',
    overview: 'Overview',
    upload: 'Upload',
    analysis: 'Analysis',
    recommendations: 'Recommendations',
    aiAnalyze: 'AI Analyze',
    aiSettings: 'AI Settings',
    deepResearch: 'Deep Research',
    collapse: 'Collapse'
  },
  layout: {
    appName: 'ChaYan Algorithm',
    subtitle: 'LLM Multi-Dimensional Enterprise Intelligence',
    logout: 'Logout',
    user: 'Admin',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
    primaryNavigation: 'Primary navigation',
    mainNavigation: 'Main navigation',
    closeNavigationMenu: 'Close navigation menu',
    language: 'Language',
    zh: '中文',
    en: 'English',
    workspace: 'Workspace'
  },
  chart: {
    loading: 'Loading chart...',
    empty: 'No chart data available',
    type: {
      radar: 'Radar',
      line: 'Line',
      bar: 'Bar',
      graph: 'Graph'
    }
  },
  auth: {
    login: {
      title: 'ChaYan Analytics',
      form: {
        usernamePlaceholder: 'Username',
        passwordPlaceholder: 'Password'
      },
      action: {
        submit: 'Sign In'
      },
      link: {
        noAccount: 'No account yet?',
        goRegister: 'Create one'
      },
      validation: {
        usernameRequired: 'Please enter your username',
        passwordRequired: 'Please enter your password'
      },
      toast: {
        success: 'Login successful',
        failed: 'Login failed',
        networkError: 'Login failed, please check your network connection'
      }
    },
    register: {
      title: 'Create Account',
      form: {
        emailPlaceholder: 'Email',
        passwordPlaceholder: 'Password (at least 6 characters)',
        confirmPasswordPlaceholder: 'Confirm password'
      },
      action: {
        submit: 'Register'
      },
      link: {
        hasAccount: 'Already have an account?',
        backToLogin: 'Back to login'
      },
      validation: {
        emailRequired: 'Please enter your email',
        emailInvalid: 'Please enter a valid email address',
        passwordRequired: 'Please enter your password',
        passwordMin: 'Password must be at least 6 characters',
        confirmPasswordRequired: 'Please confirm your password',
        passwordMismatch: 'The two passwords do not match'
      },
      toast: {
        success: 'Registration successful',
        failed: 'Registration failed',
        networkError: 'Registration failed, please check your network connection'
      }
    }
  },
  home: {
    banner: {
      title: 'Welcome to ChaYan Analytics',
      subtitle: 'AI-powered enterprise analytics and decision support platform'
    },
    enterprise: {
      title: 'Enterprise List',
      searchPlaceholder: 'Enter enterprise name',
      searchButton: 'Search',
      table: {
        id: 'ID',
        name: 'Enterprise Name',
        industry: 'Industry',
        createdAt: 'Created At'
      }
    },
    stats: {
      valueMissing: '-',
      enterpriseTotal: {
        label: 'Total Enterprises',
        desc: 'Number of enterprises currently tracked'
      },
      currentPageRows: {
        label: 'Rows On Current Page',
        desc: 'Records returned by current pagination'
      },
      aiAnalyzeJobs: {
        label: 'AI Analyze Jobs',
        desc: 'Count of historical AI analyze tasks'
      },
      dataFiles: {
        label: 'Data Files',
        desc: 'No endpoint available for file count yet'
      }
    },
    quickAction: {
      upload: {
        title: 'Upload Data',
        desc: 'Upload CSV/Excel/JSON datasets'
      },
      analysis: {
        title: 'Data Analysis',
        desc: 'Review financial and competitiveness analysis'
      },
      ai: {
        title: 'AI Analyze',
        desc: 'Generate deep insights with AI'
      },
      recommendation: {
        title: 'Recommendations',
        desc: 'Get actionable decision suggestions'
      }
    }
  },
  upload: {
    title: 'Data Upload',
    dropzone: {
      text: 'Drag files here, or',
      click: 'click to upload'
    },
    supportedFormats: {
      label: 'Supported formats:'
    },
    actions: {
      start: 'Start Upload',
      retry: 'Upload Again'
    },
    preview: {
      title: 'Data Preview',
      count: 'Showing first 10 rows'
    },
    message: {
      invalidFormat: 'Only .csv, .xlsx and .json files are supported',
      success: 'Upload successful',
      failed: 'Upload failed, please try again'
    }
  },
  recommendations: {
    title: 'Recommendations',
    select: {
      placeholder: 'Select enterprise'
    },
    actions: {
      export: 'Export',
      refresh: 'Refresh'
    },
    loading: {
      generating: 'Generating recommendations...'
    },
    item: {
      impactLabel: 'Expected impact: ',
      createdAtLabel: 'Created at: '
    },
    empty: {
      description: 'Select an enterprise to view intelligent recommendations',
      cta: 'Select Enterprise'
    },
    category: {
      strategy: 'Strategy',
      operation: 'Operations',
      financial: 'Finance',
      market: 'Market',
      innovation: 'Innovation',
      general: 'General'
    },
    priority: {
      high: 'High',
      medium: 'Medium',
      low: 'Low'
    },
    fallback: {
      title: 'Smart Recommendation',
      content: 'No recommendation content yet'
    },
    message: {
      fetchFailed: 'Failed to fetch recommendations'
    }
  },
  deepResearch: {
    header: {
      title: 'Deep Research',
      subtitle: 'Search, fetch, and analyze market and competitor intelligence in real time'
    },
    form: {
      topicLabel: 'Research Topic',
      topicPlaceholder: 'Example: New energy vehicle market',
      startButton: 'Start Research'
    },
    result: {
      title: 'Research Result'
    },
    section: {
      marketData: 'Market Data',
      competitors: 'Competitors',
      sources: 'Sources'
    },
    table: {
      name: 'Name',
      relevance: 'Relevance',
      source: 'Source'
    },
    history: {
      title: 'History',
      topic: 'Topic',
      time: 'Time',
      status: 'Status'
    },
    status: {
      searching: 'Searching',
      fetching: 'Fetching',
      analyzing: 'Analyzing',
      completed: 'Completed',
      pending: 'Pending'
    },
    progress: {
      fetched: 'Fetched {fetched}/{total}'
    },
    message: {
      researchFailed: 'Research failed',
      wsError: 'WebSocket connection error',
      topicRequired: 'Please enter a research topic',
      started: 'Research started',
      startFailed: 'Failed to start research'
    }
  },
  analysisPage: {
    header: {
      title: 'Multi-dimensional Analysis',
      subtitle: 'Visualize financial, market, and competitiveness dimensions in one view.'
    },
    selector: {
      title: 'Enterprise Selector',
      subtitle: 'Choose a target enterprise to load analysis datasets.',
      placeholder: 'Select enterprise',
      enterpriseFallback: 'Enterprise {id}'
    },
    panel: {
      title: 'Enterprise Multi-dimensional Dashboard',
      description: 'Target: {target}'
    },
    graph: {
      target: 'Target',
      competitiveness: 'Competitiveness',
      trend: 'Trend',
      financial: 'Financial'
    },
    series: {
      competitiveness: 'Competitiveness',
      trend: 'Trend',
      financialFactors: 'Financial Factors',
      relationships: 'Enterprise Relationships'
    },
    labels: {
      growthRate: 'Growth Rate',
      prediction: 'Prediction'
    },
    units: {
      index: 'index',
      percent: '%',
      score: 'score'
    },
    common: {
      na: 'N/A',
      target: 'Target'
    },
    messages: {
      retryLater: 'Please retry later.',
      selectEnterprise: 'Select an enterprise to view analysis data',
      noData: 'No analysis data available',
      loadFailed: 'Failed to load analysis data'
    }
  },
  aiAnalyze: {
    header: {
      title: 'AI Intelligent Analysis',
      subtitle: 'Analyze company data step by step, with persistent background execution.'
    },
    form: {
      target: 'Target',
      placeholder: 'Example: ChaYanYueSe, Tesla, Apple, Huawei',
      start: 'Start Analysis'
    },
    pipeline: {
      detectPeers: 'Identify Competitors',
      mcpSearch: 'MCP Signal Retrieval',
      modelScore: 'Model Scoring',
      narrative: 'AI Narrative'
    },
    progress: {
      title: 'Real-time Progress'
    },
    history: {
      title: 'Analysis History',
      refresh: 'Refresh',
      empty: 'No history records',
      viewResult: 'View Result',
      target: 'Target',
      status: 'Status',
      progress: 'Progress',
      step: 'Step',
      createdAt: 'Created At',
      action: 'Action'
    },
    report: {
      title: 'Analysis Report',
      summaryTitle: 'Summary',
      summaryEmpty: 'No summary yet',
      dashboardTitle: 'Multi-Dimensional Insight Panel',
      dashboardName: 'LLM Insight Dashboard',
      dashboardDescription: 'Quality, evidence completeness, competitive signals, and relationship network.',
      narrativeTitle: 'AI Deep Interpretation',
      keyFindings: 'Key Findings',
      suggestions: 'Action Suggestions'
    },
    meta: {
      model: 'Model',
      realtime: 'Realtime',
      degraded: 'Degraded',
      qualityScore: 'Quality Score',
      mcpStatus: 'MCP Retrieval',
      mcpNormal: 'Normal',
      mcpFallback: 'Fallback'
    },
    section: {
      competitorEvidence: 'Competitor Evidence',
      financeConsumer: 'Financial Benchmarks & Consumer Profile',
      peerFinancialEvidence: 'Peer Financial Evidence',
      consumerProfile: 'Consumer Profile',
      structuredSignals: 'Structured Signals',
      ageRanges: 'Primary Age Ranges',
      segments: 'Primary Consumer Segments',
      consumerResearchEvidence: 'Consumer Research Evidence',
      suggestedQueries: 'Suggested Follow-up Queries',
      dataGap: 'Data Gaps',
      coverage: 'Coverage Snapshot',
      referencesCount: 'items'
    },
    table: {
      competitor: 'Competitor',
      source: 'Source',
      relevance: 'Relevance',
      url: 'URL'
    },
    coverage: {
      completeness: 'Data Completeness',
      completenessNote: 'Derived from dataCompleteness',
      sourceCoverage: 'Source Coverage',
      sourceCoverageNote: 'Distinct competitor sources',
      financialCoverage: 'Financial Evidence',
      financialCoverageNote: 'Target + peer financial signals',
      consumerCoverage: 'Consumer Signals',
      consumerCoverageNote: 'References + structured profiles'
    },
    chart: {
      marketEvidence: 'Market Evidence',
      financialEvidence: 'Financial Evidence',
      consumerEvidence: 'Consumer Evidence',
      competitorSignals: 'Competitor Signals',
      competitorRelevance: 'Competitor Relevance',
      evidenceCoverage: 'Evidence Coverage',
      scoreUnit: 'score',
      countUnit: 'count',
      marketNode: 'Market',
      financialNode: 'Financial',
      consumerNode: 'Consumer'
    },
    panel: {
      title: 'Multi-dimensional Insight Panel',
      description: 'Unified radar, trend, comparison, and graph-network views.',
      radarTitle: 'Capability Radar',
      radarSubtitle: 'Cross-domain capability profile',
      lineTitle: 'Trend Tracking',
      lineSubtitle: 'Pipeline momentum trajectory',
      barTitle: 'Evidence Comparison',
      barSubtitle: 'Cross-category evidence intensity',
      graphTitle: 'Relationship Network',
      graphSubtitle: 'Entity links among target and competitors',
      radarQuality: 'Quality',
      radarCoverage: 'Data Coverage',
      radarSourceCoverage: 'Source Coverage',
      radarFinancialSignals: 'Financial Signals',
      radarConsumerSignals: 'Consumer Signals',
      lineSignal: 'Signal',
      lineModel: 'Model',
      lineNarrative: 'Narrative',
      lineAction: 'Action',
      lineFinal: 'Final',
      radarSeries: 'AI Insight Quality',
      lineSeries: 'Pipeline Momentum',
      lineUnit: 'score',
      graphSeries: 'Competitive Network',
      graphCategoryTarget: 'Target',
      graphCategoryCompetitor: 'Competitor',
      graphCategorySignal: 'Signal Dimension'
    },
    status: {
      pending: 'Pending',
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      unknown: 'Unknown'
    },
    toasts: {
      inputRequired: 'Please enter a target first',
      submitSuccess: 'Analysis job submitted and running in background',
      submitFailed: 'Failed to submit analysis job',
      completed: 'AI analysis completed',
      loadHistoryFailed: 'Failed to load history',
      loadHistoryResultFailed: 'Failed to load history result',
      pollFailed: 'Failed to fetch progress',
      failed: 'AI analysis job failed'
    },
    fallback: {
      unknownCompetitor: 'Unknown Competitor',
      sourceMcp: 'mcp'
    },
    gapReasons: {
      industrySignalsMissing: 'Industry signals are missing',
      competitorsInsufficient: 'Insufficient competitor samples',
      competitorRelevanceLow: 'Low competitor relevance',
      marketReferencesMissing: 'Market references are missing',
      financialReferencesMissing: 'Financial evidence is missing',
      sourceCoverageWeak: 'Source coverage is weak'
    },
    mcpFallbackReasons: {
      mcp_client_unavailable: 'MCP client unavailable',
      mcp_tool_failed: 'MCP tool call failed',
      mcp_payload_invalid: 'MCP payload is invalid',
      mcp_fallback_empty: 'MCP returned no valid data',
      query_request_failed: 'Retrieval request failed',
      partial_failure: 'Partial retrieval failure'
    }
  },
  aiSettings: {
    header: {
      title: 'AI Settings Center'
    },
    groups: {
      primary: 'Primary Provider',
      fallback: 'Fallback Chain',
      secondary: 'Secondary Provider (Optional)',
      tertiary: 'Tertiary Provider (Optional)',
      model: 'Model Parameters'
    },
    field: {
      apiEndpoint: 'AI API Endpoint',
      apiKey: 'API Key',
      model: 'Primary Model',
      protocol: 'Protocol',
      fallbackModel: 'Single Fallback Model',
      modelFallbacks: 'Model Fallback Chain',
      secondaryApiEndpoint: 'Secondary API Endpoint',
      secondaryProtocol: 'Secondary Protocol',
      secondaryApiKey: 'Secondary API Key',
      secondaryModel: 'Secondary Model',
      tertiaryApiEndpoint: 'Tertiary API Endpoint',
      tertiaryProtocol: 'Tertiary Protocol',
      tertiaryApiKey: 'Tertiary API Key',
      tertiaryModel: 'Tertiary Model',
      temperature: 'Temperature',
      maxTokens: 'Max Tokens'
    },
    placeholder: {
      apiEndpoint: 'https://gmn.chuangzuoli.com/v1',
      apiKey: 'Enter API key (leave blank to keep existing value)',
      model: 'gpt-5.2',
      selectProtocol: 'Select protocol',
      fallbackModel: 'Optional: used when primary model fails',
      modelFallbacks: 'Comma-separated, e.g. model/a, model/b',
      secondaryApiEndpoint: 'https://api-inference.modelscope.cn/v1',
      secondaryApiKey: 'Enter secondary API key (leave blank to keep existing value)',
      secondaryModel: 'ZhipuAI/GLM-5',
      tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
      tertiaryApiKey: 'Enter tertiary API key (leave blank to keep existing value)',
      tertiaryModel: 'deepseek/deepseek-r1-0528:free'
    },
    protocol: {
      responses: 'OpenAI Responses',
      chatCompletions: 'OpenAI Completions'
    },
    temperatureMarks: {
      low: 'Conservative',
      mid: 'Balanced',
      high: 'Creative'
    },
    actions: {
      save: 'Save Settings',
      reset: 'Restore Defaults'
    },
    helpTip: 'Settings are saved per current user. Secret fields are masked after save.',
    toasts: {
      loadFailed: 'Failed to load AI settings, using defaults',
      saveSuccess: 'AI settings saved',
      saveFailed: 'Failed to save AI settings',
      resetSuccess: 'Defaults restored',
      resetFailed: 'Failed to restore defaults'
    },
    validate: {
      apiEndpointRequired: 'Please enter AI API endpoint',
      modelRequired: 'Please enter primary model name',
      protocolInvalid: 'Please choose a valid protocol',
      secondaryApiEndpointRequired: 'Please complete secondary API endpoint',
      secondaryModelRequired: 'Please complete secondary model name',
      secondaryProtocolInvalid: 'Please choose a valid secondary protocol',
      tertiaryApiEndpointRequired: 'Please complete tertiary API endpoint',
      tertiaryModelRequired: 'Please complete tertiary model name',
      tertiaryProtocolInvalid: 'Please choose a valid tertiary protocol'
    }
  }
};
