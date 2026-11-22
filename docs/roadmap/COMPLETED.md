# StoryForge 已完成能力索引

> 仅登记当前长篇小说产品及共享底座的已交付能力。历史产品的完成记录不等于当前支持或允许恢复其入口。

## 共享底座

| ID | 能力 | 当前证据 |
|---|---|---|
| BASE-DATA-01 | IndexedDB 与 `PROJECT_TABLES` 生命周期治理 | `src/lib/db`、`src/lib/registry/project-tables.ts`、备份和迁移回归 |
| BASE-REG-01 | AI 上下文、正式写入和表生命周期单一来源 | `src/lib/registry` 与 `check:architecture` |
| BASE-AI-01 | AI 入口机器登记 | `src/lib/agent/ai-entry-registry.json` 与 `check:ai-entry-registry` |
| BASE-HARNESS-01 | durable run、checkpoint、stale、候选采纳和 receipt | `src/lib/agent/run` 与长篇回归 |
| BASE-CTX-01 | Context Gateway 渐进读取、Manifest 与长程检索 | `src/lib/context-gateway` 与长篇规模测试 |
| A-GOV-01 | 当前文档权威与历史归档边界 | `PROJECT-MASTER-CHARTER.md`、`DOCUMENT-AUTHORITY.md`、`check:docs` |
| A-GOV-02 | 长篇产品与节点入口的机器边界 | 产品目录、入口成熟度检查与 `check:architecture` |
| A-GOV-04 | LocalWorkspace、World、Work 的 owner 区分 | `src/lib/workspace`、备份校验与 `check:architecture` |

## 长篇主链

| ID | 能力 | 当前证据 |
|---|---|---|
| B-LF-01 | 分步骤长篇创作入口与 Phase 5 主链 | `/workspace/:projectId` 与长篇端到端回归 |
| B-LF-02 | 世界观、故事、角色等长篇正式写入字段治理 | `FIELD_REGISTRY`、AdoptionSchema 与对应回归 |
| B-LF-03 | 大纲、细纲、正文生成及作者确认 | durable run、候选采纳与 GATE-P3 隔离验证 |
| B-LF-04 | 主支线、角色状态、章后整理与后续演化 | ARC、PROGRESS、FUTURE 与章后回归 |
| B-LF-05 | 原文、事实、摘要、索引和渐进式上下文读取 | Context Gateway、Manifest 与长程回归 |
| B-LF-06 | 10万/30万/100万字符工程规模门 | 长程召回和跨世界/未来隔离回归；不代表文学质量保证 |
| B-NODE-01 | 节点动作复用长篇正式领域动作 | `domain-action-registry.ts`、`domain-execution.ts` 和同源回归 |
| D-WORLD-01 | 长篇世界资料的身份、显式派生和版本封存 | `src/lib/world-engine` 与 World/Work 隔离回归 |

历史产品源码、专项设计和验收记录只用于追溯，不进入当前施工队列；具体归档索引见 `DOCUMENT-AUTHORITY.md`。