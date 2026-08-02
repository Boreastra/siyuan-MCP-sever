/**
 * Weekly Review Workflow
 *
 * Aggregates this week's activity:
 * - New documents created this week
 * - Completed TODOs
 * - Meeting notes from this week
 * - Project changes
 *
 * Uses a weekly_review template.
 */

import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { WorkflowBase, type WorkflowResult } from './base.js';
import { renderTemplate } from '../templates/engine.js';

const WEEKLY_REVIEW_TEMPLATE = `# 📊 周报 — {{weekRange}}

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
{{/blockers}}`;

export class WeeklyReviewWorkflow extends WorkflowBase {
  readonly name = 'weekly_review';

  constructor(siyuan: SiYuanClient) {
    super(siyuan);
  }

  async execute(params: Record<string, unknown>): Promise<WorkflowResult> {
    const notebook = String(params.notebook ?? '');

    const cached = this.getCached(params);
    if (cached) {
      logger.debug('Weekly review cache hit');
      return cached;
    }

    const { start, end, range } = this.getWeekRange();
    logger.info('Generating weekly review', { range });

    // Step 1: Search for this week's new documents
    const dateQueries = this.generateDateQueries(start, end);

    let importantDocs: Array<{ title: string; id: string; time: string }> = [];
    let meetings: Array<{ title: string; id: string; date: string }> = [];

    const seenIds = new Set<string>();

    for (const query of [...dateQueries, '周报', '总结']) {
      try {
        const results = await this.siyuan.searchNotes(query, 10);
        for (const r of results) {
          if (seenIds.has(r.id)) continue;
          seenIds.add(r.id);

          if (this.containsDateInRange(r.path, start, end)) {
            if (
              r.title.includes('会议') ||
              r.title.includes('纪要') ||
              r.title.includes('讨论')
            ) {
              meetings.push({
                title: r.title,
                id: r.id,
                date: this.extractDate(r.path) || range,
              });
            } else {
              importantDocs.push({
                title: r.title,
                id: r.id,
                time: this.extractDate(r.path) || range,
              });
            }
          }
        }
      } catch {
        // Continue
      }
    }

    // Step 2: Get completed TODOs
    let completedTodos: string[] = [];
    try {
      const allTodos = await this.siyuan.listTodos();
      completedTodos = allTodos
        .filter((t) => t.done)
        .slice(0, 10)
        .map((t) => `✅ ${t.content} — ${t.hPath || t.path}`);
    } catch {
      // Non-critical
    }

    // Step 3: Build overview
    const overview = `本周 (${range}) 共新增 ${importantDocs.length} 篇文档，完成 ${completedTodos.length} 项待办，记录 ${meetings.length} 场会议。`;

    // Step 4: Project updates
    const projectUpdates = this.extractProjectUpdates(importantDocs);

    // Step 5: Next week plan
    const nextWeekPlan = [
      '跟进本周未完成事项',
      '规划下周会议安排',
      '更新项目文档',
    ];

    // Step 6: Render
    const templateData: Record<string, unknown> = {
      weekRange: range,
      overview,
      newDocCount: String(importantDocs.length),
      completedTodoCount: String(completedTodos.length),
      meetingCount: String(meetings.length),
      importantDocs: importantDocs.length > 0 ? importantDocs.slice(0, 10) : undefined,
      completed: completedTodos.length > 0 ? completedTodos : undefined,
      projects: projectUpdates.length > 0 ? projectUpdates : [],
      meetings: meetings.length > 0 ? meetings.slice(0, 10) : undefined,
      nextWeekPlan,
      blockers: [],
    };

    const content = renderTemplate(WEEKLY_REVIEW_TEMPLATE, templateData);

    const result: WorkflowResult = {
      content,
      meta: {
        range,
        newDocs: importantDocs.length,
        completedTodos: completedTodos.length,
        meetings: meetings.length,
      },
    };

    this.setCache(params, result, 60_000); // 60s TTL
    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private getWeekRange(): { start: string; end: string; range: string } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return {
      start: fmt(monday),
      end: fmt(sunday),
      range: `${fmt(monday)} ~ ${fmt(sunday)}`,
    };
  }

  private generateDateQueries(start: string, end: string): string[] {
    const queries: string[] = [];
    const s = new Date(start);
    const e = new Date(end);

    // Generate YYYYMMDD date strings for the week
    const current = new Date(s);
    while (current <= e) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      queries.push(`${y}${m}${d}`);
      queries.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }

    return queries.slice(0, 14); // Limit to 2 formats × 7 days
  }

  private containsDateInRange(path: string, start: string, end: string): boolean {
    const dateMatch = path.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return false;

    const docDate = dateMatch[1];
    return docDate >= start && docDate <= end;
  }

  private extractDate(path: string): string | null {
    const match = path.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  private extractProjectUpdates(
    docs: Array<{ title: string; id: string; time: string }>,
  ): Array<{ name: string; updates: string[] }> {
    // Simple grouping: extract potential project names from doc titles
    const projectMap = new Map<string, string[]>();

    for (const doc of docs) {
      // Heuristic: words before common separators
      const parts = doc.title.split(/[-—·•|｜\s—]+/);
      if (parts.length >= 2) {
        const projectName = parts[0].trim();
        if (projectName.length >= 2) {
          if (!projectMap.has(projectName)) {
            projectMap.set(projectName, []);
          }
          projectMap.get(projectName)!.push(
            `📄 [${doc.title}](${doc.id}) — ${doc.time}`,
          );
        }
      }
    }

    return [...projectMap.entries()]
      .filter(([, updates]) => updates.length >= 1)
      .slice(0, 5)
      .map(([name, updates]) => ({ name, updates }));
  }
}
