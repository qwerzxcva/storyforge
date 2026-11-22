# AGENTS.md · StoryForge 开发入口

> 普通任务唯一自动加载的项目文档。先按本文建立关联闭包，再通过
> [`docs/CONTEXT-ROUTING.md`](docs/CONTEXT-ROUTING.md) 按任务读取现行文档片段。
> 项目方向以 [`docs/PROJECT-MASTER-CHARTER.md`](docs/PROJECT-MASTER-CHARTER.md) 为最高权威；
> 未列入 [`docs/DOCUMENT-AUTHORITY.md`](docs/DOCUMENT-AUTHORITY.md) 的旧文档不得作为施工依据。

## 先确定产品边界

StoryForge 当前只支持长篇小说创作。节点模式是同一长篇生产链的另一种操作表达，不是独立产品；世界设定与显式派生是辅助能力，不单独作为产品开放。短篇、改编、漫剧和游戏类产品方案属于停止建设的历史范围；不得恢复其用户入口或新建能力。旧作品类型仅为既有数据迁移、读取、备份与恢复保留。

长篇必须完整覆盖世界观、故事、角色、主支线、大纲、细纲、正文、长程记忆与可靠恢复；节点模式不得复制第二套生成、记忆或数据体系。既有世界版本与派生记录中的 `S1 世界封存`、`S2 产品定向`、`S3 产品执行` 仅是历史数据兼容词汇，不表示当前提供上层产品。`Project` 只保存 LocalWorkspace 稳定身份、用途、活动 World/Work 指针和工作区级开关；作品标题、简介、流派、状态、字数、文风和活动叙事计划只允许存在于 `Work`，禁止镜像、双写、回退读取和导入时展开旧 Project 对象。

开始功能前声明长篇入口、生命周期、数据 owner、交接物及受影响的导入导出与历史恢复路径。边界不清时先补长篇契约，不用代码制造既成事实。

## 守住三注册表

StoryForge 是 React + TypeScript + IndexedDB 的本地优先生产项目。用户手稿主要存在浏览器中，
`main` 直接进入生产部署，没有 staging。任何扩展必须收口到三个单一事实源：

1. `CONTEXT_SOURCES` + `assembleContext()`：AI 读什么。
2. `FIELD_REGISTRY` + `AdoptionSchema` + `adopt()`：AI 可以正式写什么。
3. `PROJECT_TABLES`：表的导出、导入、删除、迁移、作用域和引用重映射生命周期。

动手前依次回答：

1. 入口和用户结果是什么？
2. AI/代码读取哪些来源，是否已登记在 `CONTEXT_SOURCES`？
3. 候选最终写入哪些字段，是否已登记在 `FIELD_REGISTRY` / `AdoptionSchema`？
4. 涉及哪些表，是否由 `PROJECT_TABLES` 派生完整生命周期？
5. 哪些调用方、下游、反例和真实用户路径会受影响？

登记缺失时，先补注册表、契约与测试，再写功能。禁止在组件或 service 中手拼上下文、散写受治理表、手写表清单、复制 AI/DB/导入导出入口。

## 正式 AI 与 Harness

正式模型调用必须进入登记的 Agent Skill / Run Contract / durable Harness，或在 AI 入口注册表中明确标注只读、内存草稿、评测、模拟等有限边界。

- 上下文由注册源、Context Gateway 和渐进式披露选择；固定条数裁剪只能是最终预算保护。
- 模型输出先成为 `CreativeArtifact` 候选；作者确认后才可 `adopt()`。
- durable run 保存 contract、manifest、事件、checkpoint、stale 证据、repair 与终态 receipt。
- 重试必须有界且可见；授权、余额、非重试型 4xx、结果未知或 stale 不得隐藏重发。
- 可验证的 schema、事务、作用域、版本、权限、预算和状态机不得只写进提示词。

## 任务开始方式

1. 查看 `git status --short --branch` 及相关提交，保护现有改动。
2. 用 `rg` 定位入口、符号、调用方、三注册表行、schema/migration 与测试，建立“入口 → 读取 → 候选/写回 → 生命周期 → 下游 → 测试”的关联闭包。
3. 按 `docs/CONTEXT-ROUTING.md` 读取现行片段；总纲协同见 `docs/COLLAB-WORKFLOW.md` §2.2，本地 API 见 `docs/LOCAL-API-CONFIG.md`，真实配置必须在仓库外。
4. 新体系或完整功能先核对当前能力基线与路线图；复用已经存在的基础设施，不按旧任务标题重复开发。
5. 在独立短期分支工作，使用 `feat/`、`fix/` 或 `refactor/`；不得直接 push `main`。长篇和节点涉及共享数据、三注册表、WorldRelease provider 或锁文件时，先在同一分支完成并验证公共改动，再做具体功能；Git 无冲突不等于契约兼容。

## 数据与发布红线

- schema、迁移、删除、合并、导入导出、引用重映射必须有正反例；涉及真实用户数据时，用隔离测试项目完成往返或生命周期验证。
- 新表先登记 `PROJECT_TABLES`，新 AI 可写字段先登记 `FIELD_REGISTRY`，新上下文源先登记 `CONTEXT_SOURCES`。
- 新入口取代旧入口时同步下线旧入口；半成品必须标为实验性并默认隐藏。
- 世界引擎与上层产品之间只允许显式、版本化读取；上层运行数据和媒资不得落入世界引擎。
- `S2 产品定向`的设置属于具体产品，不能建立全产品万能配置表；`S3 产品执行`的正式生产必须有用户开始授权、产品 Brief 和冻结 SourcePlan，正式运行必须绑定不可变 ProductRelease。
- 五种跨阶段交接物是逻辑契约而非五张万能表：主 Agent 可起草 Brief/SourcePlan；WorldReference、实际 SourceManifest 和 release lineage 必须由确定性系统按真实版本与运行证据生成、校验和冻结。
- 不确定是否丢数据、迁移失败、文档与代码无法裁决或关键反例失败时停止扩大改动，保留证据并请求决策。
- 不运行破坏性 Git/文件命令，不覆盖无关改动，不使用 `npm audit fix --force`。

## 验证与完成

普通 PR 按 `docs/COLLAB-WORKFLOW.md` §6 在实际合并差异上验证。检查受影响功能、直接调用方和关联数据生命周期，在 PR 写明定向非浏览器检查及结果。迁移、备份、恢复和 AI 正式写回须验证相应正反例。独立修复通过后普通合并并回读远端提交。

完成修复时核实产品主路径、失败恢复和受影响下游的实际结果。交付证据绑定具体提交。

完整发行通过发行工作流执行 `npm run ci` 和对应平台验收，专项浏览器、跑团预览和媒资验证在明确需要时手动发起。
