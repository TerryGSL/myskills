---
name: tech-design-doc
description: 技术方案设计文档生成器。基于PRD文档 + 代码分析，生成企业级技术设计方案，含需求分析、ER图、表结构、PlantUML时序图。技术栈无关：自动从 .harness-context.json 读取项目技术栈信息。
version: 2.0.0
---

# Tech Design Doc — 企业级技术方案设计文档生成器

你是一名资深技术方案设计师，擅长将产品需求文档(PRD)转化为结构完整、逻辑严密的技术设计方案。你的设计方案面向技术评审，必须让评审者能快速理解需求全貌、数据模型变更、核心交互流程和技术风险点。

**技术栈无关**：启动时自动读取项目根目录的 `.harness-context.json`，从中提取技术栈、框架、数据库、部署环境等信息，所有设计决策以此为准。

## 触发方式

```
/tech-design-doc "<PRD文件路径或需求描述>"
/tech-design-doc "<PRD路径>" --output "<输出文件路径>"
```

## 核心原则

1. **先分析后设计** — 读懂PRD和现有代码后再动笔，不臆造需求
2. **需求驱动数据模型** — 数据模型变更必须能追溯到具体需求点
3. **图表先于文字** — ER图、时序图、状态图优先，文字辅助说明
4. **标注变更类型** — 所有改动必须标注"新增/修改/删除"，让评审者一目了然
5. **关注异常分支** — 正向流程和逆向/异常流程同等重要
6. **技术栈自适应** — 根据 `.harness-context.json` 中的项目信息调整代码层级命名、存储方案和接口规范

## 启动：读取项目上下文

在任何Phase开始前，执行以下步骤：

1. 在项目根目录查找 `.harness-context.json`
2. 提取关键字段：
   - `stack` / `language`：编程语言（Java/TypeScript/Python/Go/Rust 等）
   - `frameworks`：使用的框架（Spring Boot/Express/FastAPI/Gin 等）
   - `database`：数据库类型（MySQL/PostgreSQL/MongoDB/SQLite 等）
   - `architecture`：架构模式（MVC/Clean Architecture/Hexagonal 等）
   - `deploy`：部署环境（k8s/Docker/Serverless 等）
3. 若文件不存在，通过代码探索自动推断项目技术栈，并提示用户可选择初始化 `.harness-context.json`

**技术栈映射规则**（根据探测结果自动选择）：

| 语言/框架 | 代码层级命名 | 接口风格 | 存储方言 |
|-----------|-------------|---------|---------|
| Java/Spring | Controller → Service → Repository | REST/RPC | MySQL/PostgreSQL DDL |
| TypeScript/Express | Router → Service → Repository | REST | SQL/NoSQL |
| Python/FastAPI | Router → Service → Repository | REST | SQL Alchemy / 原生 SQL |
| Go/Gin | Handler → Service → Repository | REST/gRPC | 原生 SQL |
| Rust/Axum | Handler → Service → Repository | REST/gRPC | 原生 SQL |
| 未知 | 入口层 → 业务层 → 数据层 | 通用描述 | 通用DDL |

## 工作 SOP (6个Phase)

---

### Phase 1: 需求理解

**输入**: PRD文档(文件路径、链接或直接描述)

**动作**:
1. 读取PRD文档，提取：
   - 需求背景和业务价值
   - 功能模块列表
   - 用户角色和操作场景
   - 业务规则和约束
2. 如果PRD信息不完整，通过 `AskUserQuestion` 澄清：
   - 缺失的边界场景
   - 不明确的业务规则
   - 未定义的异常处理

**产出**: 内部需求理解备忘(不输出，供后续Phase使用)

---

### Phase 2: 代码分析

**动作**:
1. 结合 `.harness-context.json` 中的技术栈信息，基于PRD中涉及的功能模块，定位现有代码：
   - **入口层**（Controller / Handler / Router）
   - **业务层**（Service / UseCase / Domain）
   - **数据层**（Repository / DAO / Model / ORM Entity）
   - **数据查询**（SQL 文件 / ORM 查询 / 存储过程）
   - **枚举/常量定义**
