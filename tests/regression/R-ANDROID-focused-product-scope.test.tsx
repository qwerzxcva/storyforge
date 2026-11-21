import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import { readFileSync } from 'node:fs'
import { db } from '../../src/lib/db/schema'
import { useNodeFlowStore } from '../../src/stores/node-flow'
import { useProjectStore } from '../../src/stores/project'
import { AUTHORING_NODE_BY_ID, defaultConfigForTemplate } from '../../src/lib/node-authoring/catalog'
import { emptyAuthoringGraph } from '../../src/lib/node-authoring/contracts'
import { createWorkspace } from '../../src/lib/workspace/create-workspace'
import { createWorldWork, switchActiveWork, switchNovelProfile } from '../../src/lib/workspace/works'
import { exportProjectJSON } from '../../src/lib/export/json-export'
import { openHomeWork, readHomeCatalog, readHomeResume, validWorkPath, workPath } from '../../src/lib/home/catalog'
import { readHomeData } from '../../src/components/home/useHomeData'
import { ANDROID_APP_PRODUCT_IDS, isProductAvailableInBuild } from '../../src/lib/runtime/app-mode'
import { PRODUCT_CATALOG_V1, evaluateProductEntryV1 } from '../../src/lib/product/product-catalog'
import { retiredHomeDestination, safeSettingsReturn } from '../../src/components/navigation/retired-routes'
import { HomeResults } from '../../src/components/home/HomeResults'

vi.mock('../../src/components/home/ResumeTracker', () => ({ default: () => null }))
vi.mock('../../src/components/system/AutoBackupStatusNotice', () => ({ default: () => null }))
vi.mock('../../src/pages/HomePage', () => ({ default: () => createElement('p', null, '长篇作品库') }))
vi.mock('../../src/pages/WorldEnginePage', () => ({ default: () => createElement('p', null, '世界引擎') }))
vi.mock('../../src/pages/LongformLibraryPage', () => ({ default: () => createElement('p', null, '长篇创作') }))
vi.mock('../../src/pages/WorkspacePage', () => ({ default: () => createElement('p', null, '长篇编辑器') }))
vi.mock('../../src/pages/WorkshopPage', () => ({ default: () => createElement('p', null, '共用插件工具') }))

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let host: HTMLDivElement | undefined
let root: Root | undefined
let RealHomePage: typeof import('../../src/pages/HomePage')['default']
let WorldReleasePanel: typeof import('../../src/components/world-engine/WorldNarrativeReleasePanel')['default']
let RealWorkspace: typeof import('../../src/pages/WorkspacePage')['default']
let LongformLayout: typeof import('../../src/components/longform/LongformLayout')['default']

beforeAll(async () => {
  vi.stubEnv('MODE', 'android')
  RealHomePage = (await vi.importActual<typeof import('../../src/pages/HomePage')>('../../src/pages/HomePage')).default
  WorldReleasePanel = (await import('../../src/components/world-engine/WorldNarrativeReleasePanel')).default
  RealWorkspace = (await vi.importActual<typeof import('../../src/pages/WorkspacePage')>('../../src/pages/WorkspacePage')).default
  LongformLayout = (await import('../../src/components/longform/LongformLayout')).default
}, 30000)
const createLong = (name = '保留的长篇') => createWorkspace({ name, description: '', genres: [], status: 'drafting', targetWordCount: 300000 }, { kind: 'novel', novelProfile: 'long' })

beforeEach(async () => {
  vi.stubEnv('MODE', 'android')
  localStorage.clear()
  await db.delete()
  await db.open()
  useNodeFlowStore.setState({ projectId: null, workId: null, flows: [], runs: [], loading: false })
  useProjectStore.setState({ projects: [], currentProjectId: null })
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  host?.remove(); host = undefined; root = undefined
  db.close()
  vi.unstubAllEnvs()
})

async function render(element: React.ReactNode) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root!.render(element) })
  return host
}

