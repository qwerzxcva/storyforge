/** Author-owned pending-release intent, independent of runtime continuation authority. */
import type { TtrpgOpenAuthoringV1, TtrpgSituationTemplateV1, TtrpgPredicateV1, TtrpgOpenEffectPlanTemplateV1, TtrpgOpenEffectPrimitiveV1 } from './open-contract';
import { stableProductRuntimeJsonV1 as stable } from '../product/runtime-values';
import * as p from './open-contract-parse'

export const TTRPG_COMPATIBLE_OPENING_AUTHORED_TASKS_V1 = ['ttrpg.open.source-facts', 'ttrpg.open.rule-system', 'ttrpg.open.situation-layer'] as const

export interface TtrpgCompatibleOpeningRevisionV1 {
  schema: 'storyforge.ttrpg-compatible-opening-revision'; version: 1
  baseReleaseHash: string; baseRuntimeSourceHash: string; baseContentHash: string
  appendedTemplateKeys: string[]
}
export interface TtrpgCompatibleOpeningRevisionV2 extends Omit<TtrpgCompatibleOpeningRevisionV1, 'version'> {
  version: 2
  appendedEffectPlanKeys: string[]
}
export type TtrpgCompatibleOpeningRevision = TtrpgCompatibleOpeningRevisionV1 | TtrpgCompatibleOpeningRevisionV2
export function parseTtrpgCompatibleOpeningRevisionV1(value: unknown): TtrpgCompatibleOpeningRevisionV1 {
  const r = p.record(value, ['schema', 'version', 'baseReleaseHash', 'baseRuntimeSourceHash', 'baseContentHash', 'appendedTemplateKeys'], 'compatible opening revision')
  const keys = p.keys(r.appendedTemplateKeys, 'new opening templates', 1000, 1); p.unique(keys, 'new opening templates')
  return { schema: p.literal(r.schema, 'storyforge.ttrpg-compatible-opening-revision', 'opening revision schema'),
    version: p.literal(r.version, 1, 'opening revision version'), baseReleaseHash: p.hash(r.baseReleaseHash, 'opening base release'),
    baseRuntimeSourceHash: p.hash(r.baseRuntimeSourceHash, 'opening base source'), baseContentHash: p.hash(r.baseContentHash, 'opening base content'), appendedTemplateKeys: keys }
}
export function parseTtrpgCompatibleOpeningRevision(value: unknown): TtrpgCompatibleOpeningRevision {
  const raw = p.object(value, 'compatible opening revision')
  if (raw.version === 1) return parseTtrpgCompatibleOpeningRevisionV1(value)
  const r = p.record(raw, ['schema', 'version', 'baseReleaseHash', 'baseRuntimeSourceHash', 'baseContentHash', 'appendedTemplateKeys', 'appendedEffectPlanKeys'], 'compatible opening revision')
  p.literal(r.version, 2, 'opening revision version')
  const { appendedEffectPlanKeys: effects, ...base } = r
  return { ...parseTtrpgCompatibleOpeningRevisionV1({ ...base, version: 1 }), version: 2,
    appendedEffectPlanKeys: p.unique(p.keys(effects, 'new opening effect plans', 1000, 1), 'new opening effect plans') }
}

type OpeningEffects = Pick<TtrpgOpenAuthoringV1, 'situationTemplates' | 'effectPlanTemplates'>
type Evidence = TtrpgSituationTemplateV1['evidence'][number]
const discoverySlots = ['costEffectPlanRef', 'failForwardEffectPlanRef'] as const
const planEffects = (plan: TtrpgOpenEffectPlanTemplateV1) => [...plan.effects, ...plan.alternatives.flatMap(a => a.effects)]
const localPlanKey = (templateKey: string, index: number) => p.key(`${templateKey}.plan.${index + 1}`, 'new discovery plan')