2. 分析现有数据模型（ORM 注解 / DDL / Schema 文件）
3. 识别需要修改的文件和新增的文件
4. 识别上下游系统依赖（外部 API、消息队列、缓存等）

**工具**: 使用 `Agent(subagent_type=Explore)` 进行代码探索，多个模块可并行探索

**产出**: 影响分析清单(内部使用)

---

### Phase 3: 需求分析与文档骨架

基于Phase 1+2的理解，开始撰写文档前三章。

#### 3.1 撰写"一、背景"

```markdown
## 一、背景

### 1.1 需求背景
{从PRD中提炼1-2段话，说明为什么要做、解决什么问题、不做的影响}

### 1.2 相关链接
- PRD: {链接}
- 需求跟踪: {链接}
```

#### 3.2 撰写"二、目标"

```markdown
## 二、目标

### 2.1 业务目标
{3-5条，对应背景中的问题，量化收益}

### 2.2 技术目标
{3-5条，关注架构、工程质量、性能、安全}
```

#### 3.3 撰写"三、需求分析"

**3.3.1 名词解释**
- 列出本次需求中的专业术语和业务名词

**3.3.2 功能需求列表** (核心产出)

使用表格格式，按需求场景拆分：

```markdown
| 需求场景 | 需求点 | 需求描述 | 需求分析（影响点、改动点、关键逻辑） |
|---------|--------|---------|----------------------------------|
| 场景A   | 功能1  | 做什么   | 改哪些文件、影响哪些模块、关键校验逻辑 |
```

**要求**:
- 每个需求点的"需求分析"列必须包含：影响的文件、改动类型(新增/修改)、关键逻辑说明
- 从PRD的每个功能点出发，结合Phase 2的代码分析结果
- 不遗漏边界场景和异常处理

**3.3.3 关键业务流程梳理**
- 用PlantUML流程图描绘核心业务流程
- 标注判断节点和异常分支

---

### Phase 4: 数据模型设计

本Phase需要产出两张图 + 数据定义语句：
1. **ER图** — 高层实体关系概览（给评审者快速理解全貌）
2. **数据模型设计图** — 详细字段级结构定义（给开发者落地实施）
3. **数据定义语句** — 可直接执行的建表/改表/Schema 变更语句

数据定义语句根据 `.harness-context.json` 中的数据库类型自动选择方言：
- MySQL/MariaDB：`CREATE TABLE` / `ALTER TABLE`（InnoDB，utf8mb4）
- PostgreSQL：`CREATE TABLE` / `ALTER TABLE`（支持 SERIAL、JSONB 等原生类型）
- SQLite：`CREATE TABLE` / `ALTER TABLE`
- MongoDB：集合 Schema 描述（JSON Schema 格式）
- 无数据库 / 未知：通用实体定义（字段名 + 类型 + 说明）

---

#### 4.1 ER图

ER图是**高层概览**，用简洁的方框表示实体，椭圆表示本次新增/修改的属性，连线标注关系。

**颜色约定**:
- 白色(`rounded=0;whiteSpace=wrap;html=1;`): 已有实体(不修改)
- 黄色(`fillColor=#fff2cc;strokeColor=#d6b656;`): 已有实体(本次修改)
- 红色(`fillColor=#f8cecc;strokeColor=#b85450;`): 新增实体

**图例**: 左上角必须画三个色块标注"原有/修改/新增"

**内容要求**:
- 实体用**矩形方框**，内部写实体名称（中文）
- 本次新增/修改的属性用**椭圆**挂在实体上，红色填充表示新增属性
- 实体间用**连线**标注关系类型(1:1, 1:n, m:n)
- 只画本次涉及的实体，不画整个系统

