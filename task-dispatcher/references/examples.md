# 分解示例

## 示例 1：混合工作负载

用户说：「修复这个 bug，然后告诉我 Cloudflare 的免费额度是多少，然后把 R2 的配置步骤写到 DEPLOYMENT.md 里」

**分解：**
1. 修复 bug → 代码任务 → 主 agent（需要判断力）
2. Cloudflare 免费额度 → 调研 → 派发 Research agent
3. 写 R2 配置到 DEPLOYMENT.md → 文档任务 → 依赖任务 2 的结果

**依赖分析：**
- 任务 1 和 任务 2 **独立** → 并行
- 任务 3 **部分依赖**任务 2（需要调研结果）→ 任务 2 完成后派发

**执行：**
- 立即派发任务 2（background）
- 立即开始任务 1（主 agent）
- 任务 2 返回后，派发任务 3
- 全部完成 → 合成报告

## 示例 2：多文件代码变更

用户说：「在 header 加个搜索框，在 footer 加版权年份，在 sidebar 加折叠按钮」

**分解：**
1. Header 搜索框 → `src/components/Header.tsx`
2. Footer 版权年份 → `src/components/Footer.tsx`
3. Sidebar 折叠 → `src/components/Sidebar.tsx`

三个文件完全独立 → 派发 3 个 agent 并行。

## 示例 3：不可并行

用户说：「先分析一下现有的数据库 schema，然后基于分析结果设计新的 migration」

任务 2 完全依赖任务 1 的输出 → **串行**。但可以派 Explore agent 做任务 1，主 agent 拿到结果后做任务 2。
