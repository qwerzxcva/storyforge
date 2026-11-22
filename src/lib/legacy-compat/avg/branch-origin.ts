import { hashProductProductionValueV2 as hash, isSha256Hash } from '../product-production/hash';
import { avgRecord } from './protocol-validation';

/** Absence retains legacy parent-pointer policy. A present record is never
 * ignored, even when the parent still exists or the stored head looks valid. */
export async function verifyAvgBranchOriginV1(input:{canonSnapshotJson:string;initialState:unknown;runtimeSourceHash:string}):Promise<boolean>{
  let canon:unknown
  try{canon=JSON.parse(input.canonSnapshotJson)}catch{throw new Error('[avg-branch-origin] 会话来源 JSON 损坏')}
  if(!canon||typeof canon!=='object'||Array.isArray(canon))throw new Error('[avg-branch-origin] 会话来源不是对象')
  if(!Object.prototype.hasOwnProperty.call(canon,'avgBranchOrigin'))return false
  const row=avgRecord((canon as Record<string,unknown>).avgBranchOrigin,
    ['schema','version','runtimeSourceHash','initialStateHash','parentInitialStateHash','parentEventPrefixHash','parentThroughSequence','receiptHash'],'AVG branch origin')
  const {receiptHash,...body}=row
  if(row.schema!=='storyforge.avg.branch-origin'||row.version!==1||!isSha256Hash(row.runtimeSourceHash)
    ||!isSha256Hash(row.initialStateHash)||!isSha256Hash(row.parentInitialStateHash)||!isSha256Hash(row.parentEventPrefixHash)||!isSha256Hash(receiptHash)
    ||!Number.isSafeInteger(row.parentThroughSequence)||(row.parentThroughSequence as number)<0
    ||!input.initialState||typeof input.initialState!=='object'||(input.initialState as {lastSequence?:unknown}).lastSequence!==0
    ||row.runtimeSourceHash!==input.runtimeSourceHash||row.initialStateHash!==await hash(input.initialState)||receiptHash!==await hash(body))
    throw new Error('[avg-branch-origin] 分支记录、初态或冻结来源不一致')
  return true
}
