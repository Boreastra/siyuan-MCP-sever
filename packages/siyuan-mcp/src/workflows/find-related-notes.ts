/**
 * Find Related Notes Workflow + Smart Retrieval Helper
 *
 * find_related_notes:
 *   Input: doc_id → find related documents by title, keywords, backlinks.
 *
 * smart_retrieval (helper):
 *   Parse natural language query → extract keywords, dates, projects,
 *   customers, people → generate structured search query.
 */

import type { SiYuanClient, SearchResult } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { WorkflowBase, type WorkflowResult } from './base.js';

export class FindRelatedNotesWorkflow extends WorkflowBase {
  readonly name = 'find_related_notes';

  constructor(siyuan: SiYuanClient) {
    super(siyuan);
  }

  async execute(params: Record<string, unknown>): Promise<WorkflowResult> {
    const docId = String(params.doc_id ?? '');

    if (!docId) {
      return { content: 'Error: doc_id is required for find_related_notes.' };
    }

    const cached = this.getCached(params);
    if (cached) {
      logger.debug('Related notes cache hit', { docId });
      return cached;
    }

    logger.info('Finding related notes', { docId });

    // Step 1: Read the source document
    let sourceTitle = '';
    let sourceContent = '';
    try {
      sourceContent = await this.siyuan.readDocument(docId);
      const titleMatch = sourceContent.match(/^#\s+(.+)$/m);
      sourceTitle = titleMatch ? titleMatch[1].trim() : '';
    } catch {
      return {
        content: `Error: Could not read document ${docId}.`,
      };
    }

    if (!sourceTitle && !sourceContent) {
      return {
        content: `Document ${docId} is empty. Cannot find related notes.`,
      };
    }

    // Step 2: Extract keywords from the document
    const keywords = this.extractKeywords(sourceTitle, sourceContent);

    // Step 3: Search for each keyword
    const allRelated: SearchResult[] = [];
    const seenIds = new Set<string>([docId]);

    for (const kw of keywords.slice(0, 5)) {
      try {
        const results = await this.siyuan.searchNotes(kw, 5);
        for (const r of results) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            allRelated.push(r);
          }
        }
      } catch {
        // Continue
      }
      if (allRelated.length >= 15) break;
    }

    // Step 4: Extract siyuan:// backlinks from content
    const backlinks = this.extractBacklinks(sourceContent);
    for (const bl of backlinks) {
      if (!seenIds.has(bl) && allRelated.length < 20) {
        seenIds.add(bl);
        try {
          const content = await this.siyuan.readDocument(bl);
          const titleMatch = content.match(/^#\s+(.+)$/m);
          allRelated.push({
            id: bl,
            title: titleMatch ? titleMatch[1].trim() : bl,
            path: '',
            box: '',
            snippet: content.slice(0, 100),
            score: 0,
          });
        } catch {
          // Skip if can't read
        }
      }
    }

    // Step 5: Format output
    const sections: string[] = [];
    sections.push(`## 🔗 相关笔记: "${sourceTitle || docId}"`);
    sections.push('');

    if (allRelated.length === 0) {
      sections.push('_未找到相关文档。_');
      const result: WorkflowResult = {
        content: sections.join('\n'),
        meta: { sourceId: docId, relatedCount: 0 },
      };
      this.setCache(params, result);
      return result;
    }

    sections.push(`> 找到 ${allRelated.length} 篇相关文档`);
    sections.push('');

    for (const r of allRelated) {
      const snippet = r.snippet ? `> ${r.snippet.slice(0, 150)}` : '';
      sections.push(`### 📄 ${r.title}`);
      if (snippet) sections.push(snippet);
      sections.push(`- **ID**: ${r.id}`);
      if (r.path) sections.push(`- **路径**: ${r.path}`);
      sections.push(`- **相关度**: ${r.score > 0 ? '⭐'.repeat(Math.min(5, Math.ceil(r.score * 5))) : '关联引用'}`);
      sections.push('');
    }

    const result: WorkflowResult = {
      content: sections.join('\n'),
      meta: {
        sourceId: docId,
        sourceTitle,
        relatedCount: allRelated.length,
        keywordsUsed: keywords.slice(0, 5).join(', '),
      },
    };

    this.setCache(params, result);
    return result;
  }

  // ─── Smart Retrieval (natural language → keywords) ─────────────────

