# Sample Skill（用于测试 doc-gen，不真投放）

## 规则状态枚举

<!-- @generated:rule-status -->
- `active` — 正常有效的 rule
- `expired` — free_form_review 时间到期，降级为 advisory
- `drifted` — 代码演化走了另一路（>30% 违反），既不 binding 也不 advisory
- `superseded` — 被另一条 rule 取代，保留作历史
<!-- @/generated -->

## HardFloor 动作

<!-- @generated:hard-floor-actions -->
- `auto_push` — 禁止自动 push
- `force_push` — 禁止 force push
- `destructive_ops` — 禁止 rm -rf / drop table 等
- `auto_merge` — 禁止自动 merge PR
- `rewrite_history` — 禁止 git reset / rebase 改历史
- `network_install` — 禁止运行期 npm install 等
<!-- @/generated -->