/** Only a discovery's own local clue can be granted; recipients remain runtime-validated. */
function assertLocalKnowledge(plan: TtrpgOpenEffectPlanTemplateV1, evidence: Evidence): void {
  if (planEffects(plan).some(effect => effect.family === 'knowledge' && effect.evidenceRef !== evidence.clueRef)) {
    p.fail('复制的知识后果必须绑定本局势中该线索的明确发现路径')
  }
}
function copyDiscoveryPlan(plan: TtrpgOpenEffectPlanTemplateV1, index: number, templateKey: string,
  clues: Map<string, string>): TtrpgOpenEffectPlanTemplateV1 {
  const planKey = localPlanKey(templateKey, index)
  let serial = 0
  const copyEffect = (effect: TtrpgOpenEffectPrimitiveV1): TtrpgOpenEffectPrimitiveV1 => {
    const effectKey = p.key(`${planKey}.effect.${++serial}`, 'new discovery effect')
    if (effect.family !== 'knowledge') return { ...structuredClone(effect), effectKey }
    const evidenceRef = clues.get(effect.evidenceRef) ?? p.fail('复制的知识后果引用了非本局势线索')
    return { ...effect, effectKey, evidenceRef }
  }
  return { ...structuredClone(plan), planKey, effects: plan.effects.map(copyEffect), alternatives: plan.alternatives.map((alternative, i) => ({
    ...structuredClone(alternative), alternativeKey: p.key(`${planKey}.alternative.${i + 1}`, 'new discovery alternative'), effects: alternative.effects.map(copyEffect),
  })) }
}

/** Copies only local knowledge plans; costs and unrelated published plans stay intact. */
export function cloneTtrpgCompatibleOpeningTemplateWithEffectsV2(input: {
  original: TtrpgSituationTemplateV1; effectPlanTemplates: TtrpgOpenEffectPlanTemplateV1[]; templateKey: string; title: string
}): { template: TtrpgSituationTemplateV1; effectPlanTemplates: TtrpgOpenEffectPlanTemplateV1[] } {
  const { original, effectPlanTemplates, templateKey, title } = input
  p.unique(effectPlanTemplates.map(plan => plan.planKey), 'original discovery plans')
  const template = cloneTtrpgCompatibleOpeningTemplateV1(original, templateKey, title)
  const clues = new Map(original.evidence.map((evidence, i) => [evidence.clueRef, template.evidence[i].clueRef]))
  const copied = new Map<string, TtrpgOpenEffectPlanTemplateV1>()
  for (const [i, evidence] of original.evidence.entries()) for (const slot of discoverySlots) {
    const ref = evidence.discoveryPolicy[slot]
    if (ref === null) continue
    const index = effectPlanTemplates.findIndex(plan => plan.planKey === ref)
    const plan = effectPlanTemplates[index] ?? p.fail('复制的发现路径引用了缺失后果模板')
    assertLocalKnowledge(plan, evidence)
    if (!planEffects(plan).some(effect => effect.family === 'knowledge')) continue
    const copy = copied.get(ref) ?? copyDiscoveryPlan(plan, index, templateKey, clues)
    if (effectPlanTemplates.some(existing => existing.planKey === copy.planKey)) p.fail('复制的新知识后果身份已存在')
    copied.set(ref, copy); template.evidence[i].discoveryPolicy[slot] = copy.planKey
  }
  for (const ref of [original.noInterventionOutcome.effectPlanRef, ...original.consequences.map(c => c.effectPlanRef)]) {
    if (ref !== null && effectPlanTemplates.some(plan => plan.planKey === ref && planEffects(plan).some(effect => effect.family === 'knowledge'))) {
      p.fail('复制的知识后果只能用于明确的线索发现路径')
    }
  }
  return { template, effectPlanTemplates: [...copied.values()] }
}