describe('Android build: world engine and longform only', () => {
  it('admits only the requested products and preserves longform node maturity', () => {
    expect([...ANDROID_APP_PRODUCT_IDS].sort()).toEqual(['authoring.nodes', 'independent.longform', 'world-engine'])
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts['build:android:web']).not.toContain('build:adventure-player')
    for (const product of PRODUCT_CATALOG_V1) {
      for (const channel of ['production', 'local-development', 'test'] as const) {
        for (const experimentalOptIn of [false, true]) {
          const decision = evaluateProductEntryV1({ productId: product.id, channel, experimentalOptIn })
          const retained = ANDROID_APP_PRODUCT_IDS.has(product.id)
          const expected = retained && (product.status === 'released' || channel !== 'production')
          expect(decision.enterable, `${product.id}/${channel}/${experimentalOptIn}`).toBe(expected)
          expect(decision.visible, `${product.id}/${channel}/${experimentalOptIn}`).toBe(expected)
        }
      }
    }
  })

  it('allows a longform node graph to be created and saved in the Android build', async () => {
    const owner = await createLong('节点长篇')
    const template = AUTHORING_NODE_BY_ID.get('input.manual-text')!
    const graph = { ...emptyAuthoringGraph(), nodes: [{ id: 'manual', templateId: template.id, templateVersion: 1, title: template.label, x: 0, y: 0, config: { ...defaultConfigForTemplate(template), text: '长篇节点输入' }, inputs: structuredClone(template.inputs), outputs: structuredClone(template.outputs) }] }
    const id = await useNodeFlowStore.getState().createFlow(owner.scope.projectId, null, { graph })
    const saved = await db.nodeFlows.get(id)
    expect(saved?.graphJson).toContain('长篇节点输入')
    await expect(useNodeFlowStore.getState().saveFlow({ ...saved!, name: '长篇节点流程' })).resolves.toBeDefined()
    expect((await db.nodeFlows.get(id))?.name).toBe('长篇节点流程')
  })

  it('exposes the interactive node-authoring mode inside Android longform', async () => {
    const onMode = vi.fn()
    const view = await render(createElement(MemoryRouter, null, createElement(LongformLayout, {
      section: 'workbench', mode: 'steps', onSection: () => {}, onMode, onHome: () => {}, children: '长篇正文',
    })))
    const nodeMode = Array.from(view.querySelectorAll('button')).find(button => button.textContent === '节点创作')
    expect(nodeMode).toBeTruthy()
    await act(async () => nodeMode!.click())
    expect(onMode).toHaveBeenCalledWith('nodes')
  })

  it('hides the retired short-novel node template but keeps longform template creation', async () => {
    const owner = await createLong('节点模板长篇')
    const { default: NodeAuthoringWorkspace } = await import('../../src/components/node-authoring/NodeAuthoringWorkspace')
    const { ToastProvider } = await import('../../src/components/shared/Toast')
    const view = await render(createElement(ToastProvider, null, createElement(NodeAuthoringWorkspace, { project: owner.project, worldGroupId: null })))
    await vi.waitFor(() => expect(view.textContent).toContain('官方起始模板'), { timeout: 20000 })
    expect(view.textContent).toContain('长篇小说')
    expect(view.textContent).not.toContain('短篇小说')
    const longTemplate = Array.from(view.querySelectorAll('button')).find(button => button.textContent?.includes('长篇小说'))
    expect(longTemplate).toBeTruthy()
    await act(async () => longTemplate!.click())
    await vi.waitFor(async () => expect(await db.nodeFlows.count()).toBe(1), { timeout: 10000 })
  }, 30000)

  it('does not narrow other build modes, including legacy Work switching', async () => {
    vi.stubEnv('MODE', 'test')
    for (const id of ['independent.shortform', 'upper.ttrpg', 'upper.text-open-world', 'platform.marketplace'] as const) {
      expect(isProductAvailableInBuild(id, 'production')).toBe(true)
      expect(evaluateProductEntryV1({ productId: id, channel: 'local-development', experimentalOptIn: true }).enterable).toBe(true)
    }
    const owner = await createWorkspace({ name: '网页旧短篇', description: '', genres: [], status: 'drafting', targetWordCount: 10000 }, { kind: 'novel', novelProfile: 'short' })
    await expect(switchActiveWork(owner.project.id!, owner.work.id!)).resolves.toMatchObject({ workId: owner.work.id })
  })

  it('rejects retired creation before any DB write and still creates worlds and longform', async () => {
    for (const options of [{ kind: 'novel', novelProfile: 'short' }, { kind: 'screenplay' }, { kind: 'comic' }, { kind: 'ttrpg' }] as const) {
      await expect(createWorkspace({ name: '不再创建', description: '', genres: [], status: 'drafting', targetWordCount: 10000 }, options)).rejects.toThrow('Android')
    }
    expect(await db.projects.count()).toBe(0)
    expect(await db.worlds.count()).toBe(0)
    expect(await db.works.count()).toBe(0)
    const long = await createLong()
    await expect(createWorldWork(long.project.id!, { title: '旧类型', kind: 'screenplay' })).rejects.toThrow('Android')
    await expect(switchNovelProfile({ projectId: long.project.id!, workId: long.work.id!, profile: 'short', targetWordCount: 10000 })).rejects.toThrow('Android')
    expect((await db.works.get(long.work.id!))?.novelProfile).toBe('long')
    const world = await createWorkspace({ name: '保留世界', description: '', genres: [], status: 'drafting', targetWordCount: 300000 }, { purpose: 'world-engine', kind: 'novel', novelProfile: 'long' })
    expect(world.project.workspacePurpose).toBe('world-engine')
    expect(await db.works.count()).toBe(2)
  })

  it('blocks switching a retained independent-work project to an old retired Work', async () => {
    vi.stubEnv('MODE', 'test')
    const owner = await createWorkspace({ name: '旧作品工作区', description: '', genres: [], status: 'drafting', targetWordCount: 10000 }, { kind: 'novel', novelProfile: 'short' })
    vi.stubEnv('MODE', 'android')
    await expect(switchActiveWork(owner.project.id!, owner.work.id!)).rejects.toThrow('Android')
    expect((await db.projects.get(owner.project.id!))?.activeWorkId).toBe(owner.work.id)
    expect(await db.works.get(owner.work.id!)).toMatchObject({ kind: 'novel', novelProfile: 'short' })
  })

  it('preserves a world root editor even when its active historical Work used a retired type', async () => {
    const owner = await createWorkspace({ name: '旧世界工作区', description: '', genres: [], status: 'drafting', targetWordCount: 10000 }, { purpose: 'world-engine', kind: 'novel', novelProfile: 'long' })
    await db.works.update(owner.work.id!, { kind: 'screenplay', novelProfile: null })
    await expect(switchActiveWork(owner.project.id!, owner.work.id!)).resolves.toMatchObject({ workId: owner.work.id })
    const { useProjectStore } = await import('../../src/stores/project')
    await useProjectStore.getState().loadProjects()
    const { ToastProvider } = await import('../../src/components/shared/Toast')
    const view = await render(createElement(MemoryRouter, { initialEntries: [`/workspace/${owner.project.id}`] },
      createElement(ToastProvider, null, createElement(Routes, null,
        createElement(Route, { path: '/workspace/:projectId', element: createElement(RealWorkspace, { embeddedProjectId: owner.project.id!, embeddedModule: 'world-rules' }) }),
        createElement(Route, { path: '/home/library', element: createElement('p', null, '退役作品库') }),
      ))))
    await vi.waitFor(() => expect(view.querySelector('[data-workspace-ready="world"]')).not.toBeNull(), { timeout: 10000 })
    expect(view.textContent).not.toContain('退役作品库')
    expect(await db.works.get(owner.work.id!)).toMatchObject({ kind: 'screenplay' })
  }, 30000)

  it('preserves retired Work rows in the actual project backup export', async () => {
    vi.stubEnv('MODE', 'test')
    const owner = await createWorkspace({ name: '备份里的旧短篇', description: '', genres: [], status: 'drafting', targetWordCount: 10000 }, { kind: 'novel', novelProfile: 'short' })
    vi.stubEnv('MODE', 'android')
    const backup = await exportProjectJSON(owner.project.id!)
    expect(backup.works).toEqual(expect.arrayContaining([expect.objectContaining({ title: '备份里的旧短篇', kind: 'novel', novelProfile: 'short' })]))
  }, 30000)

  it('preserves retired data for backups without catalog, search or resume access', async () => {
    const current = await createLong()
    const legacy = await createLong('旧作品')
    const oldRow = (await readHomeCatalog()).works.find(row => row.work.id === legacy.work.id)!
    await db.works.update(legacy.work.id!, { novelProfile: 'short', targetWordCount: 10000 })
    const catalog = await readHomeCatalog()
    expect(catalog.works.map(row => row.work.id)).toEqual([current.work.id])
    expect(catalog.projects.some(project => project.id === legacy.project.id)).toBe(true)
    expect(await db.works.get(legacy.work.id!)).toMatchObject({ novelProfile: 'short' })
    const retired = { ...oldRow, work: { ...oldRow.work, novelProfile: 'short' as const, targetWordCount: 10000 } }
    expect(validWorkPath(retired, `/short/editor?project=${legacy.project.id}`)).toBe(false)
    expect(workPath(retired)).toBe('/home/library')
    localStorage.setItem('storyforge.home.resume.v1', JSON.stringify({ workId: legacy.work.id, workCode: legacy.work.code, path: `/short/editor?project=${legacy.project.id}` }))
    expect(readHomeResume(catalog.works)?.row.work.id).toBe(current.work.id)
    await expect(openHomeWork(oldRow)).rejects.toThrow('Android')
    const { searchHome } = await import('../../src/lib/home/search')
    expect((await searchHome('旧作品')).items).toHaveLength(0)
    expect((await readHomeData()).products).toEqual([])
  })

  it('retires old bookmarks and settings returns while retaining world, longform and nodes', () => {
    for (const tab of ['short', 'script', 'comic', 'motion', 'town', 'ttrpg', 'chat', 'avg', 'text-games', 'play', 'community']) {
      expect(retiredHomeDestination(new URLSearchParams({ tab, project: '42', session: '9' })), tab).toBe('/home/library')
    }
    expect(retiredHomeDestination(new URLSearchParams('tab=nodes&project=42'))).toBe('/workspace/42?mode=nodes&module=visual-workflows')
    expect(retiredHomeDestination(new URLSearchParams('tab=worlds&project=42'))).toBe('/world/worlds?project=42')
    expect(retiredHomeDestination(new URLSearchParams('tab=home&legacy=1'))).toBe('/')
    expect(retiredHomeDestination(new URLSearchParams('product=world-engine&project=42'))).toBe('/world/worlds?project=42')
    expect(safeSettingsReturn('/workspace/42?module=chapters-list')).toBe('/workspace/42?module=chapters-list')
    for (const path of ['/play/mist-harbor', '/ttrpg/play?project=1', '/short/editor?project=1']) expect(safeSettingsReturn(path)).toBeNull()
  })

  it('renders only retained navigation, sample categories and result sections', async () => {
    const { PRODUCT_NAVIGATION } = await import('../../src/components/navigation/product-navigation')
    expect(PRODUCT_NAVIGATION.map(item => item.id)).toEqual(['home', 'world', 'long'])
    const { ExampleShelf } = await import('../../src/components/examples/ExampleLibrary')
    const view = await render(createElement(MemoryRouter, null, createElement(ExampleShelf)))
    expect(view.textContent).toContain('长篇')
    for (const label of ['短篇', '剧本', '漫画', 'AVG', '跑团', '小镇']) expect(view.textContent).not.toContain(label)
    await act(async () => root!.render(createElement(HomeResults, { data: { releases: [], products: [], rows: [], works: [] }, open: async () => {}, renderWorkCard: () => null })))
    expect(view.textContent).toContain('已完成的长篇')
    expect(view.textContent).not.toContain('互动产品发布记录')
  })

  it('renders the real Android home without retired types, demos or dead links', async () => {
    const view = await render(createElement(MemoryRouter, null, createElement(RealHomePage)))
    await vi.waitFor(() => expect(view.textContent).toContain('开始我的第一部长篇'))
    for (const label of ['短篇', '剧本', '漫画', '漫剧', 'AVG', '跑团', '小镇', '文字开放世界', '失潮钟声', '断流之夜']) expect(view.textContent).not.toContain(label)
    expect(Array.from(view.querySelectorAll('nav[aria-label="产品导航"] a')).map(link => link.textContent)).toEqual(['首页', '世界引擎', '长篇'])
  })

  it.each(['/short/editor', '/script/source', '/comic/source', '/motion', '/ttrpg', '/town', '/chat', '/avg', '/adventure', '/openworld', '/play/mist-harbor', '/community'])('routes retired deep link %s back to the supported library', async path => {
    const { default: App } = await import('../../src/App')
    const view = await render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)))
    await vi.waitFor(() => expect(view.textContent).toContain('长篇作品库'))
  })

  it.each([['/world', '世界引擎'], ['/long', '长篇创作'], ['/workspace/42', '长篇编辑器'], ['/workshop', '共用插件工具']])('keeps supported route %s reachable', async (path, label) => {
    const { default: App } = await import('../../src/App')
    const view = await render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)))
    await vi.waitFor(() => expect(view.textContent).toContain(label))
  })

  it('renders real world sealing without game handoff controls', async () => {
    const world = await createWorkspace({ name: '世界封存', description: '', genres: [], status: 'drafting', targetWordCount: 300000 }, { purpose: 'world-engine', kind: 'novel', novelProfile: 'long' })
    const handoff = vi.fn()
    const view = await render(createElement(WorldReleasePanel, { projectId: world.project.id!, activeWorkId: world.work.id!, onChanged: async () => {}, onOpenProductProduction: handoff }))
    await vi.waitFor(() => expect(view.textContent).toContain('冻结并封存世界版本'))
    expect(view.textContent).toContain('冻结修订')
    for (const label of ['交给文字冒险', '交给文字开放世界', '交给跑团']) expect(view.textContent).not.toContain(label)
    expect(handoff).not.toHaveBeenCalled()
  })

  it.each(['screenplay', 'text-adventure', 'text-open-world'])('redirects a historical %s workspace without deleting its work or breaking the catalog', async kind => {
    const owner = await createLong('历史退役作品')
    const before = await db.projects.get(owner.project.id!)
    await db.works.update(owner.work.id!, { kind: kind as typeof owner.work.kind, novelProfile: null })
    expect((await readHomeCatalog()).works).toEqual([])
    await expect(switchActiveWork(owner.project.id!, owner.work.id!)).rejects.toThrow('Android')
    expect(await db.projects.get(owner.project.id!)).toEqual(before)
    const { useProjectStore } = await import('../../src/stores/project')
    await useProjectStore.getState().loadProjects()
    const { ToastProvider } = await import('../../src/components/shared/Toast')
    const view = await render(createElement(MemoryRouter, { initialEntries: [`/workspace/${owner.project.id}`] },
      createElement(ToastProvider, null, createElement(Routes, null,
        createElement(Route, { path: '/workspace/:projectId', element: createElement(RealWorkspace) }),
        createElement(Route, { path: '/home/library', element: createElement('p', null, '退役作品已返回长篇库') }),
      ))))
    await vi.waitFor(() => expect(view.textContent).toContain('退役作品已返回长篇库'), { timeout: 10000 })
    expect(await db.works.get(owner.work.id!)).toMatchObject({ kind, title: '历史退役作品' })
  }, 30000)
})
