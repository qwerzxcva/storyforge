import { expect, test, type Page } from '@playwright/test'
import { createLongform } from './helpers/product-entry'

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('storyforge_guide_completed', 'e2e')
    localStorage.setItem('storyforge-ai-config', JSON.stringify({
      provider: 'ollama', baseUrl: 'https://companion-test.invalid/v1', model: 'isolated-test', temperature: 0,
    }))
  })
  await createLongform(page, '炉娘隔离验收')
  await page.getByRole('navigation', { name: '工作台创作方式' }).getByRole('button', { name: 'Agent', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '告诉主 Agent 你的目标' })).toBeEnabled()
}

test('text discussion works without voice controls and never adopts a plan', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await setup(page)
  let calls = 0
  await page.route('https://companion-test.invalid/v1/chat/completions', async (route) => {
    calls++
    expect(route.request().postData()).toContain('先讨论女主的动机')
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ summary: '可以先从她需要守护的人谈起，再讨论背叛的代价。', tasks: [] }) } }],
    }) })
  })
  const input = page.getByRole('textbox', { name: '告诉主 Agent 你的目标' })
  await input.fill('先讨论女主的动机，暂时不要生成正文。')
  await expect(page.getByRole('button', { name: '语音输入' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '朗读这条回复' })).toHaveCount(0)
  await page.getByRole('button', { name: '讨论与规划', exact: true }).click()
  await expect(page.getByText('可以先从她需要守护的人谈起，再讨论背叛的代价。', { exact: true })).toBeVisible()
  expect(calls).toBe(1)
  await expect(page.getByRole('button', { name: '确认计划并开始', exact: true })).toHaveCount(0)
  const counts = await page.evaluate(async () => {
    const importer = new Function('path', 'return import(path)')
    const { db } = await importer('/storyforge/src/lib/db/schema.ts')
    return [await db.chapters.count(), await db.characters.count(), await db.outlineNodes.count()]
  })
  expect(counts).toEqual([0, 0, 0])
})

test('companion settings fit mobile, preserve the author request and expose no voice controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.getByRole('textbox', { name: '告诉主 Agent 你的目标' }).fill('这个想法要保留')
  const messageBounds = await page.locator('.agent-messages').boundingBox()
  expect(messageBounds!.height).toBeGreaterThan(260)
  await page.getByRole('button', { name: '助手设置' }).click()
  await expect(page.getByRole('dialog', { name: '炉娘 · 助手设置' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('companion-settings-mobile.png') })
  const dialog = await page.getByRole('dialog').boundingBox()
  expect(dialog!.width).toBeLessThan(390)
  expect(dialog!.y + dialog!.height).toBeLessThanOrEqual(844)
  await page.getByRole('checkbox', { name: '显示原创助手形象' }).uncheck()
  await page.getByRole('button', { name: '关闭助手设置' }).click()
  await expect(page.locator('.companion-portrait')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '告诉主 Agent 你的目标' })).toHaveValue('这个想法要保留')
  await page.reload()
  await expect(page.locator('.companion-portrait')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '语音输入' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '朗读这条回复' })).toHaveCount(0)
})
