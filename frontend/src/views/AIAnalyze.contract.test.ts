import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const readView = () => {
  const fullPath = path.resolve(process.cwd(), 'src/views/AIAnalyze.vue')
  return fs.readFileSync(fullPath, 'utf8')
}

describe('AIAnalyze view contract', () => {
  test('consumes additive quality-contract fields with legacy fallback', () => {
    const source = readView()

    expect(source).toContain('analysis?.qualityContract')
    expect(source).toContain('qualityContract.value?.featureFlags')
    expect(source).toContain('analysis?.evidence?.dataCompleteness')
  })

  test('uses async job endpoints for progress, history, and resumable result loading', () => {
    const source = readView()

    expect(source).toContain('/mcp/ai-analyze/jobs')
    expect(source).toContain('/mcp/ai-analyze/jobs/${encodeURIComponent(jobId)}')
    expect(source).toContain('/mcp/ai-analyze/jobs/${encodeURIComponent(jobId)}/result')
    expect(source).toContain('AI_ANALYZE_PENDING_JOB_KEY')
    expect(source).toContain('persistPendingJob')
  })

  test('consumes additive MCP health fields from ai-analyze response', () => {
    const source = readView()

    expect(source).toContain('result.value?.mcp?.mcpHealth')
    expect(source).toContain('mcpHealthVisible')
    expect(source).toContain('mcpHealthTagType')
    expect(source).toContain('mcpFallbackReasonLabelMap')
    expect(source).toContain("@shared/mcp-fallback-reasons.json")
  })
})
