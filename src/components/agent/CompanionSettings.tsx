import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useCompanionStore } from '../../stores/companion'

export default function CompanionSettings({ onClose }: { onClose: () => void }) {
  const { preferences, update, storageError } = useCompanionStore()
  const dialog = useRef<HTMLDialogElement>(null)
  const portraitInput = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  const [error, setError] = useState('')
  useEffect(() => {
    alive.current = true
    dialog.current?.showModal()
    return () => { alive.current = false }
  }, [])
  async function choosePortrait(file: File | undefined) {
    if (!file) return
    setError('')
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('请选择小于 2 MB 的 PNG、JPG 或 WebP 立绘。')
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('读取图片失败'))
        reader.readAsDataURL(file)
      })
      const picture = new Image()
      picture.src = data
      await picture.decode()
      if (picture.width > 4096 || picture.height > 4096) throw new Error('图片边长不能超过 4096 像素。')
      if (alive.current) update({ portrait: data })
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '读取图片失败，请重试。') }
  }
  return (
    <dialog ref={dialog} className="companion-settings" aria-labelledby="companion-settings-title" onCancel={(e) => { e.preventDefault(); onClose() }}>
      <header>
        <div><h2 id="companion-settings-title">炉娘 · 助手设置</h2><p>熔炉创作助手，陪你构思，按你的决定落笔。</p></div>
        <button type="button" onClick={onClose} aria-label="关闭助手设置" autoFocus><X size={18} /></button>
      </header>
      <div className="companion-settings-body">
        <fieldset>
          <legend>陪伴方式</legend>
          <label className="companion-check"><input type="checkbox" checked={preferences.visible} onChange={(e) => update({ visible: e.target.checked })} />显示原创助手形象</label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => portraitInput.current?.click()}>更换立绘（PNG / JPG / WebP）</button>
            <input ref={portraitInput} className="sr-only" aria-label="选择助手立绘" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { void choosePortrait(e.target.files?.[0]); e.target.value = '' }} />
            {preferences.portrait && <button type="button" onClick={() => update({ portrait: '' })}>恢复炉娘原画</button>}
          </div>
          <p>立绘只保存在此浏览器。自定义图片保留轻微动作；内置原画有四种状态。</p>
        </fieldset>
        {(error || storageError) && <p role="alert" className="text-error">{error || storageError}</p>}
      </div>
      <footer><span>更改即时生效 · 仅此浏览器</span><button type="button" onClick={onClose}>完成</button></footer>
    </dialog>
  )
}
