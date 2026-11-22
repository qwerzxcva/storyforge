import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DataManagementPanel from '../../src/components/data/DataManagementPanel'
import ProjectStorageWorkspacePanel from '../../src/components/settings/ProjectStorageWorkspacePanel'
import * as workspaceProjection from '../../src/lib/memory/workspace-projection'
import * as jsonExport from '../../src/lib/export/json-export'
import * as workspaceOwnership from '../../src/lib/workspace/ownership'
import { useProjectStore } from '../../src/stores/project'
import { db } from '../../src/lib/db/schema'
import { seedCurrentWorkspace } from '../helpers/current-workspace'
import { bindProjectStorageWorkspace } from '../../src/lib/storage/project-storage-workspace'
import { clearProjectFolderHandle, loadFolderHandle, loadProjectFolderHandle, LAST_FOLDER_KEY, workspaceFolderKey } from '../../src/lib/storage/folder-handle-store'

const mocks = vi.hoisted(() => ({
  pick: vi.fn(),
  ensure: vi.fn(async () => true),
  permission: vi.fn(async () => true),
  write: vi.fn(async (..._args: unknown[]) => true),
}))
vi.mock('../../src/components/data/CloudBackupCard', () => ({ default: () => null }))
vi.mock('../../src/components/system/AutoBackupStatusNotice', () => ({ default: () => null }))
vi.mock('../../src/lib/storage/folder-backup', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/lib/storage/folder-backup')>(),
  isFSASupported: () => true,
  pickFolder: mocks.pick,
  ensureFolderPermission: mocks.ensure,
  folderPermissionGranted: mocks.permission,
  writeProjectSnapshotToFolder: mocks.write,
}))

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []
const projects: Array<{ workspaceUid: string }> = []
const folder = (name: string) => ({ name, kind: 'directory' }) as FileSystemDirectoryHandle
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function mount(element: React.ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(element))
  return { host, root }
}
async function click(host: HTMLElement, text: string) {
  const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes(text))
  expect(button, text).toBeDefined()
  await act(async () => button!.click())
}
async function settle(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
  expect(predicate()).toBe(true)
}
async function workspace() {
  await db.open()
  const { project } = await seedCurrentWorkspace('目录隔离')
  projects.push(project)
  return project
}
afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount())
    host.remove()
  }
  for (const project of projects.splice(0)) await clearProjectFolderHandle(project)
  await db.delete()
  vi.restoreAllMocks()
  mocks.pick.mockReset()
  mocks.ensure.mockReset().mockResolvedValue(true)
  mocks.permission.mockReset().mockResolvedValue(true)
  mocks.write.mockReset().mockResolvedValue(true)
  useProjectStore.setState({ currentProjectId: null, projects: [] })
})

