# {{title}}

## 基本信息
- **时间**: {{date}}
- **参会人**: {{attendees}}
- **主题**: {{topic}}

## 会议摘要
{{summary}}

## 决策 (Decisions)
| # | 决策内容 | 负责人 | 截止日期 |
|---|---------|--------|---------|
{{#decisions}}
| {{index}} | {{content}} | {{owner}} | {{deadline}} |
{{/decisions}}

## 行动项 (Action Items)
| # | 任务 | 负责人 | 截止日期 | 优先级 |
|---|------|--------|---------|--------|
{{#actions}}
| {{index}} | {{content}} | {{owner}} | {{deadline}} | {{priority}} |
{{/actions}}

## 风险与问题 (Risks & Issues)
{{#risks}}
- 🔴 **{{severity}}**: {{description}}
{{/risks}}

## 待办事项 (Todos)
{{#todos}}
- [ ] {{content}} @{{owner}} 📅 {{deadline}}
{{/todos}}

## 备注
{{notes}}
