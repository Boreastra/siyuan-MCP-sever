# 🏗️ 项目上下文 — {{projectName}}

## 基本信息
- 最后更新: {{lastUpdated}}
- 相关文档: {{relatedDocCount}} 篇
- 未完成待办: {{pendingTodoCount}} 项

---

## 📋 项目资料
{{#documents}}
### {{title}}
- **路径**: {{path}}
- **更新时间**: {{time}}
- **摘要**: {{summary}}
{{/documents}}
{{^documents}}
_暂无项目文档_
{{/documents}}

---

## 📅 会议记录
{{#meetings}}
- [{{title}}](siyuan://blocks/{{id}}) — {{date}}
{{/meetings}}
{{^meetings}}
_暂无会议记录_
{{/meetings}}

---

## 🎯 待办事项
### ⏳ 进行中
{{#pendingTodos}}
- [ ] {{content}} 📄 [{{docPath}}](siyuan://blocks/{{id}})
{{/pendingTodos}}
### ✅ 已完成
{{#completedTodos}}
- [x] {{content}}
{{/completedTodos}}

---

## 📊 项目状态
{{status}}

## 📌 关键时间线
{{#timeline}}
- **{{date}}**: {{event}}
{{/timeline}}
