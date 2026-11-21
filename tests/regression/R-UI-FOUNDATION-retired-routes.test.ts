import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { retiredHomeDestination, safeSettingsReturn } from '../../src/components/navigation/retired-routes'
import { resolveStoryForgeTheme, THEME_OPTIONS } from '../../src/lib/theme'

describe('current UI is the only application foundation', () => {
  it('retained world and nodes bookmarks preserve parameters while retired products return to the library', () => {
    expect(retiredHomeDestination(new URLSearchParams())).toBeNull()
    expect(retiredHomeDestination(new URLSearchParams('tab=home&legacy=1'))).toBe('/')
    expect(retiredHomeDestination(new URLSearchParams('tab=worlds&legacy=1&project=42'))).toBe('/world/worlds?project=42')
    expect(retiredHomeDestination(new URLSearchParams('tab=nodes&project=42&work=9'))).toBe('/workspace/42?work=9&mode=nodes&module=visual-workflows')
    for (const tab of ['ttrpg','town','chat']) {
      expect(retiredHomeDestination(new URLSearchParams(`tab=${tab}&legacy=1&project=42&work=9&session=11`))).toBe('/home/library')
    }
    const params=new URLSearchParams({tab:'ttrpg',worldHandoff:JSON.stringify({worldReleaseId:42})})
    expect(retiredHomeDestination(params)).toBe('/home/library')
    expect(retiredHomeDestination(new URLSearchParams('tab=text-games&product=text-open-world&project=3'))).toBe('/home/library')
  })
  it('settings return is local and retired saved palettes resolve to the current palette', () => {
    for (const value of ['/long','/world/worlds?project=1','/home/library','/workspace/42?work=9&mode=nodes']) expect(safeSettingsReturn(value)).toBe(value)
    for(const value of ['/ttrpg/play?project=1&session=9','/town/play?project=1','/chat/play?project=1','/openworld/runtime?project=3','https://other.test','//other.test','/play/../settings','/play\\other',null])expect(safeSettingsReturn(value)).toBeNull()
    for (const theme of THEME_OPTIONS) expect(resolveStoryForgeTheme(theme.id)).toBe(theme.id)
    for(const value of ['unknown','warm','jade','slate','forge','scroll','paper','storyforge',null])expect(resolveStoryForgeTheme(value)).toBe('storyforge')
  })
  it('retired UI files and loading escape hatches cannot return', () => {
    for(const file of ['src/pages/ProductHubPage.tsx','src/pages/product-hub.css','src/pages/PreviewRoutePage.tsx','src/components/layout/Sidebar.tsx','src/components/guide/WelcomeGuide.tsx','public/world-map-cangyun.svg'])expect(existsSync(file),file).toBe(false)
    const app = readFileSync('src/App.tsx','utf8')
    expect(app).not.toContain('ProductHubPage')
    expect(app).not.toContain('PreviewRoutePage')
    for (const route of ['ttrpg','town','chat','openworld']) expect(app).not.toContain(`path="/${route}`)
    expect(app).toContain('path="/world/:pageId?"')
    expect(app).toContain('path="/long"')
    expect(app).toContain('path="/workspace/:projectId"')
    expect(readFileSync('src/pages/HomePage.tsx','utf8')).not.toContain('ui-preview/index.html')
    expect(readFileSync('src/components/navigation/product-navigation.ts','utf8')).not.toContain('previewDestination')
  })
})
