/**
 * Project Timeline Workflow
 *
 * Builds a chronological timeline of all project activities:
 * - Meetings (sorted by date)
 * - Daily/weekly reports (sorted by date)
 * - Design documents
 * - Implementation documents
 * - TODOs with status
 *
 * Returns a unified project timeline for AI consumption.
 */

import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { WorkflowBase, type WorkflowResult } from './base.js';
import { applyTemplate } from '../templates/engine.js';

interface TimelineEntry {
  date: string;
  type: 'meeting' | 'report' | 'design' | 'implementation' | 'other';
  title: string;
  path: string;
  snippet: string;
}

export class ProjectTimelineWorkflow extends WorkflowBase {
  readonly name = 'project_timeline';

  constructor(siyuan: SiYuanClient) {
    super(siyuan);
  }

  async execute(params: Record<string, unknown>): Promise<WorkflowResult> {
    const projectName = String(params.project ?? params.project_name ?? '');
    const depth = Number(params.depth ?? 20);

    if (!projectName) {
      return { content: 'Error: project name is required for project_timeline.' };
    }

    const cached = this.getCached(params);
    if (cached) {
      logger.debug('Project timeline cache hit', { project: projectName });
      return cached;
    }

    logger.info('Building project timeline', { project: projectName, depth });

    // Step 1: Multi-query search across all document types
    const searchQueries = [
      projectName,
      `${projectName} 会议`,
      `${projectName} 日报`,
      `${projectName} 周报`,
      `${projectName} 设计`,
      `${projectName} 实施`,
      `${projectName} 总结`,
    ];

    const seenIds = new Set<string>();
    const allDocs: Array<{
      id: string;
      title: string;
      path: string;
      content: string;
      snippet: string;
    }> = [];

    for (const query of searchQueries) {
      if (allDocs.length >= depth) break;
      try {
        const results = await this.siyuan.searchNotes(query, 5);
        for (const r of results) {
          if (seenIds.has(r.id)) continue;
          seenIds.add(r.id);

          try {
            const content = await this.siyuan.readDocument(r.id);
            allDocs.push({
              id: r.id,
              title: r.title,
              path: r.path,
              content,
              snippet: r.snippet,
            });
          } catch {
            allDocs.push({
              id: r.id,
              title: r.title,
              path: r.path,
              content: '',
              snippet: r.snippet,
            });
          }

          if (allDocs.length >= depth) break;
        }
      } catch {
        // Continue to next query
      }
    }

    // Step 2: Get TODOs
    let todos: Array<{ content: string; done: boolean }> = [];
    try {
      const allTodos = await this.siyuan.listTodos();
      const proj = projectName.toLowerCase();
      todos = allTodos
        .filter((t) => t.content.toLowerCase().includes(proj))
        .slice(0, 10);
    } catch {
      // Non-critical
    }

    // Step 3: Classify documents and extract dates
    const timeline: TimelineEntry[] = [];

    for (const doc of allDocs) {
      // Try to extract date from path or title
      const dateMatch =
        doc.path.match(/(\d{4}[-/]\d{2}[-/]\d{2})/) ||
        doc.title.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);

      const date = dateMatch ? dateMatch[1] : 'unknown';

      let type: TimelineEntry['type'] = 'other';

      if (
        doc.title.includes('会议') ||
        doc.title.includes('纪要') ||
        doc.title.includes('讨论')
      ) {
        type = 'meeting';
      } else if (
        doc.title.includes('日报') ||
        doc.title.includes('周报') ||
        doc.title.includes('总结') ||
        doc.title.includes('复盘')
      ) {
        type = 'report';
      } else if (
        doc.title.includes('设计') ||
        doc.title.includes('需求') ||
        doc.title.includes('方案') ||
        doc.title.includes('架构')
      ) {
        type = 'design';
      } else if (
        doc.title.includes('实施') ||
        doc.title.includes('部署') ||
        doc.title.includes('开发') ||
        doc.title.includes('上线')
      ) {
        type = 'implementation';
      }

      timeline.push({
        date,
        type,
        title: doc.title,
        path: doc.path,
        snippet: doc.snippet.slice(0, 150),
      });
    }

    // Step 4: Sort by date (known dates first, unknown last)
    const typePriority: Record<TimelineEntry['type'], number> = {
      meeting: 1,
      report: 2,
      design: 3,
      implementation: 4,
      other: 5,
    };

    timeline.sort((a, b) => {
      if (a.date === 'unknown' && b.date === 'unknown') {
        return typePriority[a.type] - typePriority[b.type];
      }
      if (a.date === 'unknown') return 1;
      if (b.date === 'unknown') return -1;
      return a.date.localeCompare(b.date);
    });

    // Step 5: Build template data
    const typeLabels: Record<string, string> = {
      meeting: '📅 会议',
      report: '📊 报告',
      design: '📋 设计',
      implementation: '🚀 实施',
      other: '📌 其他',
    };

    const timelineItems = timeline.map((entry) => ({
      date: entry.date === 'unknown' ? '时间未知' : entry.date,
      typeLabel: typeLabels[entry.type],
      title: entry.title,
      path: entry.path,
      summary: entry.snippet,
    }));

    // Step 6: Render
    let content: string;
    try {
      content = applyTemplate('project_timeline', {
        projectName,
        totalDocs: allDocs.length,
        totalMeetings: timeline.filter((t) => t.type === 'meeting').length,
        totalReports: timeline.filter((t) => t.type === 'report').length,
        totalDesigns: timeline.filter((t) => t.type === 'design').length,
        totalImplementations: timeline.filter((t) => t.type === 'implementation').length,
        timelineItems,
        todos: todos.map((t) => ({
          content: t.content,
          done: t.done ? '✅' : '⏳',
        })),
      });
    } catch {
      // Fallback: build manually
      const sections: string[] = [];
      sections.push(`# 📅 项目时间线 — ${projectName}`);
      sections.push('');
      sections.push(`> ${allDocs.length} 篇文档 | ${todos.length} 项待办`);
      sections.push('');

      if (timeline.length === 0) {
        sections.push('_未找到项目相关文档。_');
      } else {
        let lastDate = '';
        for (const entry of timeline) {
          if (entry.date !== lastDate) {
            sections.push('');
            sections.push(`## ${entry.date}`);
            lastDate = entry.date;
          }
          sections.push(`- ${typeLabels[entry.type]}: ${entry.title}`);
          sections.push(`  > ${entry.snippet}`);
        }
      }

      if (todos.length > 0) {
        sections.push('');
        sections.push('## 📝 待办事项');
        for (const t of todos) {
          sections.push(`- ${t.done ? '✅' : '⏳'} ${t.content}`);
        }
      }

      content = sections.join('\n');
    }

    const result: WorkflowResult = {
      content,
      meta: {
        project: projectName,
        totalDocs: allDocs.length,
        timelineEntries: timeline.length,
        todos: todos.length,
      },
    };

    // 60s TTL for project timeline
    this.setCache(params, result, 60_000);
    return result;
  }
}