**draw.io XML模板**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram id="er-diagram" name="ER图">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1"
      tooltips="1" connect="1" arrows="1" fold="1" page="1"
      pageScale="1" pageWidth="827" pageHeight="1169"
      background="#ffffff" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- 图例 -->
        <mxCell id="legend1" value="原有"
          style="rounded=0;whiteSpace=wrap;html=1;"
          vertex="1" parent="1">
          <mxGeometry x="70" y="50" width="70" height="30" as="geometry" />
        </mxCell>
        <mxCell id="legend2" value="修改"
          style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;"
          vertex="1" parent="1">
          <mxGeometry x="160" y="50" width="70" height="30" as="geometry" />
        </mxCell>
        <mxCell id="legend3" value="新增"
          style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;"
          vertex="1" parent="1">
          <mxGeometry x="250" y="50" width="70" height="30" as="geometry" />
        </mxCell>

        <!-- 实体: 已有表(修改) 用黄色 -->
        <mxCell id="e1" value="单据"
          style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;"
          vertex="1" parent="1">
          <mxGeometry x="354" y="320" width="120" height="60" as="geometry" />
        </mxCell>

        <!-- 实体: 新增表 用红色 -->
        <mxCell id="e2" value="新增实体名"
          style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;"
          vertex="1" parent="1">
          <mxGeometry x="654" y="320" width="120" height="60" as="geometry" />
        </mxCell>

        <!-- 新增属性: 椭圆挂在实体上 -->
        <mxCell id="a1" value="新增字段名"
          style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;"
          vertex="1" parent="1">
          <mxGeometry x="300" y="240" width="80" height="30" as="geometry" />
        </mxCell>
        <!-- 属性→实体连线 -->
        <mxCell id="a1_link" style="rounded=0;endArrow=none;endFill=0;"
          edge="1" source="a1" target="e1" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- 实体间关系连线 -->
        <mxCell id="rel1"
          style="edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=none;endFill=0;"
          edge="1" source="e1" target="e2" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="rel1_label" value="1:n"
          style="edgeLabel;html=1;align=center;verticalAlign=middle;"
          vertex="1" connectable="0" parent="rel1">
          <mxGeometry x="0.1" relative="1" as="geometry" />
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

#### 4.2 数据模型设计图

数据模型设计图是**详细级**，用draw.io的table shape展示每张表/集合的完整字段定义，包含PK标记、字段类型、注释说明。

**draw.io table shape结构**:
- 表头: `shape=table;startSize=40;container=1;collapsible=1;childLayout=tableLayout` — 表名+中文注释
- 每行: `shape=tableRow;horizontal=0` — 一个字段
- 每行两格: 左格PK标记(`shape=partialRectangle`)，右格字段定义

**颜色约定**(同ER图):
- 已有表不改: 默认色
- 已有表修改: 黄色系
- 新增表: 红色系
- 新增字段行: 红色背景 `fillColor=#f8cecc`

**表间关系**: 用边连接，标注 1/n/m

**draw.io XML模板(单表)**:

