import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const readView = () => {
  const fullPath = path.resolve(process.cwd(), 'src/views/AIAnalyze.vue')
  return fs.readFileSync(fullPath, 'utf8')
}

const readSharedFallbackReasonMap = () => {
  const fullPath = path.resolve(process.cwd(), '../shared/mcp-fallback-reasons.json')
  return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as Record<string, string>
}

describe('AIAnalyze quality dashboard contract', () => {
  test('renders async progress and history sections for resumable jobs', () => {
    const source = readView()

    expect(source).toContain('实时分析进度')
    expect(source).toContain('历史分析记录')
    expect(source).toContain('activeJobProgress')
    expect(source).toContain('historyRows')
    expect(source).toContain('openHistoryResult')
  })

  test('keeps compatibility-safe quality and completeness data access', () => {
    const source = readView()

    expect(source).toContain('analysis?.qualityContract')
    expect(source).toContain('qualityContract.value?.featureFlags')
    expect(source).toContain('analysis?.evidence?.dataCompleteness')
    expect(source).toContain('dataCompleteness')
  })

  test('shows MCP health badges with fallback reason mapping', () => {
    const source = readView()
    const sharedReasonMap = readSharedFallbackReasonMap()

    expect(source).toContain('result.value?.mcp?.mcpHealth')
    expect(source).toContain('mcpFallbackReasons')
    expect(source).toContain("import mcpFallbackReasonLabelMap from '@shared/mcp-fallback-reasons.json'")
    expect(source).toContain('mcpFallbackReasonLabelMap')
    expect(sharedReasonMap.mcp_payload_invalid).toBe('MCP 返回结构异常')
    expect(sharedReasonMap.mcp_tool_failed).toBe('MCP 工具调用失败')
  })
})
