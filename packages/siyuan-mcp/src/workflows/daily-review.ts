/**
 * Daily Review Workflow
 *
 * Builds a daily report by aggregating:
 * - Today's daily note content
 * - Today's new/modified documents
 * - Today's meeting notes
 * - TODO completion status
 *
 * Uses the daily_review.md template.
 */

import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { WorkflowBase, type WorkflowResult } from './base.js';
import { renderTemplate } from '../templates/engine.js';

const DAILY_REVIEW_TEMPLATE = `# 📋 日报 — {{date}}

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
{{/tomorrowPlan}}`;

export class DailyReviewWorkflow extends WorkflowBase {
  readonly name = 'daily_review';

  constructor(siyuan: SiYuanClient) {
    super(siyuan);
  }

  async execute(params: Record<string, unknown>): Promise<WorkflowResult> {
    const notebook = String(params.notebook ?? '');

    const cached = this.getCached(params);
    if (cached) {
      logger.debug('Daily review cache hit');
      return cached;
    }

    const today = this.todayStr();
    const todayLower = today.replace(/-/g, '');
    logger.info('Generating daily review', { date: today });

    // Step 1: Get today's daily note
    let dailyNoteContent = '';
    try {
      const dailyNote = await this.siyuan.getDailyNote(notebook || undefined);
      dailyNoteContent = await this.siyuan.readDocument(dailyNote.id);
    } catch {
      dailyNoteContent = '_今日尚未创建 Daily Note_';
    }

    // Step 2: Search for today's meetings
    let meetings: Array<{ title: string; id: string }> = [];
    try {
      const meetingResults = await this.siyuan.searchNotes(`会议 ${today}`, 10);
      meetings = meetingResults
        .filter(
          (r) =>
            r.title.includes('会议') &&
            (r.path.includes(today) || r.path.includes(todayLower)),
        )
        .slice(0, 5)
        .map((r) => ({ title: r.title, id: r.id }));
    } catch {
      // Non-critical
    }

    // Step 3: Search for today's new documents
    let newDocs: Array<{ title: string; id: string; time: string }> = [];
    try {
      const recentResults = await this.siyuan.searchNotes(today, 15);
      newDocs = recentResults
        .filter(
          (r) =>
            r.path.includes(today) || r.path.includes(todayLower),
        )
        .slice(0, 10)
        .map((r) => ({
          title: r.title,
          id: r.id,
          time: this.extractTime(r.path),
        }));
    } catch {
      // Non-critical
    }

    // Step 4: Get TODOs
    let completed: Array<{ content: string; id: string; docPath: string }> = [];
    let pending: Array<{ content: string; id: string; docPath: string }> = [];
    try {
      const allTodos = await this.siyuan.listTodos();
      completed = allTodos
        .filter((t) => t.done)
        .slice(0, 10)
        .map((t) => ({
          content: t.content,
          id: t.id,
          docPath: t.hPath || t.path,
        }));
      pending = allTodos
        .filter((t) => !t.done)
        .slice(0, 10)
        .map((t) => ({
          content: t.content,
          id: t.id,
          docPath: t.hPath || t.path,
        }));
    } catch {
      // Non-critical
    }

    // Step 5: Extract highlights from daily note
    const highlights = this.extractHighlights(dailyNoteContent);

    // Step 6: Build overview
    const overview = `今日共 ${newDocs.length} 篇新增文档，${meetings.length} 场会议，已完成 ${completed.length} 项待办，还有 ${pending.length} 项待处理。`;

    // Step 7: Render template
    const templateData: Record<string, unknown> = {
      date: today,
      overview,
      newDocs: newDocs.length > 0 ? newDocs : undefined,
      completedCount: String(completed.length),
      completed: completed.length > 0 ? completed : undefined,
      pendingCount: String(pending.length),
      pending: pending.length > 0 ? pending : undefined,
      meetings: meetings.length > 0 ? meetings : undefined,
      highlights: highlights.length > 0 ? highlights : undefined,
      tomorrowPlan: ['继续推进未完成待办', '跟进今日会议决策'],
    };

    const content = renderTemplate(DAILY_REVIEW_TEMPLATE, templateData);

    const result: WorkflowResult = {
      content,
      meta: {
        date: today,
        newDocs: newDocs.length,
        meetings: meetings.length,
        completedTodos: completed.length,
        pendingTodos: pending.length,
      },
    };

    this.setCache(params, result, 30_000); // 30s TTL for daily review (cache through a session)
    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private extractTime(path: string): string {
    // Try to extract time from path (common SiYuan patterns)
    const match = path.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '今日';
  }

  private extractHighlights(content: string): string[] {
    if (!content || content.startsWith('_')) return [];

    // Extract meaningful lines (non-empty, non-heading, not just whitespace)
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 10 &&
          !l.startsWith('#') &&
          !l.startsWith('```') &&
          !l.startsWith('> '),
      )
      .slice(0, 5);

    if (lines.length === 0) {
      return ['今日暂无要点记录'];
    }

    return lines;
  }
}
