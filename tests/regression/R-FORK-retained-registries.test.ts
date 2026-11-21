import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { AGENT_SKILLS, REGISTERED_AGENT_IDS, validateAgentSkillDefinitionsV1 } from '../../src/lib/agent/skill-registry'
import { CONTEXT_SOURCES } from '../../src/lib/registry/context-sources'
import { FIELD_REGISTRY } from '../../src/lib/registry/field-registry'
import { ADOPTION_EXTENSIONS, ADOPTION_SCHEMAS } from '../../src/lib/registry/adoption-schema'
import { PRODUCT_CATALOG_V1, PRODUCT_SURFACES_V1, productCatalogIdForWorkV1 } from '../../src/lib/product/product-catalog'
import { isProductAvailableInBuild, isWorkAvailableInBuild } from '../../src/lib/runtime/app-mode'
import { stableProductRuntimeJsonV1 } from '../../src/lib/legacy-compat/product/runtime-values'
import { stableRuntimeJsonV1 } from '../../src/lib/legacy-compat/product/runtime-stable-json'
import { AUTHORING_OFFICIAL_TEMPLATES, buildOfficialAuthoringTemplate } from '../../src/lib/node-authoring/templates'
const retired = /^(?:extensionRecords|shortNovel|adaptation|screenplay|comic|motionDrama|chat|ttrpg|product(?:Production|Build|Release|Runtime)|avg|aiTown|adventure|openWorld|textOpenWorld|creationRelease|mediaBlob)/
describe('retained fork registry closure', () => {
  it.each([
    [null, 'null'],
    [undefined, 'null'],
    [NaN, 'null'],
    [Infinity, 'null'],
    [{ z: undefined, b: 2, a: { z: 3, a: 1 } }, '{"a":{"a":1,"z":3},"b":2}'],
    [[undefined, { b: null, a: '原稿' }, 0], '[null,{"a":"原稿","b":null},0]'],
    [Array(2), '[,]'],
    ['换行\n原稿', '"换行\\n原稿"'],
  ])('preserves historical stable JSON bytes for %j', (value, expected) => {
    expect(stableProductRuntimeJsonV1(value)).toBe(expected)
    expect(stableRuntimeJsonV1(value)).toBe(expected)
  })
  it('physically retires the short-novel template builder in every build mode', () => {
    expect(AUTHORING_OFFICIAL_TEMPLATES.map(template => template.id)).not.toContain('short-novel')
    expect(() => buildOfficialAuthoringTemplate('short-novel' as never)).toThrow('未知官方节点模板')
    const text = readFileSync('src/lib/node-authoring/templates.ts', 'utf8')
    expect(text).not.toContain('deriveShortNovelStructure')
    expect(text).not.toContain("id: 'short-novel'")
  })
  it('ships no retired preview application or dedicated product dependencies', () => {
    for (const file of ['ui-preview/index.html', 'ui-preview/src/players.tsx', 'src/pages/ShortformPage.tsx', 'src/pages/TtrpgPage.tsx', 'src/lib/short-novel/service.ts']) expect(existsSync(file), file).toBe(false)
    expect(existsSync('ui-preview/assets/shell.jpg')).toBe(true)
    expect(existsSync('src/styles/workspace-layout.css')).toBe(true)
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
    for (const name of ['three', '@types/three', 'tus-js-client', '@supabase/supabase-js', 'fountain-js']) {
      expect(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name], name).toBeUndefined()
      expect(lock.packages[`node_modules/${name}`], name).toBeUndefined()
    }
    for (const command of ['build', 'build:portable', 'build:showcase', 'build:android:web']) expect(manifest.scripts[command], command).not.toMatch(/ui-preview|build:adventure-player/)
  })
  it('physically catalogs only world and longform with its node view for all modes', () => {
    expect(PRODUCT_CATALOG_V1.map(item => item.id)).toEqual(['world-engine', 'independent.longform', 'authoring.nodes'])
    expect(PRODUCT_SURFACES_V1.flatMap(item => item.productIds).sort()).toEqual(['authoring.nodes', 'independent.longform', 'world-engine'])
    for (const mode of ['android', 'production', 'development', 'test']) {
      for (const id of ['world-engine', 'independent.longform', 'authoring.nodes']) expect(isProductAvailableInBuild(id, mode)).toBe(true)
      for (const id of ['independent.shortform', 'upper.avg', 'upper.ttrpg']) expect(isProductAvailableInBuild(id, mode)).toBe(false)
      expect(isWorkAvailableInBuild({ kind: 'novel', novelProfile: 'long' }, mode)).toBe(true)
      expect(isWorkAvailableInBuild({ kind: 'novel', novelProfile: 'short' }, mode)).toBe(false)
    }
    expect(() => productCatalogIdForWorkV1({ kind: 'novel', novelProfile: 'short' })).toThrow()
  })
  it('preserves world and longform skills with their candidate governance', () => {
    expect(REGISTERED_AGENT_IDS).toEqual(['world-origin', 'character', 'inspiration', 'outline', 'prose'])
    expect(AGENT_SKILLS).toHaveLength(54)
    expect(AGENT_SKILLS.map(skill => skill.id)).toEqual(expect.arrayContaining(['world-origin.worldview-field', 'outline.volumes', 'outline.chapters', 'outline.details', 'prose.generate', 'prose.memory']))
    expect(AGENT_SKILLS.some(skill => /runtime|interaction|adventure|ai-town|ttrpg|open-world|product-production|extension-generate/.test(skill.executionMode))).toBe(false)
    expect(() => validateAgentSkillDefinitionsV1(AGENT_SKILLS)).not.toThrow()
  })
  it('removes retired read and write registrations while keeping neutral WorldRelease', () => {
    expect(CONTEXT_SOURCES.map(source => source.key)).toEqual(expect.arrayContaining(['worldRelease', 'workAuthoringIntent', 'ragSelection', 'chapterContent', 'activeNarrativeBlueprint']))
    expect(CONTEXT_SOURCES.some(source => retired.test(source.key) || /^(?:product-production|text-open-world|ai-town)[.]/.test(source.key))).toBe(false)
    expect(FIELD_REGISTRY.some(field => retired.test(field.target))).toBe(false)
    expect(FIELD_REGISTRY).toEqual(expect.arrayContaining([expect.objectContaining({ target: 'chapters', field: 'content' }), expect.objectContaining({ target: 'works', field: 'title' })]))
    expect(ADOPTION_SCHEMAS.some(schema => retired.test(schema.target))).toBe(false)
    expect(ADOPTION_EXTENSIONS.some(extension => retired.test(extension.target))).toBe(false)
    const text = readFileSync('src/lib/registry/context-sources.ts', 'utf8')
    expect(text).toContain("import('../context-gateway/world-release-provider')")
    for (const module of ['short-novel', 'product-production', 'character-interaction', 'ttrpg', 'avg', 'adventure', 'open-world', 'screenplay', 'comic', 'motion-drama']) {
      expect(text).not.toContain("import('../" + module + '/')
      expect(text).not.toContain("from '../" + module + '/')
    }
  })
})