describe('MEMORY-STORAGE-2 · 绑定异步隔离', () => {
  it('数据管理从有目录项目切到无目录项目后不能复用旧目录', async () => {
    const a = await workspace()
    const b = await workspace()
    await bindProjectStorageWorkspace(a, folder('仅属于A'))
    const { host, root } = await mount(createElement(DataManagementPanel, { project: a }))
    await settle(() => host.textContent?.includes('仅属于A') === true)
    await act(async () => root.render(createElement(DataManagementPanel, { project: b })))
    await settle(() => host.textContent?.includes('尚未设置项目存储工作区') === true)
    expect(host.textContent).not.toContain('仅属于A')
    expect(Array.from(host.querySelectorAll('button')).some(item => item.textContent?.includes('保存完整 JSON'))).toBe(false)
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('选取目录等待期间切项目，迟到选择不绑定原项目也不回填新项目', async () => {
    const a = await workspace()
    const b = await workspace()
    const selected = deferred<FileSystemDirectoryHandle>()
    mocks.pick.mockReturnValueOnce(selected.promise)
    const { host, root } = await mount(createElement(ProjectStorageWorkspacePanel, { project: a }))
    await click(host, '选择项目文件夹')
    await act(async () => root.render(createElement(ProjectStorageWorkspacePanel, { project: b })))
    await act(async () => selected.resolve(folder('迟到A目录')))
    expect(await loadProjectFolderHandle(a)).toBeNull()
    expect(await loadProjectFolderHandle(b)).toBeNull()
    expect(host.textContent).not.toContain('迟到A目录')
    expect(host.querySelector('button')?.disabled).toBe(false)
  })

  it('初始查权迟到时解绑成功，不得重新显示旧目录', async () => {
    const project = await workspace()
    await bindProjectStorageWorkspace(project, folder('即将解绑'))
    const permission = deferred<boolean>()
    mocks.permission.mockReturnValueOnce(permission.promise)
    const settings = await mount(createElement(ProjectStorageWorkspacePanel, { project }))
    await settle(() => mocks.permission.mock.calls.length === 1)
    const data = await mount(createElement(DataManagementPanel, { project }))
    await settle(() => data.host.textContent?.includes('即将解绑') === true)
    await act(async () => clearProjectFolderHandle(project))
    await act(async () => permission.resolve(true))
    expect(await loadProjectFolderHandle(project)).toBeNull()
    expect(settings.host.textContent).not.toContain('即将解绑')
    expect(data.host.textContent).not.toContain('即将解绑')
  })

  it.each(['切项目', '解绑'])('快照授权等待后%s，迟到授权不能开始写入', async action => {
    const a = await workspace()
    const b = await workspace()
    await bindProjectStorageWorkspace(a, folder('写入前失效'))
    const permission = deferred<boolean>()
    mocks.ensure.mockReturnValueOnce(permission.promise)
    const { host, root } = await mount(createElement(DataManagementPanel, { project: a }))
    await settle(() => host.textContent?.includes('写入前失效') === true)
    await click(host, '保存完整 JSON 快照')
    if (action === '切项目') await act(async () => root.render(createElement(DataManagementPanel, { project: b })))
    else await act(async () => clearProjectFolderHandle(a))
    await act(async () => permission.resolve(true))
    expect(mocks.write).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('快照已保存')
  })

  it('设置重新授权迟到后不能清除新项目的待授权提示', async () => {
    const a = await workspace()
    const b = await workspace()
    await bindProjectStorageWorkspace(a, folder('旧授权目录'))
    await bindProjectStorageWorkspace(b, folder('新授权目录'))
    mocks.permission.mockResolvedValue(false)
    const permission = deferred<boolean>()
    mocks.ensure.mockReturnValueOnce(permission.promise)
    const { host, root } = await mount(createElement(ProjectStorageWorkspacePanel, { project: a }))
    await settle(() => host.textContent?.includes('重新授权') === true)
    await click(host, '重新授权')
    await act(async () => root.render(createElement(ProjectStorageWorkspacePanel, { project: b })))
    await settle(() => host.textContent?.includes('新授权目录') === true)
    await act(async () => permission.resolve(true))
    expect(host.textContent).toContain('需要重新授权')
    expect(host.textContent).not.toContain('权限已恢复')
  })

  it('最近目录键提交故障时项目绑定和缓存一并保持旧值', async () => {
    const project = await workspace()
    await bindProjectStorageWorkspace(project, folder('旧事务目录'))
    const original = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (key === LAST_FOLDER_KEY) throw new DOMException('injected clone failure', 'DataCloneError')
      return original.call(this, value, key)
    })
    await expect(bindProjectStorageWorkspace(project, folder('故障新目录'))).rejects.toThrow('injected')
    expect((await loadProjectFolderHandle(project))?.name).toBe('旧事务目录')
    expect((await loadFolderHandle(LAST_FOLDER_KEY))?.name).toBe('旧事务目录')
    const persisted = await new Promise<{ name: string }>((resolve, reject) => {
      const request = indexedDB.open('storyforge-fsa', 1)
      request.onsuccess = () => {
        const database = request.result
        const read = database.transaction('handles').objectStore('handles').get(workspaceFolderKey(project.workspaceUid))
        read.onsuccess = () => { database.close(); resolve(read.result) }
        read.onerror = () => reject(read.error)
      }
      request.onerror = () => reject(request.error)
    })
    expect(persisted.name).toBe('旧事务目录')
  })
  it('绑定等待openDB期间解绑先提交，迟到绑定不得复活', async () => {
    const project = await workspace()
    await bindProjectStorageWorkspace(project, folder('旧绑定'))
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('storyforge-fsa', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const request = { result: database, onsuccess: null } as unknown as IDBOpenDBRequest
    vi.spyOn(indexedDB, 'open').mockReturnValueOnce(request)
    const binding = bindProjectStorageWorkspace(project, folder('不应复活')).catch(error => error)
    await clearProjectFolderHandle(project)
    request.onsuccess!.call(request, new Event('success'))
    await binding
    expect(await loadProjectFolderHandle(project)).toBeNull()
  })

  it('loadProject等待读取时切B，提交前有效性守卫阻止迟到A覆盖', async () => {
    const a = await workspace()
    const b = await workspace()
    const read = deferred<typeof a>()
    const entered = deferred<void>()
    const original = db.projects.get.bind(db.projects)
    vi.spyOn(db.projects, 'get').mockImplementationOnce((() => {
      entered.resolve()
      return read.promise
    }) as unknown as typeof db.projects.get)
    let current = true
    const loading = useProjectStore.getState().loadProject(a.id!, () => current)
    await entered.promise
    current = false
    useProjectStore.getState().setCurrentProject(b.id!)
    read.resolve(await original(a.id!) as typeof a)
    await loading
    expect(useProjectStore.getState().currentProjectId).toBe(b.id)
    expect(useProjectStore.getState().projects.some(item => item.id === a.id)).toBe(false)
  })

  it('恢复按钮在ownership解析后切B，最终提交守卫阻止迟到回写与导入回调', async () => {
    const a = await workspace()
    const b = await workspace()
    await bindProjectStorageWorkspace(a, folder('恢复目录'))
    vi.spyOn(workspaceProjection, 'restoreWorkspaceFromFolderV1').mockResolvedValue({
      projectId: a.id!, reboundHarnessRunCount: 0,
    } as Awaited<ReturnType<typeof workspaceProjection.restoreWorkspaceFromFolderV1>>)
    const onImported = vi.fn()
    const { host, root } = await mount(createElement(DataManagementPanel, { project: a, onImported }))
    await settle(() => host.textContent?.includes('恢复目录') === true)
    const resolved = await workspaceOwnership.resolveWorkspaceOwnership(a.id!)
    const entered = deferred<void>()
    const read = deferred<typeof resolved>()
    vi.spyOn(workspaceOwnership, 'resolveWorkspaceOwnership').mockImplementationOnce(() => {
      entered.resolve()
      return read.promise
    })
    await click(host, '从工作区恢复浏览器数据')
    await entered.promise
    useProjectStore.getState().setCurrentProject(b.id!)
    await act(async () => root.render(createElement(DataManagementPanel, { project: b, onImported })))
    await act(async () => read.resolve(resolved))
    expect(useProjectStore.getState().currentProjectId).toBe(b.id)
    expect(useProjectStore.getState().projects.some(item => item.id === a.id)).toBe(false)
    expect(onImported).not.toHaveBeenCalled()
  })

  it.each(['export', 'create', 'write', 'close', '有效'])('真实快照流程在%s等待时解绑，不得继续提交', async stage => {
    const project = await workspace()
    const data = await jsonExport.exportProjectJSON(project.id!)
    const gate = deferred<void>()
    const entered = deferred<void>()
    const pause = async (boundary: string) => {
      if (stage === boundary) { entered.resolve(); await gate.promise }
    }
    const stream = {
      write: vi.fn(async () => { await pause('close') }),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    }
    const file = {
      getFile: vi.fn(async () => ({ text: async () => '' })),
      createWritable: vi.fn(async () => { await pause('write'); return stream }),
    }
    const handle = folder('真实写入边界假目录')
    await bindProjectStorageWorkspace(project, handle)
    Object.assign(handle, {
      getFileHandle: vi.fn(async (_name: string, options?: { create?: boolean }) => {
        if (!options?.create) throw new DOMException('missing', 'NotFoundError')
        await pause('create')
        return file
      }),
    })
    vi.spyOn(jsonExport, 'exportProjectJSON').mockImplementationOnce(async () => {
      await pause('export')
      return data
    })
    const actual = await vi.importActual<typeof import('../../src/lib/storage/folder-backup')>('../../src/lib/storage/folder-backup')
    mocks.write.mockImplementation((...args: unknown[]) => actual.writeProjectSnapshotToFolder(...args as Parameters<typeof actual.writeProjectSnapshotToFolder>))
    const { host } = await mount(createElement(DataManagementPanel, { project }))
    await settle(() => host.textContent?.includes(handle.name) === true)
    await click(host, '保存完整 JSON 快照')
    if (stage !== '有效') {
      await entered.promise
      await act(async () => clearProjectFolderHandle(project))
      await act(async () => gate.resolve())
      const result = mocks.write.mock.results[0].value as Promise<boolean>
      await expect(result).rejects.toThrow()
      expect(stream.close).not.toHaveBeenCalled()
      if (stage === 'export') expect(handle.getFileHandle).not.toHaveBeenCalled()
      if (stage === 'create') expect(file.createWritable).not.toHaveBeenCalled()
      if (stage === 'write' || stage === 'close') expect(stream.abort).toHaveBeenCalledOnce()
      if (stage === 'write') expect(stream.write).not.toHaveBeenCalled()
    } else {
      await settle(() => host.textContent?.includes('完整 JSON 快照已保存') === true)
      expect(stream.write).toHaveBeenCalledOnce()
      expect(stream.close).toHaveBeenCalledOnce()
      expect(stream.abort).not.toHaveBeenCalled()
    }
  })

})
