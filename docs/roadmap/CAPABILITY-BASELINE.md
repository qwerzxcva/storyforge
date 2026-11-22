# StoryForge 当前能力基线

> 当前用户产品仅为长篇小说。本文只记录长篇主链、节点模式和保障其工作的共享基础；其他独立产品不属于当前能力承诺。

## 状态定义

- `implemented`：声明范围已实现，并有当前自动验证。
- `partial`：有真实代码，但完整体验或生命周期仍有缺口。
- `missing`：长篇边界内要求但尚无可用实现。
- `experimental`：需明确启用，不是生产主路径。

## 共享底座

| ID | 状态 | 当前事实 | 约束 |
|---|---|---|---|
| BASE-DATA-01 | implemented | IndexedDB schema、`PROJECT_TABLES`、备份版本和迁移工具提供长篇数据生命周期 | 新表必须登记；迁移需版本化、可拒绝且有回滚反例 |
| BASE-REG-01 | implemented | Context、Field/Adoption、Project Tables 三注册表统一 AI 读取、正式写入和表生命周期 | 新入口先登记，不在组件散写上下文或表清单 |
| BASE-AI-01 | implemented | AI 入口注册表区分正式创作、辅助和评测入口 | 登记边界不等于文学质量已验收 |
| BASE-HARNESS-01 | implemented | Run Contract、ledger、checkpoint、stale、候选采纳与 receipt 支持长篇流程 | 失败、结果未知和恢复均须可见且有界 |
| BASE-CTX-01 | implemented | Context Gateway、Manifest、渐进披露、长程检索和规模夹具服务于长篇 | 未读来源不可伪装为不存在；真实作者长期质量仍需观察 |

## 长篇与节点

| ID | 状态 | 当前事实 | 缺口 |
|---|---|---|---|
| B-LF-01 | implemented | `/workspace/:projectId` 提供分步骤长篇入口与成熟主链 | 仅做长篇的维护、缺陷修复和质量增量 |
| B-LF-02 | implemented | 世界、故事、角色、主支线、大纲、细纲和正文纳入现有注册表 | 新字段须同步 schema、Skill、Gateway 和回归 |
| B-LF-03 | implemented | 长篇正式生成、候选、stale、作者采纳、章后演化和恢复链已建立 | 持续修复真实缺陷，不把模型输出质量视为固定保证 |
| B-LF-04 | implemented | 主支线、角色状态、章后整理和只向未来演化共用长篇数据 | 新体验增量仍需验证 owner、保存和恢复 |
| B-LF-05 | implemented | 原文、事实、摘要、索引和长尾召回通过 Context Gateway 渐进读取 | 文学语义判断仍有人机协作边界 |
| B-LF-06 | implemented | 10万/30万/100万字符工程规模和跨章召回具有自动验证 | 该门不等同长期文学一致性认证 |
| B-LF-Q | partial | 长篇写作质量研究在现有主链上增量进行 | 每项改进需绑定可验证作者问题和样本 |
| B-LF-STAB | partial | 长篇保存、刷新、恢复、导出及客户端发行持续维护 | 按现行路线逐入口补齐故障证据 |
| B-NODE-01 | implemented | 官方节点 action 通过登记 binding 调用长篇正式领域动作 | 不允许节点建立第二套正式写入路径 |
| B-NODE-02 | partial | 节点工作流与长篇 Work/Skill/Adoption/Harness 共用底座 | 全模板跨模式用户路径和生命周期仍需完整验收 |

## 世界辅助数据

| ID | 状态 | 当前事实 | 限制 |
|---|---|---|---|
| D-WORLD-01 | implemented | World/Work 身份、作者显式派生、revision 和不可变世界版本用于长篇世界资料 | World 不是独立产品，不向其提供独立发行目标 |
| D-WORLD-02 | partial | 版本化世界读取协议可供长篇显式派生流程读取 | 不建设上层游戏产品 adapter 或生产链 |
| D-WORLD-03 | implemented | 长篇已确认内容可显式派生，并保留来源和跨作品隔离 | 派生不自动同步回长篇；旧作品仍可读取 |
| D-WORLD-04 | implemented | 世界封存只携带语义数据，不携带其他产品运行时或媒资 | 新变更不得重开已退役的衍生产品能力 |

## 兼容边界

短篇、剧本、漫画、漫剧和游戏产品不列入当前能力承诺，不得以实验、预览或历史测试入口重新开放。既有 WorkKind、旧产品记录和备份载荷只作为迁移、只读、导入导出、归档恢复所需的兼容数据；保留这些值不代表允许创建或执行该类作品。下线功能时必须保留长篇作品数据、owner、恢复和导出路径。
