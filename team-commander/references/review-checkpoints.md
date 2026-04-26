# Human Review Checkpoints — Step 4

**两个必须暂停的检查点**：

## 检查点 A — 需求/设计 Review（在 PD 完成后）

> **autonomous_mode**：跳过此暂停点。使用合理默认值并记录决策。

```
⏸️  [检查点 A] 需求与设计文档已生成，请 Review 后继续
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 docs/01-requirements/PRD.md
📄 docs/02-design/DESIGN.md        （UI 项目：VI 规范）
    或
📄 docs/02-design/API-SPEC.md      （纯后端/CLI 项目：接口契约）

Review 要点:
  □ 功能是否与产品定位一致（避免过度设计）
  □ 交互动线 / API 边界是否清晰
  □ {context.projectType} 特有的规范是否已覆盖
  □ Corner Case 是否覆盖
  □ 有无非必要的功能堆砌

确认 → 输入 /team-commander next 继续到架构设计
修改 → 直接修改文档后再执行 /team-commander next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 检查点 B — 架构方案 Review（在架构师完成后）

> **autonomous_mode**：跳过此暂停点。使用合理默认值并记录决策。

```
⏸️  [检查点 B] 技术架构方案已生成，请 Review 后继续
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 docs/03-architecture/ARCHITECTURE.md

Review 要点:
  □ {context.language} / {context.framework} 技术选型是否合理，有无过度设计
  □ 数据库 Schema 类型/索引/外键是否完整（如适用）
  □ API 契约是否清晰（方法、路径、请求/响应格式）（如适用）
  □ 目录结构是否合理，权限划分是否清楚
  □ 核心底层代码是否已由架构师亲自编写
  □ 关键逻辑伪代码是否有注释说明
  □ 是否有幂等性、竞态条件、越权、死路状态等问题

确认 → 输入 /team-commander next 开始编码
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
