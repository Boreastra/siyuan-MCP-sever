# 👤 客户上下文 — {{customerName}}

## 基本信息
- 最后更新: {{lastUpdated}}
- 相关文档: {{relatedDocCount}} 篇
- 最近会议: {{lastMeeting}}

---

## 📋 相关资料
{{#documents}}
### {{title}}
- **路径**: {{path}}
- **时间**: {{time}}
- **摘要**: {{summary}}
{{/documents}}

---

## 💬 沟通记录
{{#communications}}
- **{{date}}**: {{summary}}
{{/communications}}

---

## 📝 待办事项
{{#todos}}
- [{{done}}] {{content}} {{#deadline}}📅 {{deadline}}{{/deadline}}
{{/todos}}

---

## 🔗 关联项目
{{#projects}}
- {{name}}
{{/projects}}
{{^projects}}
_未检测到关联项目_
{{/projects}}
