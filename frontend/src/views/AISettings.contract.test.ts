import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const readView = () => {
  const fullPath = path.resolve(process.cwd(), 'src/views/AISettings.vue')
  return fs.readFileSync(fullPath, 'utf8')
}

describe('AISettings view contract', () => {
  test('loads and saves user-scoped settings via settings API', () => {
    const source = readView()

    expect(source).toContain("request.get('/settings/ai')")
    expect(source).toContain("request.post('/settings/ai',")
  })

  test('includes protocol and fallback chain bindings in save payload', () => {
    const source = readView()

    expect(source).toContain('protocol: form.protocol')
    expect(source).toContain('fallbackModel: form.fallbackModel')
    expect(source).toContain('modelFallbacks: form.modelFallbacks')
    expect(source).toContain('secondaryApiEndpoint: form.secondaryApiEndpoint')
    expect(source).toContain('secondaryProtocol: form.secondaryProtocol')
    expect(source).toContain('secondaryApiKey: sanitizeSecretWrite(form.secondaryApiKey)')
    expect(source).toContain('secondaryModel: form.secondaryModel')
    expect(source).toContain('tertiaryApiEndpoint: form.tertiaryApiEndpoint')
    expect(source).toContain('tertiaryProtocol: form.tertiaryProtocol')
    expect(source).toContain('tertiaryApiKey: sanitizeSecretWrite(form.tertiaryApiKey)')
    expect(source).toContain('tertiaryModel: form.tertiaryModel')
  })

  test('preserves masked secret behavior and i18n-driven validation messages', () => {
    const source = readView()

    expect(source).toContain("if (form.apiKey) {")
    expect(source).toContain("form.apiKey = '********'")
    expect(source).toContain('useI18n')
    expect(source).toContain("t('aiSettings.toasts.loadFailed')")
    expect(source).toContain("t('aiSettings.validate.modelRequired')")
    expect(source).toContain("t('aiSettings.validate.protocolInvalid')")
  })
})
