/**
 * Product-neutral public runtime boundary.
 *
 * Product code must import its own domain runtime API. This module is reserved
 * for shared infrastructure that deals only with session/event/checkpoint
 * mechanics and never issues a product-specific command.
 */
export { applyProductRuntimeEvent, hashProductRuntimeStateV1, parseProductRuntimeState, replayProductRuntimeEvents } from './runtime-core';
