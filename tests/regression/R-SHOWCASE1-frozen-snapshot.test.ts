import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('R-SHOWCASE1 示例原文进入冻结 E2E 工作区', () => {
  it('带齐原文并保持基线字节，不复制退役产品媒资', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/serve-e2e-snapshot.mjs'), 'utf8')
    const manifest = source.match(/const snapshotEntries = (\[[\s\S]*?\n\])/)?.[1]
    expect(manifest).toBeDefined()
    const entries = runInNewContext(manifest!) as string[]
    const included = (asset: string) => entries.some(entry => asset === entry || asset.startsWith(`${entry}/`))
    const sourceRoot = 'showcase/longform-sources'
    const examples = readFileSync(resolve(process.cwd(), 'src/components/examples/SourceExamples.tsx'), 'utf8')
    expect(examples).toContain("import.meta.glob('../../../showcase/longform-sources/*.md'")
    // Pin the retained originals to the f4fb04c4 release-adaptation baseline.
    const originals = [
      ['comic-before-rain-stops.md', 5939, 'fc7ac5167dc6262e1700e1c720cd3cdacbebc0d740ff1cf9c4e718e3850b5d7b'],
      ['comic-before-the-gun.md', 4020, '46561c5b38d95dc7298a1b2f23a6bfc491c51fed7f06d218f6c34bf8d7aad087'],
      ['comic-borrowed-flame.md', 3851, '231c185d2f2ba5a6fdf810c6e76cdb8e259bad86360dec29e6d04084dc01f3a2'],
      ['comic-moon-buys-bread.md', 4195, '3ba18292c1e4e374fa5bc8bc44a557ea75a177dfbbc7ffd1c3332b9784cfe6d6'],
      ['screenplay-night-last-stop.md', 10189, '1931fc47f6d0be24e8891e4cd94d120cc834267853983ab8441da69304eaee4e'],
      ['screenplay-one-tael-murder.md', 6303, 'af75e2813c5eb92c0a429810868ce315a621f23bb111158c54d5418030824174'],
      ['screenplay-seven-minute-refund.md', 6292, 'a40769cff0a3097db0cb73e77e7e9fe38b7ebd5c51160b222b69721b7baf894c'],
      ['screenplay-table-zero.md', 6634, '7863dd63c2febf8acb8f2a4dab272f9ef71312e6c16b66535233d0dd73e1ef2c'],
    ] as const
    expect(readdirSync(resolve(process.cwd(), sourceRoot)).filter(file => file.endsWith('.md')).sort())
      .toEqual(originals.map(([file]) => file))
    for (const [file, bytes, sha256] of originals) {
      const asset = `${sourceRoot}/${file}`
      expect(included(asset), asset).toBe(true)
      const original = readFileSync(resolve(process.cwd(), asset))
      expect(original.byteLength, asset).toBe(bytes)
      expect(createHash('sha256').update(original).digest('hex'), asset).toBe(sha256)
    }
    for (const retired of ['showcase/short-novel', 'showcase/screenplay', 'showcase/comic']) {
      expect(entries.some(entry => entry === retired || entry.startsWith(`${retired}/`) || retired.startsWith(`${entry}/`)), retired)
        .toBe(false)
    }
    expect(source).toContain('await mkdir(dirname(snapshotTarget), { recursive: true })')
  })
})
