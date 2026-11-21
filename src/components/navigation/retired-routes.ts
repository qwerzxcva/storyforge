/** Bookmarks remain readable, but can never select a retired application shell. */
export function retiredHomeDestination(params: URLSearchParams): string | null {
  const tab = params.get('tab')
  const product = params.get('product')
  if (!params.has('tab') && !params.has('product') && !params.has('legacy')) return null
  if (tab === 'home' || (!tab && !product)) return '/'
  const project = params.get('project')
  if (tab === 'worlds' || tab === 'world' || product === 'world-engine') {
    return `/world/worlds${project ? `?project=${encodeURIComponent(project)}` : ''}`
  }
  if (tab === 'novel' || tab === 'nodes') {
    const next = new URLSearchParams(params)
    for (const key of ['tab', 'legacy', 'product', 'project']) next.delete(key)
    if (tab === 'nodes') {
      next.set('mode', 'nodes')
      next.set('module', 'visual-workflows')
    }
    return `${project ? `/workspace/${encodeURIComponent(project)}` : '/long'}${next.size ? `?${next}` : ''}`
  }
  return '/home/library'
}

/** Only same-application return paths; never accept an external redirect. */
export function safeSettingsReturn(value: string | null): string | null {
  if (!value || !/^\/(?:long|world|home|workspace)(?:[/?][^#]*)?$/.test(value)
    || /[\\\r\n]/.test(value) || value.includes('..')) return null
  return value
}
