# 📋 日报 — {{date}}

## 今日概览
{{overview}}

---

## 📝 今日新增文档
{{#newDocs}}
- [{{title}}](siyuan://blocks/{{id}}) — {{time}}
{{/newDocs}}
{{^newDocs}}
_今日无新增文档_
{{/newDocs}}

---

## 🎯 待办完成情况
### ✅ 已完成 ({{completedCount}})
{{#completed}}
- [x] {{content}} 📄 [{{docPath}}](siyuan://blocks/{{id}})
{{/completed}}
{{^completed}}
_无已完成待办_
{{/completed}}

### ⏳ 进行中 ({{pendingCount}})
{{#pending}}
- [ ] {{content}} 📄 [{{docPath}}](siyuan://blocks/{{id}})
{{/pending}}
{{^pending}}
_所有待办已完成！_
{{/pending}}

---

## 📅 今日会议
{{#meetings}}
- [{{title}}](siyuan://blocks/{{id}})
{{/meetings}}
{{^meetings}}
_今日无会议记录_
{{/meetings}}

---

## 💡 今日要点
{{#highlights}}
- {{.}}
{{/highlights}}

## 📌 明日计划
{{#tomorrowPlan}}
- {{.}}
{{/tomorrowPlan}}