  /**
   * Parse a natural language query and extract structured search terms.
   *
   * Examples:
   *   "昨天讨论的CRM报价" → ["CRM", "报价"]
   *   "客户A昨天会议" → ["客户A", "会议"]
   *   "上周Docker部署" → ["Docker", "部署"]
   */
  static parseNaturalQuery(query: string): string[] {
    const keywords: string[] = [];

    // Remove time-related words (standalone enough for simple replacement)
    const cleaned = query
      .replace(/昨天|今天|前天|上周|本周|这周|上月|本月|明天|下周|下月/g, ' ')
      .trim();

    // Extract quoted phrases
    const quoted = cleaned.match(/[""「」『』].+?[""「」『』]/g) ?? [];
    for (const q of quoted) {
      keywords.push(q.replace(/[""「」『』]/g, ''));
    }
    let remaining = cleaned.replace(/[""「」『』].+?[""「」『』]/g, ' ');

    // Extract CamelCase / PascalCase
    const camelMatches = remaining.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) ?? [];
    for (const m of camelMatches) {
      if (!keywords.includes(m)) keywords.push(m);
    }
    remaining = remaining.replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, ' ');

    // Extract English words (2+ chars)
    const engMatches = remaining.match(/\b[a-zA-Z]{2,}\b/g) ?? [];
    for (const m of engMatches) {
      if (!keywords.includes(m)) keywords.push(m);
    }
    remaining = remaining.replace(/\b[a-zA-Z]{2,}\b/g, ' ');

    // Split on whitespace and punctuation
    const segments = remaining.split(/[\s,，、。；;!！?？\n\r]+/).filter(Boolean);

    // Filter stop words only on complete segments (avoids substring removal)
    const stopWords = new Set([
      '的', '了', '是', '在', '和', '与', '或', '都', '就',
      '也', '很', '会', '能', '可以', '应该', '需要', '已经', '正在',
    ]);

    for (const segment of segments) {
      if (segment.length < 2) continue;
      if (stopWords.has(segment)) continue;

      // Split at CJK ↔ ASCII boundaries
      const pieces = segment.match(/([\u4e00-\u9fff]+|[a-zA-Z0-9]+)/g) ?? [];

      for (const piece of pieces) {
        if (piece.length >= 2 && !stopWords.has(piece) && !keywords.includes(piece)) {
          keywords.push(piece);
        }
      }

      // Also push mixed compound like "客户A" as a whole
      if (/[\u4e00-\u9fff]/.test(segment) && /[a-zA-Z]/.test(segment)) {
        if (!keywords.includes(segment)) {
          keywords.push(segment);
        }
      }

      // If segment is pure Chinese/CJK (no ASCII) and >= 2 chars, keep it
      if (/^[\u4e00-\u9fff]+$/.test(segment) && segment.length >= 2) {
        if (!keywords.includes(segment)) {
          keywords.push(segment);
        }
      }
    }

    return keywords.length > 0 ? keywords : [query];
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private extractKeywords(title: string, content: string): string[] {
    const combined = `${title} ${content}`.toLowerCase();

    // Extract markdown headings as they indicate important topics
    const headings = combined.match(/^#{1,3}\s+(.+)$/gm) ?? [];
    const headingKeywords = headings.map((h) =>
      h.replace(/^#{1,3}\s+/, '').trim(),
    );

    // Extract siyuan:// links
    const linkMatches = combined.match(/\[([^\]]+)\]\(siyuan:\/\/blocks\/[^)]+\)/g) ?? [];
    const linkKeywords = linkMatches.map((l) => {
      const m = l.match(/\[([^\]]+)\]/);
      return m ? m[1] : '';
    }).filter(Boolean);

    // Extract [[wikilinks]]
    const wikiMatches = combined.match(/\[\[([^\]]+)\]\]/g) ?? [];
    const wikiKeywords = wikiMatches.map((w) =>
      w.replace(/^\[\[|\]\]$/g, '').split('|')[0],
    );

    // Extract @mentions
    const mentionMatches = combined.match(/[@＠](\S+)/g) ?? [];
    const mentionKeywords = mentionMatches.map((m) => m.replace(/^[@＠]/, ''));

    // Extract #tags
    const tagMatches = combined.match(/#(\S+)/g) ?? [];
    const tagKeywords = tagMatches.map((t) => t.replace(/^#/, ''));

    // Combine and deduplicate
    const allKeywords = [
      title,
      ...headingKeywords,
      ...linkKeywords,
      ...wikiKeywords,
      ...mentionKeywords,
      ...tagKeywords,
    ];

    // Simple TF from content
    const words = combined
      .replace(/[#*`\[\]()>|-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }

    const topFreq = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);

    const seen = new Set<string>();
    return [...allKeywords, ...topFreq].filter((kw) => {
      if (!kw || seen.has(kw)) return false;
      seen.add(kw);
      return kw.length >= 2;
    }).slice(0, 10);
  }

  /**
   * Extract SiYuan document references from block IDs in content.
   */
  private extractBacklinks(content: string): string[] {
    const ids: string[] = [];
    const pattern = /siyuan:\/\/blocks\/(\d{14}-[a-z0-9]{7})/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      ids.push(match[1]);
    }
    return ids;
  }
}
