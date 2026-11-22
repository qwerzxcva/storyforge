

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface DataSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  description?: string
  properties?: Record<string, DataSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: DataSchema
  enum?: Json[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  maxItems?: number
}
export type ExtensionOwner = 'world' | 'work'
export interface ExtensionScope {
  readonly projectId: number
  readonly worldId: number | null
  readonly workId: number | null
  readonly ownerKey: string
}
export interface ExtensionManifest {
  format: 1
  api: 1
  id: string
  version: string
  name: string
  description: string
  author: string
  license: string
  kind: 'feature' | 'content' | 'bundle'
  owner: ExtensionOwner
  entry?: string
  dependencies: Record<string, string>
  permissions: ('data' | 'history.read' | 'history.write' | 'ai.history' | 'ai.timeline' | 'ai.tasks' | 'world.publish' | 'product.rules' | 'mcp' | 'network' | 'flows')[]
  networkOrigins: string[]
  views: { id: string; title: string; target: 'workbench' | 'history' | 'story-timeline'; mode: 'add' | 'replace' }[]
  schemas: Record<string, { version: number; schema: DataSchema }>
  provides: string[]
  consumes: string[]
  flows?: ExtensionFlow[]
  aiTasks?: ExtensionAITask[]
  worldSemantics?: ExtensionWorldSemantics[]
  rulePacks?: { id: string; title: string; asset: string }[]
  connectors?: ExtensionConnector[]
  content?: { schemaId: string; key: string; payload: Json }[]
}
/** Endpoint and callable tool names are explicit. Credentials are host session input only. */
export interface ExtensionConnector {
  id: string
  title: string
  url: string
  protocol: '2026-07-28' | 'legacy'
  tools: string[]
}
/** Explicit projection into existing, frozen World Codex semantics. Other plugin data stays private. */
export interface ExtensionWorldSemantics {
  id: string
  title: string
  schemaId: string
  domain: 'origin' | 'natural' | 'humanity'
  titleField: string
  summaryField: string
  descriptionField: string
  fields: string[]
}
/** A task writes one schema-checked, author-confirmed record in its own namespace. */
export interface ExtensionAITask {
  id: string
  title: string
  instruction: string
  outputSchema: string
  contextSources: ('worldview' | 'storyCore' | 'characters' | 'historical' | 'storyTimeline')[]
}
export interface ExtensionRegistrySnapshot {
  version: 1
  profile: ExtensionProfile
  manifest: ExtensionManifest
  taskId: string
  recordKey: string
  expectedRevision: number | null
  hash: string
}
export interface ExtensionFlow {
  id: string
  name: string
  nodes: { id: string; templateId: string; config: Record<string, Json> }[]
  edges: { source: string; target: string; sourcePort: string; targetPort: string }[]
}
export interface ExtensionPackage {
  id?: number
  pluginId: string
  version: string
  digest: string
  manifest: ExtensionManifest
  bytes: ArrayBuffer
  installedAt: number
}
export interface ExtensionProfile extends ExtensionScope {
  id?: number
  pluginId: string
  version: string
  digest: string
  enabled: boolean
  generation: number
  revision: number
  updatedAt: number
}
export interface ExtensionRecord extends ExtensionScope {
  id?: number
  profileId: number
  pluginId: string
  key: string
  schemaId: string
  schemaVersion: number
  generation: number
  revision: number
  payload: Json
  /** Explicit core references; opaque payloads may not carry local DB identities. */
  chapterId: number | null
  historyEventId: number | null
  updatedAt: number
}
export interface ExtensionContract extends ExtensionScope {
  id?: number
  profileId: number
  digest: string
  manifest: ExtensionManifest
  createdAt: number
}
export interface ExtensionOperation extends ExtensionScope {
  id?: number
  profileId: number
  kind: 'enable' | 'disable' | 'migrate' | 'restore-generation'
  fromGeneration: number
  toGeneration: number
  fromDigest: string
  toDigest: string
  detail: string
  createdAt: number
}
