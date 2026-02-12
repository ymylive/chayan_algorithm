/**
 * AI prompt construction and narrative fallback (extracted from AIService, W9).
 */

const ANALYSIS_PROMPT_VERSION = 'market-intel-v2.1';

const ANALYSIS_SYSTEM_PROMPT = `# 角色：AI市场分析专家（Market Intelligence & Strategy Analyst）
你是咨询顾问合伙人级别的市场分析专家。基于输入数据完成：多维市场分析 + 竞品对标 + 可执行增长建议。

## 必须遵守
1. 证据优先：关键结论必须绑定数据、字段或模型结果，并标注【事实】【推断】【假设】。
2. 可复现：定量结论要说明口径、方法、关键输入。
3. 不臆造数据：无数据时明确缺口与影响，允许给区间假设并写明来源逻辑。
4. 面向落地：建议必须含动作、负责人部门、资源、里程碑、KPI、风险与对策。
5. 多维覆盖：至少覆盖市场/客户/产品/渠道/竞争/增长/财务/风险/组织中的6个维度。

## 与当前项目结构对齐（重要）
- 你不能直接调用工具；你只可使用输入中的结构化数据（上传数据摘要、MCP检索摘要、模型输出、同行对标结果）。
- 数学模型为：Entropy Weight + TOPSIS + Theil-Sen，需在解读中体现其含义与限制。
- 如外部信息不足，输出"待补齐清单"，不要虚构市场规模或份额。

## 输出格式（严格按顺序）
1) 高管摘要（3条以内，每条1句话）
2) 关键洞察（分模块，至少6个维度；每条前缀【事实/推断/假设】）
3) 模型结果解读（方法、驱动因素、风险、适用边界）
4) 竞品与同行对标（矩阵式描述：对象/优势/短板/建议动作）
5) 战略选项（2~4项，按"影响×可行性×成本×风险"评分）
6) 30/60/90天行动路线图（动作、负责人、资源、KPI、里程碑）
7) 数据缺口与补齐计划（优先级P0/P1/P2）

语言：中文、专业、简洁，禁止空话。`;

function buildNarrativeFallback(input) {
  const target = input?.target || '当前对象';
  const peers = (input?.peers || [])
    .slice(0, 3)
    .map((item) => `${item.name}(分数${item.topsisScore ?? '-'})`)
    .join('、');
  const trend = input?.model?.trendLabel || 'stable';
  const trendSlope = input?.model?.trendSlope ?? 0;
  const topIndustries = (input?.uploaded?.topIndustries || [])
    .slice(0, 3)
    .map((item) => `${item.name}(${item.count})`)
    .join('、');

  const trendText = trend === 'up' ? '上升' : trend === 'down' ? '下降' : '稳定';

  return [
    `基于上传数据、MCP 检索与数学模型，对"${target}"完成综合评估。`,
    topIndustries ? `当前样本主要集中在：${topIndustries}。` : '当前样本行业标签偏少，需继续补充结构化数据。',
    `TOPSIS-TheilSen 趋势为${trendText}（斜率 ${trendSlope}）。`,
    peers ? `同行对标建议优先关注：${peers}。` : '同行样本仍不足，建议补充更完整竞品清单。',
    '建议以"市场需求、价格变化、竞品动作、渠道效率"四维建立月度跟踪看板并持续校准模型权重。'
  ].join('\n');
}

function buildNarrativeMessages(payload) {
  const context = {
    goal: payload?.goal || '围绕目标对象形成可执行增长与竞争策略',
    region: payload?.region || '未指定',
    timeRange: payload?.timeRange || '未指定',
    constraints: payload?.constraints || '预算/人力/合规约束未明确',
    successMetrics: payload?.successMetrics || []
  };

  const compactPayload = {
    target: payload?.target,
    context,
    uploaded: {
      matchedCount: payload?.uploaded?.matchedCount || 0,
      usedCount: payload?.uploaded?.usedCount || 0,
      topIndustries: (payload?.uploaded?.topIndustries || []).slice(0, 5)
    },
    model: {
      method: payload?.model?.method,
      trendLabel: payload?.model?.trendLabel,
      trendSlope: payload?.model?.trendSlope,
      weights: (payload?.model?.weights || []).slice(0, 6),
      ranking: (payload?.model?.ranking || []).slice(0, 6)
    },
    peers: (payload?.peers || []).slice(0, 6),
    peerResearch: (payload?.peerResearch || []).slice(0, 6),
    mcpSignals: {
      industries: (payload?.industryNames || []).slice(0, 8),
      competitors: (payload?.competitorNames || []).slice(0, 8)
    },
    keyFindings: (payload?.keyFindings || []).slice(0, 8)
  };

  return [
    {
      role: 'system',
      content: ANALYSIS_SYSTEM_PROMPT
    },
    {
      role: 'user',
      content: `请基于以下项目数据，输出完整分析报告。

补充要求：
- 关键结论必须可追溯到输入数据字段或模型结果。
- 对"同行对标"给出至少3条可执行策略，并写明适用场景。
- 对任何不确定项明确为"假设"并说明影响范围。

输入数据(JSON)：
${JSON.stringify(compactPayload, null, 2)}`
    }
  ];
}

module.exports = {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SYSTEM_PROMPT,
  buildNarrativeFallback,
  buildNarrativeMessages
};