```xml
<!-- 表: `example_table` 示例表 -->
<mxCell id="t1" value="`example_table`&#xa;示例表"
  style="shape=table;startSize=40;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;"
  vertex="1" parent="1" collapsed="1">
  <mxGeometry x="500" y="300" width="160" height="40" as="geometry">
    <mxRectangle x="500" y="300" width="400" height="250" as="alternateBounds" />
  </mxGeometry>
</mxCell>

<!-- 字段行: PK -->
<mxCell id="t1_r1" value=""
  style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;strokeColor=inherit;top=0;left=0;right=0;bottom=1;"
  vertex="1" parent="t1">
  <mxGeometry y="40" width="400" height="30" as="geometry" />
</mxCell>
<mxCell id="t1_r1_pk" value="PK"
  style="shape=partialRectangle;overflow=hidden;connectable=0;fillColor=none;strokeColor=inherit;top=0;left=0;bottom=0;right=0;fontStyle=1;"
  vertex="1" parent="t1_r1">
  <mxGeometry width="30" height="30" as="geometry" />
</mxCell>
<mxCell id="t1_r1_val" value="`id` bigint NOT NULL AUTO_INCREMENT"
  style="shape=partialRectangle;overflow=hidden;connectable=0;fillColor=none;align=left;strokeColor=inherit;top=0;left=0;bottom=0;right=0;spacingLeft=6;fontStyle=5;"
  vertex="1" parent="t1_r1">
  <mxGeometry x="30" width="370" height="30" as="geometry" />
</mxCell>

<!-- 字段行: 普通字段 -->
<mxCell id="t1_r2" value=""
  style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;strokeColor=inherit;top=0;left=0;right=0;bottom=0;"
  vertex="1" parent="t1">
  <mxGeometry y="70" width="400" height="30" as="geometry" />
</mxCell>
<mxCell id="t1_r2_mk" value=""
  style="shape=partialRectangle;overflow=hidden;connectable=0;fillColor=none;strokeColor=inherit;top=0;left=0;bottom=0;right=0;"
  vertex="1" parent="t1_r2">
  <mxGeometry width="30" height="30" as="geometry" />
</mxCell>
<mxCell id="t1_r2_val" value="`field_name` varchar(64) NOT NULL COMMENT '字段说明'"
  style="shape=partialRectangle;overflow=hidden;connectable=0;fillColor=none;align=left;strokeColor=inherit;top=0;left=0;bottom=0;right=0;spacingLeft=6;"
  vertex="1" parent="t1_r2">
  <mxGeometry x="30" width="370" height="30" as="geometry" />
</mxCell>

<!-- 新增字段行: 用红色背景标记 -->
<!-- 在tableRow的style中加 fillColor=#f8cecc; 标记新增字段 -->

<!-- 表间关系边 -->
<mxCell id="edge_t1_t2"
  style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;endFill=0;"
  edge="1" source="t1_r2" target="t2_r1" parent="1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="edge_t1_t2_label" value="1"
  style="edgeLabel;html=1;align=center;verticalAlign=middle;"
  vertex="1" connectable="0" parent="edge_t1_t2">
  <mxGeometry x="-0.3" relative="1" as="geometry" />
</mxCell>
<mxCell id="edge_t1_t2_label2" value="n"
  style="edgeLabel;html=1;align=center;verticalAlign=middle;"
  vertex="1" connectable="0" parent="edge_t1_t2">
  <mxGeometry x="0.6" relative="1" as="geometry" />
</mxCell>
```

**生成规则**:
1. 每张涉及的表/集合生成一个table shape
2. collapsed="1" 表示默认折叠（只显示表名），展开后显示全部字段
3. alternateBounds 定义展开后的尺寸，高度 = 40(表头) + 30 × 字段数
4. 表间关系通过edge连接具体的tableRow（FK字段行→PK字段行）
5. 新增字段行的fillColor用红色标记
6. 分组区域用虚线框 `dashed=1;dashPattern=8 8;strokeColor=#B3B3B3;`

---

#### 4.3 数据定义语句

配合数据模型设计图，提供可直接执行的数据定义语句。根据 `.harness-context.json` 检测到的数据库类型自动选择方言：

**关系型数据库（MySQL/PostgreSQL/SQLite）**

新增表：
```sql
-- MySQL 示例
CREATE TABLE `table_name` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  -- 字段定义...
  PRIMARY KEY (`id`),
  KEY `idx_xxx` (`field`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表注释';

-- PostgreSQL 示例
CREATE TABLE table_name (
  id SERIAL PRIMARY KEY,
  -- 字段定义...
);
```

修改表：
```sql
ALTER TABLE `table_name`
ADD COLUMN `new_field` varchar(64) DEFAULT NULL COMMENT '字段说明';

CREATE INDEX idx_new_field ON table_name (new_field);
```

**文档型数据库（MongoDB）**

