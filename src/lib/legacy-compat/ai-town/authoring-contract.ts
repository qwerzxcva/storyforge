
export interface AiTownAuthoringDraftV1 {
 id?:number;projectId:number;worldId:number;workId:number;revision:number;settingsJson:string;
 worldReleaseId:number|null;productionId:number|null;selectionJson:string|null;suggestionKey:string|null;preparedRevision:number|null;
  sourcePurpose?: import('../../world-engine/source-purpose-contract').WorldSourcePurposeProofV1;
 conversationJson:string;createdAt:number;updatedAt:number;
}
