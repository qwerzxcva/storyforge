import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const app = await readFile(resolve(repositoryRoot, 'src/App.tsx'), 'utf8')
const retiredRoutes = await readFile(resolve(repositoryRoot, 'src/components/navigation/retired-routes.ts'), 'utf8')
const catalog = await readFile(resolve(repositoryRoot, 'src/lib/product/product-catalog.ts'), 'utf8')
const regression = await readFile(resolve(repositoryRoot, 'tests/regression/R-UI-FOUNDATION-retired-routes.test.ts'), 'utf8')

for (const route of [
  '<Route path="/home/:pageId?"',
  '<Route path="/" element={<Suspense fallback={<RouteFallback />}><HomeRoute /></Suspense>}',
  '<Route path="/world/:pageId?"',
  '<Route path="/long"',
  '<Route path="/workspace/:projectId"',
  '<Route path="*"',
]) {
  if (!app.includes(route)) throw new Error(`现行 StoryForge 路由缺少受支持入口或未知页回退:${route}`)
}
for (const route of ['ttrpg', 'town', 'chat', 'openworld']) {
  if (app.includes(`path="/${route}`)) throw new Error(`退役产品路由不得重新注册:${route}`)
}

for (const currentProduct of ["'independent.longform'", "'authoring.nodes'"]) {
  if (!catalog.includes(currentProduct)) throw new Error(`现行长篇产品目录缺少身份:${currentProduct}`)
}
for (const retiredProduct of ["'independent.short'", "'upper.ttrpg'"] ) {
  if (catalog.includes(retiredProduct)) throw new Error(`产品目录不得复活退役身份:${retiredProduct}`)
}
if (!retiredRoutes.includes("return '/home/library'")) {
  throw new Error('不支持的历史 Home 深链必须回退到作品库')
}
const bookmarkEvidence = 'retained world and nodes bookmarks preserve parameters while retired products return to the library'
if (!regression.includes(bookmarkEvidence)) throw new Error('退役路由必须保留历史深链兼容回归证据')

console.log('Current Longform/World routes remain registered; retired product routes fall back to the library.')
