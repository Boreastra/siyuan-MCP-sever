/**
 * Knowledge Context Workflow
 *
 * The most important capability in V1.1.
 *
 * Input: a topic (e.g., "CRM", "客户A", "Docker")
 * Output: unified knowledge context including related docs, recent updates,
 *         key knowledge, pending TODOs, related notes, and reading suggestions.
 *
 * The AI no longer needs to loop through search + read manually.
 * One call → complete context.
 */

import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { WorkflowBase, type WorkflowResult } from './base.js';
import { applyTemplate } from '../templates/engine.js';

export class KnowledgeContextWorkflow extends WorkflowBase {
  readonly name = 'knowledge_context';

  constructor(siyuan: SiYuanClient) {
    super(siyuan);
  }

  async execute(params: Record<string, unknown>): Promise<WorkflowResult> {
    const topic = String(params.topic ?? params.keyword ?? '');
    const depth = Number(params.depth ?? params.topN ?? 5);

    if (!topic) {
      return { content: 'Error: topic is required for knowledge_context.' };
    }

    // Check cache first
    const cached = this.getCached(params);
    if (cached) {
      logger.debug('Knowledge context cache hit', { topic });
      return cached;
    }

    logger.info('Building knowledge context', { topic, depth });

    // Step 1: Search for the topic
    const results = await this.siyuan.searchNotes(topic, depth * 2);
    const deduped = this.dedupDocs(results).slice(0, depth);

    if (deduped.length === 0) {
      const result: WorkflowResult = {
        content: `## 🔍 Knowledge Context: "${topic}"\n\nNo related documents found in SiYuan.`,
        meta: { topic, totalDocs: 0 },
      };
      this.setCache(params, result);
      return result;
    }

    // Step 2: Read full content of top N documents
    const docs: Array<{
      id: string;
      title: string;
      path: string;
      content: string;
      snippet: string;
    }> = [];

    for (const r of deduped) {
      try {
        const content = await this.siyuan.readDocument(r.id);
        docs.push({
          id: r.id,
          title: r.title,
          path: r.path,
          content,
          snippet: r.snippet,
        });
      } catch {
        docs.push({
          id: r.id,
          title: r.title,
          path: r.path,
          content: '',
          snippet: r.snippet,
        });
      }
    }

    // Step 3: Extract keywords (simple TF-based)
    const keywords = this.extractKeywords(topic, docs.map((d) => d.content));

    // Step 4: Find related notes by keywords
    const relatedNotes: string[] = [];
    for (const kw of keywords.slice(0, 3)) {
      if (kw === topic.toLowerCase()) continue;
      try {
        const related = await this.siyuan.searchNotes(kw, 3);
        for (const r of related) {
          if (!deduped.find((d) => d.id === r.id)) {
            relatedNotes.push(`- [${r.title}](${r.id}) — ${r.path}`);
          }
        }
      } catch {
        // Non-critical: continue if related search fails
      }
    }
    const uniqueRelated = [...new Set(relatedNotes)].slice(0, 5);

    // Step 5: Check for pending TODOs related to topic
    let pendingTodos: string[] = [];
    try {
      const allTodos = await this.siyuan.listTodos();
      const topicLower = topic.toLowerCase();
      pendingTodos = allTodos
        .filter((t) => !t.done && t.content.toLowerCase().includes(topicLower))
        .slice(0, 5)
        .map((t) => `- [ ] ${t.content} — ${t.hPath || t.path}`);
    } catch {
      // Non-critical
    }

    // Step 6: Build formatted output
    const sections: string[] = [];

    sections.push(`## 🔍 Knowledge Context: "${topic}"`);
    sections.push('');

    // Related documents
    sections.push('### 📄 相关文档');
    sections.push('');
    for (const doc of docs) {
      const preview = this.extractSummary(doc.content, 200);
      sections.push(`#### ${doc.title}`);
      sections.push(`- **路径**: ${doc.path}`);
      sections.push(`- **摘要**: ${preview}`);
      sections.push('');
    }

    // Recent updates (sort by path depth as proxy for time)
    sections.push('### 🕐 最近更新');
    sections.push('');
    const sorted = [...docs].sort((a, b) => b.path.length - a.path.length);
    for (const doc of sorted.slice(0, 5)) {
      sections.push(`- 📝 ${doc.title} — \`${doc.path}\``);
    }
    sections.push('');

    // Important knowledge (longest docs = most substantial)
    sections.push('### 💡 重要知识');
    sections.push('');
    const substantial = [...docs]
      .filter((d) => d.content.length > 200)
      .sort((a, b) => b.content.length - a.content.length)
      .slice(0, 3);
    if (substantial.length === 0) {
      sections.push('_暂无深度内容_');
    } else {
      for (const doc of substantial) {
        const insight = this.extractSummary(doc.content, 300);
        sections.push(`> ${insight}`);
        sections.push(`— [${doc.title}](${doc.id})`);
        sections.push('');
      }
    }
    sections.push('');

    // Pending TODOs
    sections.push('### 📝 未完成待办');
    sections.push('');
    if (pendingTodos.length > 0) {
      sections.push(...pendingTodos);
    } else {
      sections.push('_无相关待办事项_');
    }
    sections.push('');

    // Related notes
    sections.push('### 🔗 关联文档');
    sections.push('');
    if (uniqueRelated.length > 0) {
      sections.push(...uniqueRelated);
    } else {
      sections.push('_暂未找到关联文档_');
    }
    sections.push('');

    // Suggested further reading
    sections.push('### 📚 建议继续阅读');
    sections.push('');
    if (deduped.length > docs.length) {
      for (const r of deduped.slice(docs.length)) {
        sections.push(`- 📖 ${r.title}`);
      }
    } else {
      sections.push('_已覆盖所有相关文档_');
    }

    const content = sections.join('\n');
    const result: WorkflowResult = {
      content,
      meta: {
        topic,
        totalDocs: docs.length,
        relatedCount: uniqueRelated.length,
        pendingTodoCount: pendingTodos.length,
      },
    };

    this.setCache(params, result);
    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /** Extract meaningful keywords from content (simple term frequency) */
  private extractKeywords(topic: string, contents: string[]): string[] {
    const combined = [topic, ...contents].join(' ').toLowerCase();

    // Simple keyword extraction: split by non-word, count, sort
    const words = combined
      .replace(/[#*`\[\]()>|-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !this.isStopWord(w));

    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);
  }

  private isStopWord(word: string): boolean {
    const stops = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'of', 'in', 'to', 'for', 'on', 'at', 'by', 'with', 'from',
      'and', 'or', 'but', 'not', 'this', 'that', 'it', 'as',
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
      '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
      '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它',
    ]);
    return stops.has(word);
  }

  /** Extract a concise summary from document content */
  private extractSummary(content: string, maxLen: number): string {
    // Remove markdown syntax for cleaner preview
    const clean = content
      .replace(/^#+\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[-*]\s/g, '')
      .trim();

    if (clean.length <= maxLen) return clean || '_无内容_';
    return clean.slice(0, maxLen) + '...';
  }
}