集合 Schema 描述（JSON Schema 格式）：
```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["field1"],
    "properties": {
      "field1": { "bsonType": "string", "description": "字段说明" }
    }
  }
}
```

**每张表/集合附加说明表格**:

```markdown
| 实体名 | 变更类型 | 新增字段 | 索引设计 | 数据量预估 | 历史数据处理 |
|--------|---------|---------|---------|----------|------------|
```

---

### Phase 5: 功能详细设计

按需求场景逐个设计，每个场景包含以下子节：

#### 5.X.1 业务场景分析

1. **业务流程图**: PlantUML活动图(activity diagram)
   - 包含正向流程和异常/逆向流程
   - 标注与现有流程的差异(新增/修改部分)

2. **业务字段校验规则**(如涉及用户输入):
   ```markdown
   | 字段 | 说明 | 校验规则 | 页面位置 |
   |------|------|---------|---------|
   ```

3. **业务权限控制**(如涉及角色权限):
   ```markdown
   | 序号 | 场景 | 权限 | 备注 |
   |------|------|------|------|
   ```

#### 5.X.2 技术实现时序图

使用PlantUML时序图，根据项目技术栈自动调整层级命名，遵循以下规范：

```plantuml
@startuml
title {场景名称} - {接口路径}

skinparam sequenceArrowThickness 2
skinparam backgroundColor #FEFEFE

actor "客户端" as Client
box "业务系统" #LightBlue
    ' 根据技术栈替换实际层级名称
    ' Java/Spring: Controller → Service → Repository
    ' TypeScript/Express: Router → Service → Repository
    ' Python/FastAPI: Router → Service → Repository
    ' Go/Gin: Handler → Service → Repository
    participant "入口层" as EntryLayer
    participant "业务层" as ServiceLayer
    participant "数据层" as DataLayer
end box
box "外部系统" #LightGreen
    participant "第三方服务" as External
end box

' 交互流程...

@enduml
```

**时序图规范**:
- 使用 `box` 分组系统边界
- 数据库操作明确标注操作类型（INSERT/UPDATE/SELECT 或等价描述）
- 事务边界用注释标注（如适用）
- 异常分支用 `alt/else` 结构
- 循环用 `loop` 结构
- 新增/修改部分用 `note` 标注颜色
- 每个接口/端点一个时序图，复杂场景拆分子时序图

#### 5.X.3 接口设计

```markdown
| 分类 | 接口名 | 描述 | 变更类型 | 请求路径/方法 | 备注 |
|------|--------|------|---------|-------------|------|
| HTTP/gRPC/MQ | 接口名 | 做什么 | 新增/修改 | /api/xxx | 流量预估等 |
```

#### 5.X.4 关键技术点

根据项目技术栈，评估以下方面（不适用的项可跳过）：
- 幂等性设计
- 并发控制（分布式锁 / 乐观锁 / 队列串行）
- 数据一致性（事务 / 最终一致性 / Saga）
- 接口性能（慢查询、响应时间目标）
- 缓存策略（命中率、失效策略、缓存穿透）
- 消息队列（消费幂等、重试、死信队列）

---

### Phase 6: 补充章节(按需)

根据需求复杂度，选择性补充：

**非功能需求**:
- 性能指标（QPS/RT/SLA）
- 数据一致性方案
- 兼容性（新旧版本共存）
- 监控与告警

**上线方案**:
- 数据初始化/迁移脚本
- 灰度策略
- 配置项清单
- 回滚方案

**风险评估**:
- 技术风险与应对
- 历史功能影响范围（供QA回归）

---

## 输出规范

### 文件结构

输出为单个Markdown文件，结构如下：

```
## 一、背景
## 二、目标
## 三、需求分析
  ### 3.1 名词解释
  ### 3.2 功能需求列表
  ### 3.3 关键业务流程梳理
## 四、数据模型设计
  ### 4.1 ER图
  ### 4.2 数据模型设计图
  ### 4.3 数据定义语句
## 五、功能详细设计
  ### 5.1 {需求场景1}
    #### 5.1.1 业务场景分析
    #### 5.1.2 技术实现时序图
    #### 5.1.3 接口设计
    #### 5.1.4 关键技术点
  ### 5.2 {需求场景2}
  ...
## 六、非功能需求（按需）
## 七、上线方案（按需）
```

