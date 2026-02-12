import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const readProjectFile = (relativePath: string) => {
  const fullPath = path.resolve(process.cwd(), relativePath)
  return fs.readFileSync(fullPath, 'utf8')
}

describe('mobile adaptation baseline', () => {
  test('keeps viewport meta configured for mobile rendering', () => {
    const html = readProjectFile('index.html')
    expect(html).toContain('name="viewport"')
    expect(html).toContain('width=device-width')
  })

  test('defines mobile breakpoint and table-level horizontal overflow handling', () => {
    const css = readProjectFile('src/style.css')
    expect(css).toContain('@media (max-width: 768px)')
    expect(css).toContain('min-width: 320px')
    expect(css).toContain('.table-scroll-x')
    expect(css).toContain('overflow-x: auto')
  })

  test('keeps key interactive controls explicitly sized for mobile interactions', () => {
    const layoutCss = readProjectFile('src/layouts/MainLayout.vue')
    const loginCss = readProjectFile('src/views/Login.vue')

    expect(layoutCss).toMatch(/\.mobile-menu-trigger\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s)
    expect(layoutCss).toMatch(/\.avatar-placeholder\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s)
    expect(loginCss).toContain('min-height: 2.75rem')
  })
})
