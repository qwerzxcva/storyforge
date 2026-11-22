/* global console, process */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = Object.fromEntries(['docs/ROADMAP.md', 'docs/PROJECT-MASTER-CHARTER.md', 'docs/DOCUMENT-AUTHORITY.md',
  'docs/roadmap/README.md', 'docs/roadmap/CAPABILITY-BASELINE.md', 'docs/roadmap/COMPLETED.md']
  .map(file => [file, path.join(root, file)]))
const failures = []
const docs = Object.fromEntries(Object.entries(files).map(([name, file]) => {
  try { return [name, fs.readFileSync(file, 'utf8')] }
  catch {
    failures.push(`missing ${name}`)
    return [name, '']
  }
}))
const current = docs['docs/roadmap/README.md']
const baseline = docs['docs/roadmap/CAPABILITY-BASELINE.md']
const completed = docs['docs/roadmap/COMPLETED.md']
const activeTasks = new Map([
  ['B-LF-Q', 'IN_PROGRESS'],
  ['B-LF-STAB', 'IN_PROGRESS'],
  ['B-NODE-02', 'QUEUED'],
])
const completedCapabilities = ['BASE-DATA-01', 'BASE-REG-01', 'BASE-HARNESS-01', 'B-LF-01', 'B-LF-06', 'B-NODE-01', 'D-WORLD-01']
const currentTaskRows = current.split('\\n').filter(line => /^\\| [A-Z]/.test(line))

for (const [task, status] of activeTasks) {
  const row = currentTaskRows.find(line => line.includes(`| ${task} |`)) ?? ''
  if (!row) failures.push(`current longform roadmap missing task row: ${task}`)
  else if (!row.includes(`| ${status} |`)) failures.push(`${task} must be ${status} in the current roadmap`)
  if (completedCapabilities.includes(task)) failures.push(`${task} cannot be both active and completed`)
}
for (const id of completedCapabilities) {
  if (currentTaskRows.some(line => line.includes(`| ${id} |`))) failures.push(`completed capability returned to active roadmap: ${id}`)
}
for (const id of completedCapabilities) {
  if (!baseline.includes(id)) failures.push(`capability baseline missing retained capability: ${id}`)
  if (!completed.includes(id)) failures.push(`completed index missing retained capability: ${id}`)
}
for (const [needle, label] of [
  ['./PROJECT-MASTER-CHARTER.md', 'master charter'],
  ['./roadmap/README.md', 'current roadmap'],
  ['./roadmap/CAPABILITY-BASELINE.md', 'capability baseline'],
  ['./roadmap/COMPLETED.md', 'completed index'],
]) {
  if (!docs['docs/ROADMAP.md'].includes(needle)) failures.push(`docs/ROADMAP.md missing link to ${label}`)
}
for (const [name, source] of Object.entries({ current, baseline })) {
  if (/\b(C-SHORT-01|C-SCREENPLAY-01|C-COMIC-01|C-MOTION-DRAMA-01|E-TTRPG-01|E-CHAT-01|E-TOWN-01|E-TEXTADV-01|E-AVG-01|E-OPENWORLD-01|F-PLATFORM-01|F-COMMERCIAL-01)\b/.test(source)) {
    failures.push(`${name} still advertises a retired non-longform capability`)
  }
}
for (const [name, file] of Object.entries(files)) {
  const markdownLink = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const match of docs[name].matchAll(markdownLink)) {
    const target = match[1]
    if (/^(?:https?:|mailto:|#)/.test(target)) continue
    const clean = target.split('#')[0]
    if (clean && !fs.existsSync(path.resolve(path.dirname(file), clean))) {
      failures.push(`broken roadmap link: ${path.relative(root, file)} -> ${target}`)
    }
  }
}
if (!docs['docs/PROJECT-MASTER-CHARTER.md'].includes('当前只支持长篇小说创作')) {
  failures.push('master charter missing the longform-only product boundary')
}
if (!docs['docs/DOCUMENT-AUTHORITY.md'].includes('docs/roadmap/CAPABILITY-BASELINE.md')) {
  failures.push('document authority does not register the capability baseline')
}

if (failures.length) {
  console.error('roadmap check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`roadmap check passed: ${activeTasks.size} active longform tasks and ${completedCapabilities.length} retained capabilities`)
