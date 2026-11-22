
import { type ChatMediaBindingsV1 } from './media-contract';
export interface ChatMediaSelectionRequestV1 {sourceHash: string; bindings: ChatMediaBindingsV1}
export interface ChatMediaProductionDecisionV1 extends ChatMediaSelectionRequestV1 {buildNumber: number; controlEpoch: number}
