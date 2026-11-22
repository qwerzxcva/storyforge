import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const yaml = createRequire(import.meta.url)('js-yaml')
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { directTests, partitionUnits, plan, readUnitShard, runnerBatches, runUnits } from './check-merge-scope.mjs'

const present = () => true

test('runs governed edit admission without a competing file and preserves every selected suite', () => {
  const admission = 'tests/regression/R-SFQA004-product-entry-admission.test.tsx'
  const first = 'tests/regression/R-04-import-atomic-fk.test.ts'
  const second = 'tests/registry/project-tables.test.ts'
  assert.deepEqual(runnerBatches([]), [])
  assert.deepEqual(runnerBatches([first, second]), [[first, second]])
  assert.deepEqual(runnerBatches([admission]), [[admission]])
  assert.deepEqual(runnerBatches([first, admission, second]), [[admission], [first, second]])
})

test('finishes the other selected files when isolated admission fails and keeps the gate red', () => {
  const admission = 'tests/regression/R-SFQA004-product-entry-admission.test.tsx'
  const other = 'tests/registry/project-tables.test.ts'
  /** @type {string[][]} */
  const invocations = []
  const original = new Error('admission timed out')
  assert.throws(() => runUnits([admission, other], ['--maxWorkers=2'], (command, args) => {
    assert.equal(command, 'node_modules/.bin/vitest')
    invocations.push(args)
    if (args.includes(admission)) throw original
  }), error => error instanceof AggregateError && error.errors[0] === original)
  assert.deepEqual(invocations, [admission, other].map(file => [
    'run', '--maxWorkers=2', file,
  ]))
})

test('isolates the governed admission suite in every selection order without losing shard files', () => {
  const admission = 'tests/regression/R-SFQA004-product-entry-admission.test.tsx'
  const first = 'tests/a.test.ts'
  const second = 'tests/b.test.ts'
  /** @param {string[]} files @returns {string[][]} */
  const permutations = files => files.length ? files.flatMap((file, i) =>
    permutations(files.filter((_, j) => i !== j)).map(rest => [file, ...rest])) : [[]]
  for (const files of permutations([admission, first, second])) {
    const batches = runnerBatches(files)
    assert.deepEqual(batches, [[admission], files.filter(file => file === first || file === second)])
    assert.deepEqual(batches.flat().sort(), files.slice().sort())
    assert.equal(new Set(batches.flat()).size, files.length)
  }
  const selected = [admission, ...Array.from({ length: 300 }, (_, i) => `tests/shard-${i}.test.ts`)]
  const groups = partitionUnits(selected)
  const executed = groups.flatMap(group => runnerBatches(group).flat())
  assert.deepEqual(executed.sort(), selected.slice().sort())
  assert.equal(new Set(executed).size, selected.length)
})

test('continues ordinary work after isolated admission fails and preserves every CLI option', () => {
  const admission = 'tests/regression/R-SFQA004-product-entry-admission.test.tsx'
  const other = 'tests/registry/project-tables.test.ts'
  const original = new Error('admission failed')
  /** @type {string[][]} */
  const calls = []
  assert.throws(() => runUnits([other, admission], ['--maxWorkers=2'], (command, args) => {
    assert.equal(command, 'node_modules/.bin/vitest')
    calls.push(args)
    if (args.includes(admission)) throw original
  }), error => error instanceof AggregateError && error.errors[0] === original)
  assert.deepEqual(calls, [admission, other].map(file => ['run', '--maxWorkers=2', file]))
})

test('documentation and workflow-only changes avoid dependency installation', () => {
  assert.equal(plan(['README.md'], present).npm, false)
  const workflow = plan(['.github/workflows/ci.yml'], present)
  assert.equal(workflow.npm, false)
  assert.deepEqual(workflow.nodeTests, ['scripts/quality/check-merge-scope.test.mjs'])
  assert.equal(plan(['website-docs/en/index.md'], present).docs, true)
})

test('changed tests, deleted modules and schema changes have scoped checks', () => {
  const deleted = 'src/lib/old.ts'
  const checks = plan([deleted, 'src/lib/db/schema.ts', 'tests/db/schema.test.ts'], path => path !== deleted)
  assert.deepEqual(checks.units, ['tests/db/schema.test.ts', 'tests/registry/project-tables.test.ts'])
  assert.ok(checks.typeConfigs.includes('tsconfig.json'))
  assert.deepEqual(checks.scripts, ['check:required-tables'])
  assert.equal(checks.npm, true)
})

test('direct consumers use the module path, including aliases and directories', () => {
  const files = ['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts']
  const imports = [['@/lib/project'], ['../src/lib/project/index.js'], ['@/other/project']]
  assert.deepEqual(directTests(['src/lib/project/index.ts'], files, file => imports[files.indexOf(file)]), files.slice(0, 2))
})

