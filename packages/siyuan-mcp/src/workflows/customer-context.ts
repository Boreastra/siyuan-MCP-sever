/**
 * Customer Context Workflow
 *
 * Aggregates all customer-related knowledge:
 * - Meeting notes mentioning the customer
 * - Documents and communications
 * - TODOs related to the customer
 * - Related projects
 * - Daily notes mentioning the customer
 *
 * One call → complete customer context via template rendering.
 */

import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { WorkflowBase, type WorkflowResult } from './base.js';
import { applyTemplate } from '../templates/engine.js';

export class CustomerContextWorkflow extends WorkflowBase {
  readonly name = 'customer_context';

  constructor(siyuan: SiYuanClient) {
    super(siyuan);
  }

  async execute(params: Record<string, unknown>): Promise<WorkflowResult> {
    const customerName = String(params.customer ?? params.customer_name ?? '');
    const depth = Number(params.depth ?? 15);

    if (!customerName) {
      return { content: 'Error: customer name is required for customer_context.' };
    }

    const cached = this.getCached(params);
    if (cached) {
      logger.debug('Customer context cache hit', { customer: customerName });
      return cached;
    }

    logger.info('Building customer context', { customer: customerName, depth });

    // Step 1: Multi-query search for customer-related content
    const searchQueries = [
      customerName,
      `${customerName} 会议`,
      `${customerName} 报价`,
      `${customerName} 方案`,
      `${customerName} 合同`,
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

    // Step 2: Extract TODOs related to customer
    let todos: Array<{ content: string; done: string; deadline: string }> = [];
    try {
      const allTodos = await this.siyuan.listTodos();
      const cust = customerName.toLowerCase();
      todos = allTodos
        .filter((t) => t.content.toLowerCase().includes(cust))
        .slice(0, 10)
        .map((t) => ({
          content: t.content,
          done: t.done ? '✅' : '⏳',
          deadline: '',
        }));
    } catch {
      // Non-critical
    }

    // Step 3: Categorize documents
    const meetings = allDocs.filter(
      (d) =>
        d.title.includes('会议') ||
        d.title.includes('纪要') ||
        d.title.includes('讨论') ||
        d.content.includes('会议'),
    );
    const communications = allDocs.filter(
      (d) =>
        d.title.includes('沟通') ||
        d.title.includes('邮件') ||
        d.title.includes('记录') ||
        d.title.includes('备忘'),
    );
    const documents = allDocs.filter(
      (d) => !meetings.includes(d) && !communications.includes(d),
    );

    // Step 4: Extract project references
    const projectNames = new Set<string>();
    for (const doc of allDocs) {
      const matches = doc.content.match(/(?:项目|Project)[：:]\s*(.+)/gi);
      if (matches) {
        for (const m of matches) {
          const name = m.replace(/(?:项目|Project)[：:]\s*/i, '').trim();
          if (name && name.length < 50) projectNames.add(name);
        }
      }
    }

    // Step 5: Build template data
    const lastMeeting = meetings.length > 0
      ? meetings[0].title
      : '无最近会议记录';

    const templateData = {
      customerName,
      lastUpdated: new Date().toISOString().split('T')[0],
      relatedDocCount: allDocs.length,
      lastMeeting,
      documents: documents.map((d) => ({
        title: d.title,
        path: d.path,
        time: d.snippet.slice(0, 50),
        summary: d.snippet.slice(0, 200),
      })),
      communications: communications.map((d) => ({
        date: d.path.split('/').pop()?.slice(0, 10) || 'N/A',
        summary: d.snippet.slice(0, 200),
      })),
      todos: todos.length > 0 ? todos : [
        { content: '无相关待办', done: '⏳', deadline: '' },
      ],
      projects: projectNames.size > 0
        ? [...projectNames].map((n) => ({ name: n }))
        : [{ name: '未检测到关联项目' }],
    };

    // Step 6: Render via template
    let content: string;
    try {
      content = applyTemplate('customer_summary', templateData);
    } catch {
      // Fallback: build manually
      const sections: string[] = [];
      sections.push(`# 👤 客户上下文 — ${customerName}`);
      sections.push('');
      sections.push(`> 相关文档: ${allDocs.length} 篇 | 待办: ${todos.length} 项`);
      sections.push('');

      if (allDocs.length === 0) {
        sections.push('_未找到与该客户相关的文档。请检查客户名称是否正确。_');
      } else {
        for (const doc of allDocs) {
          sections.push(`- [${doc.title}](${doc.id}) — ${doc.path}`);
          sections.push(`  > ${doc.snippet.slice(0, 120)}`);
        }
      }

      if (todos.length > 0) {
        sections.push('');
        sections.push('## 📝 相关待办');
        for (const t of todos) {
          sections.push(`- ${t.done} ${t.content}`);
        }
      }

      content = sections.join('\n');
    }

    const result: WorkflowResult = {
      content,
      meta: {
        customer: customerName,
        totalDocs: allDocs.length,
        meetings: meetings.length,
        communications: communications.length,
        documents: documents.length,
        todos: todos.length,
        projects: [...projectNames],
      },
    };

    // 60s TTL — customer context changes less frequently
    this.setCache(params, result, 60_000);
    return result;
  }
}