/** Append-only mechanical extension: exact old plans plus actually used local clue copies. */
export function appendedTtrpgCompatibleOpeningEffectPlanKeysV2(base: OpeningEffects, next: OpeningEffects): string[] {
  p.unique(next.effectPlanTemplates.map(plan => plan.planKey), 'new opening effect plans')
  if (stable(next.effectPlanTemplates.slice(0, base.effectPlanTemplates.length)) !== stable(base.effectPlanTemplates)) {
    p.fail('兼容开局必须完整保留已发布的原后果模板及顺序')
  }
  const added = next.effectPlanTemplates.slice(base.effectPlanTemplates.length)
  const oldKeys = new Set(base.situationTemplates.map(template => template.templateKey))
  const templates = next.situationTemplates.filter(template => !oldKeys.has(template.templateKey))
  for (const plan of added) {
    if (templates.some(template => template.noInterventionOutcome.effectPlanRef === plan.planKey || template.consequences.some(c => c.effectPlanRef === plan.planKey))) {
      p.fail('兼容开局的新知识后果只能用于线索发现路径')
    }
    const uses = templates.flatMap(template => template.evidence.flatMap(evidence => discoverySlots
      .filter(slot => evidence.discoveryPolicy[slot] === plan.planKey).map(slot => ({ template, evidence, slot }))))
    if (!uses.length) p.fail('兼容开局不得追加未使用的后果模板')
    for (const use of uses) {
      assertLocalKnowledge(plan, use.evidence)
      const matching = base.situationTemplates.some(original => {
        if (!original.evidence.some(evidence => evidence.discoveryPolicy[use.slot] !== null)) return false
        let expected: ReturnType<typeof cloneTtrpgCompatibleOpeningTemplateWithEffectsV2>
        try { expected = cloneTtrpgCompatibleOpeningTemplateWithEffectsV2({ original, effectPlanTemplates: base.effectPlanTemplates,
          templateKey: use.template.templateKey, title: use.template.title }) } catch { return false }
        const evidence = expected.template.evidence.find(evidence => evidence.clueRef === use.evidence.clueRef)
        return evidence?.discoveryPolicy[use.slot] === plan.planKey
          && stable(evidence.discoveryPolicy) === stable(use.evidence.discoveryPolicy)
          && stable(expected.effectPlanTemplates.find(candidate => candidate.planKey === plan.planKey)) === stable(plan)
      })
      if (!matching) p.fail('兼容开局只能追加保留原机械、权限及发现路径的本地知识后果副本')
    }
  }
  return added.map(plan => plan.planKey)
}

/** New local identities preserve the copied graph without colliding with published evidence. */
export function cloneTtrpgCompatibleOpeningTemplateV1(original: TtrpgSituationTemplateV1, templateKey: string, title: string): TtrpgSituationTemplateV1 {
  p.key(templateKey, 'new opening template'); p.text(title, 'new opening title', 300)
  if (templateKey === original.templateKey) p.fail('复制的新开局必须有独立身份')
  const obstacles = new Map(original.obstacles.map((o, i) => [o.obstacleKey, p.key(`${templateKey}.obstacle.${i + 1}`, 'new obstacle')]))
  const points = new Map(original.interventionPoints.map((o, i) => [o.pointKey, p.key(`${templateKey}.point.${i + 1}`, 'new point')]))
  const clues = new Map(original.evidence.map((o, i) => [o.clueRef, p.key(`${templateKey}.evidence.${i + 1}`, 'new evidence')]))
  const predicate = (value: TtrpgPredicateV1): TtrpgPredicateV1 => value.op === 'all' || value.op === 'any' ? { ...value, of: value.of.map(predicate) }
    : value.op === 'not' ? { ...value, of: predicate(value.of) }
      : value.op === 'evidence-known-by' ? { ...value, clueRef: clues.get(value.clueRef) ?? value.clueRef } : structuredClone(value)
  const next = structuredClone(original)
  return { ...next, templateKey, title, preconditions: next.preconditions.map(predicate),
    obstacles: next.obstacles.map(o => ({ ...o, obstacleKey: obstacles.get(o.obstacleKey)!, predicate: predicate(o.predicate), dependsOn: o.dependsOn.map(k => obstacles.get(k)!) })),
    interventionPoints: next.interventionPoints.map(o => ({ ...o, pointKey: points.get(o.pointKey)!, targetsObstacleKeys: o.targetsObstacleKeys.map(k => obstacles.get(k)!),
      requiresPredicate: o.requiresPredicate === null ? null : predicate(o.requiresPredicate) })),
    evidence: next.evidence.map(e => ({ ...e, clueRef: clues.get(e.clueRef)!, coversObstacleKeys: e.coversObstacleKeys.map(k => obstacles.get(k)!),
      discoveryPolicy: { ...e.discoveryPolicy, preconditions: e.discoveryPolicy.preconditions.map(predicate), paths: e.discoveryPolicy.paths.map(path => ({ ...path, interventionPointKey: points.get(path.interventionPointKey)! })) } })) }
}
