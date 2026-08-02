# 📅 项目时间线 — {{projectName}}

> 📄 共 {{totalDocs}} 篇文档 | 📅 {{totalMeetings}} 场会议 | 📊 {{totalReports}} 份报告 | 📋 {{totalDesigns}} 项设计 | 🚀 {{totalImplementations}} 次实施

---

## 时间线总览

{{#timelineItems}}
### {{date}} — {{typeLabel}}: {{title}}
- **路径**: {{path}}
- **摘要**: {{summary}}

{{/timelineItems}}

---

## 📝 未完成待办

{{#todos}}
- {{done}} {{content}}
{{/todos}}
{{^todos}}
_无相关待办事项_
{{/todos}}