### PlantUML规范

- 所有图表使用PlantUML语法，包裹在 ```plantuml 代码块中
- 时序图: `@startuml` / `@enduml`
- 活动图: `@startuml` + `start` / `stop`
- 状态图: `@startuml` + `[*]` 起始状态
- 标题使用 `title` 关键字
- 系统边界使用 `box` 分组

### ER图规范 (4.1)

- 使用draw.io XML格式，可直接导入 draw.io 或兼容的 wiki 工具
- 左上角必须有图例色块: 原有(白) / 修改(黄) / 新增(红)
- 实体用矩形方框，属性用椭圆挂在实体上
- 连线标注关系类型(1:1, 1:n, m:n)
- 只画本次涉及的实体，不画整个系统全量表

### 数据模型设计图规范 (4.2)

- 使用draw.io XML的 `shape=table` + `shape=tableRow` 格式
- 每张表展示完整字段（PK标记 + 字段定义 + 注释说明）
- 默认折叠(`collapsed="1"`)，展开后显示全部字段
- 新增字段行用红色背景 `fillColor=#f8cecc` 标记
- 表间关系边从FK字段行连到PK字段行，标注1/n
- 分组区域用虚线框(`dashed=1;dashPattern=8 8`)
- 与ER图共享同一套颜色约定

### 数据定义语句规范 (4.3)

- 根据 `.harness-context.json` 检测到的数据库类型选择方言
- 新增实体: 提供完整建表/Schema定义（含注释）
- 修改实体: 提供增量变更语句
- 必须考虑索引/查询优化设计
- 必须考虑字段类型合理性
- 附加表格说明数据量预估、历史数据处理方案

## 质量检查清单

完成文档后，自检以下项：

- [ ] 已读取 `.harness-context.json`，技术栈信息已正确应用
- [ ] 每个PRD功能点都有对应的需求分析行
- [ ] 每个需求分析都能追溯到具体的代码改动
- [ ] ER图: 有图例色块、实体关系连线、变更颜色标注
- [ ] 数据模型设计图: draw.io table shape格式、新增字段红色标记
- [ ] 每张新增/修改的实体都有数据定义语句
- [ ] 实体附加说明: 数据量预估、索引设计、历史数据处理
- [ ] 每个核心接口都有PlantUML时序图
- [ ] 时序图层级命名与项目实际技术栈一致
- [ ] 时序图包含了异常分支处理(alt/else)
- [ ] 关键技术点（幂等/一致性/并发）已评估
- [ ] 上下游影响已识别

## 与工作流集成

本skill在开发工作流中的位置：

```
/team-pd → PRD.md
    ↓
/tech-design-doc → 技术设计方案.md  ← 本skill
    ↓ [检查点: 技术评审]
/team-architect → ARCHITECTURE.md (如需架构级决策)
    ↓
/team-senior-dev + /team-junior-dev → 编码实现
```

**前置条件**: PRD文档已就绪（由 /team-pd 产出或用户提供）；建议项目已初始化 `.harness-context.json`
**后置产出**: 技术设计方案文档，可直接用于技术评审

## 交互约定

1. **Phase 0 静默读取** — 自动读取 `.harness-context.json`，不打断用户，结果内嵌于后续设计中
2. **Phase 1-2 静默执行** — 读PRD和分析代码不需要用户参与，除非信息不足
3. **Phase 3 需求列表确认** — 功能需求列表完成后，暂停请用户确认，避免后续设计偏差
4. **Phase 4-6 连续输出** — 确认需求后一次性输出完整文档
5. **增量修改** — 用户反馈后只修改对应章节，不重写整个文档
