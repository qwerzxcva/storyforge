
import type { ProductProductionBriefRecordV1, ProductSourcePlan } from '../../types/index';
import { validateProductSourcePlan } from '../../product/source-contracts';
import { hashProductProductionValueV2 } from './hash';

export async function parseProductProductionSourcePlanV1(
  row: Pick<ProductProductionBriefRecordV1, 'sourcePlanJson' | 'sourcePlanHash' | 'briefJson' | 'briefHash'>,
): Promise<ProductSourcePlan> {
  let value: ProductSourcePlan
  try { value = JSON.parse(row.sourcePlanJson) as ProductSourcePlan }
  catch { throw new Error('[product-production-source] SourcePlan JSON 损坏；必须重新保存 Brief') }
  const plan = await validateProductSourcePlan(value)
  if (plan.planHash !== row.sourcePlanHash) {
    throw new Error('[product-production-source] SourcePlan row/hash 不一致')
  }
  if (plan.version === 2 && (plan.compiler.briefHash !== row.briefHash
    || await hashProductProductionValueV2(JSON.parse(row.briefJson)) !== row.briefHash)) {
    throw new Error('[product-production-source] Brief 内容与精确 SourcePlan 不一致')
  }
  return plan
}