test('retained product suites are included in the ordinary scoped PR plan', () => {
  const retained = 'tests/regression/R-ANDROID-focused-product-scope.test.tsx'
  assert.deepEqual(plan([retained], present).units, [retained])
  assert.deepEqual(directTests(['src/lib/product/product-catalog.ts'], [retained],
    () => ['../../src/lib/product/product-catalog']), [retained])
})

test('ordinary PRs only trigger the scoped check and releases retain their tagged entry', () => {
  const data = Object.fromEntries(readdirSync('.github/workflows').filter(file => file.endsWith('.yml'))
    .map(file => [file, yaml.load(readFileSync(`.github/workflows/${file}`, 'utf8')).on]))
  /** @param {string | object} value */
  const events = value => typeof value === 'string' ? [value] : Object.keys(value)
  assert.deepEqual(Object.keys(data).filter(file => events(data[file]).some(e => e === 'pull_request' || e === 'pull_request_target')), ['ci.yml'])
  assert.deepEqual(events(data['ci.yml']), ['pull_request'])
  assert.deepEqual(data['release.yml'].push.tags, ['v*'])
  for (const file of ['clients.yml', 'client-release-upgrade.yml']) assert.ok(events(data[file]).includes('workflow_call'))
})


test('a small selection stays local and wider selections partition every file exactly once', () => {
  assert.deepEqual(partitionUnits([]), [[]])
  assert.deepEqual(partitionUnits(['tests/a.test.ts', 'tests/a.test.ts']), [['tests/a.test.ts']])
  for (const [size, expected] of [[96, 1], [97, 2], [193, 3], [289, 4], [1157, 4]]) {
    const files = Array.from({ length: size }, (_, i) => `tests/regression/case-${i}.test.ts`)
    const groups = partitionUnits([...files, files[0]])
    assert.equal(groups.length, expected)
    assert.deepEqual(groups.flat().sort(), files.slice().sort())
    assert.deepEqual(groups, partitionUnits(files.reverse()))
    assert.ok(Math.max(...groups.map(xs => xs.length)) - Math.min(...groups.map(xs => xs.length)) <= 1)
  }
})

test('a runner reads only its group for the exact checked-out revision and rejects invalid plans', t => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-scope-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'plan.json')
  const one = 'tests/registry/project-tables.test.ts'
  const second = 'tests/regression/R-04-import-atomic-fk.test.ts'
  const head = 'test-head'
  /** @param {string[][]} groups */
  const save = groups => writeFileSync(file, JSON.stringify({ head, groups }))
  save([[one], [second]])
  assert.deepEqual(readUnitShard(file, '0', head), [one])
  assert.deepEqual(readUnitShard(file, '1', head), [second])
  assert.throws(() => readUnitShard(file, '2', head))
  assert.throws(() => readUnitShard(file, '0', 'other'))
  for (const invalid of [[], [[one], []], [[one], [one]], [[one], ['tests/not-a-suite.md']],
    [[one], ['tests/regression/not-present.test.ts']]]) {
    save(invalid)
    assert.throws(() => readUnitShard(file, '0', head))
  }
})

test('only the aggregate publishes Changed files and rejects failed, cancelled or missing work', () => {
  const jobs = yaml.load(readFileSync('.github/workflows/ci.yml', 'utf8')).jobs
  assert.deepEqual(jobs['changed-files'].needs, ['scope', 'unit'])
  assert.match(jobs['changed-files'].if, /always\(\)/)
  assert.match(jobs['changed-files'].name, /Unrelated label.*Changed files/)
  assert.equal(jobs.unit.strategy['fail-fast'], false)
  assert.equal(jobs.unit.needs, 'scope')
  const gate = jobs['changed-files'].steps[0].run
  const steps = /** @type {{run?: string}[]} */ (jobs.unit.steps)
  assert.deepEqual(steps.map(step => step.run).filter(Boolean), ['npm ci --no-audit --no-fund',
    'node scripts/quality/check-merge-scope.mjs --run-shard "$RUNNER_TEMP/changed-files-plan.json" "$PART"'])
  for (const scope of ['success', 'failure', 'cancelled', 'skipped']) {
    for (const shards of ['', '[]', '[0,1]', '[0,1,2]', '[0,1,2,3]']) {
      for (const units of ['success', 'skipped', 'cancelled', 'failure']) {
        const cmd = spawnSync('bash', ['-c', gate], { env: { ...process.env, SCOPE: scope, SHARDS: shards, UNITS: units } })
        assert.equal(cmd.status === 0, scope === 'success' && Boolean(shards)
          && (shards === '[]' ? units === 'skipped' : units === 'success'))
      }
    }
  }
})
