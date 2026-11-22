/* global console, process */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = {
  contract: 'docs/products/LONGFORM-AND-NODE.md',
  charter: 'docs/PROJECT-MASTER-CHARTER.md',
  catalog: 'src/lib/product/product-catalog.ts',
  navigation: 'src/components/navigation/product-navigation.ts',
}
const contents = /** @type {Record<keyof typeof files, string | null>} */ (Object.fromEntries(
  Object.entries(files).map(([name, relative]) => {
    const absolute = path.join(root, relative)
    return [name, fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null]
  }),
))
const failures = []
for (const name of /** @type {(keyof typeof files)[]} */ (Object.keys(files))) {
  if (contents[name] === null) failures.push(`missing ${name}: ${files[name]}`)
}

for (const marker of ['分步骤长篇', '节点模式', '大纲', '正文', '长程']) {
  if (!contents.contract?.includes(marker)) failures.push(`longform contract missing marker: ${marker}`)
}
for (const marker of ['当前只支持长篇小说创作', '节点模式', '世界设定、显式世界派生、共享工程底座']) {
  if (!contents.charter?.includes(marker)) failures.push(`master charter missing current product boundary: ${marker}`)
}
for (const id of ['independent.shortform', 'independent.screenplay', 'independent.comic', 'independent.motion-drama',
  'upper.ttrpg', 'upper.character-interaction', 'upper.ai-town', 'upper.text-adventure', 'upper.avg', 'upper.text-open-world',
  'platform.marketplace']) {
  if (contents.catalog?.includes(`'${id}'`)) failures.push(`retired product remains in catalog: ${id}`)
}
if (!contents.navigation?.includes("{ id: 'long', label: '长篇', path: '/long' }")) {
  failures.push('longform is missing from product navigation')
}
if (contents.navigation?.includes("id: 'world'")) failures.push('world engine must not be a standalone product navigation entry')

if (failures.length) {
  console.error('longform product scope check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('longform product scope check passed: one product surface, shared novel authoring modes')
