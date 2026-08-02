# 📊 周报 — {{weekRange}}

## 本周概览
{{overview}}

---

## 📈 本周数据
- 新增文档: {{newDocCount}} 篇
- 完成待办: {{completedTodoCount}} 项
- 会议记录: {{meetingCount}} 个

---

## 📝 本周重要文档
{{#importantDocs}}
- [{{title}}](siyuan://blocks/{{id}}) — {{time}}
{{/importantDocs}}

---

## ✅ 本周完成事项
{{#completed}}
- {{.}}
{{/completed}}
{{^completed}}
_本周无完成事项记录_
{{/completed}}

---

## 🔄 项目进展
{{#projects}}
### {{name}}
{{#updates}}
- {{.}}
{{/updates}}
{{/projects}}

---

## 📅 本周会议
{{#meetings}}
- [{{title}}](siyuan://blocks/{{id}}) — {{date}}
{{/meetings}}
{{^meetings}}
_本周无会议记录_
{{/meetings}}

---

## 🎯 下周计划
{{#nextWeekPlan}}
- {{.}}
{{/nextWeekPlan}}

---

## ⚠️ 风险与阻塞
{{#blockers}}
- 🔴 {{.}}
{{/blockers}}
{{^blockers}}
_本周无阻塞项_
{{/blockers}}
