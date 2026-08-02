/**
 * Meeting Summary Workflow
 *
 * Parses meeting notes and extracts structured information:
 * - Actions (with assignments and deadlines)
 * - Decisions
 * - Risks/Issues
 * - TODOs (with owners and deadlines)
 *
 * Optionally appends the formatted summary back to SiYuan.
 * Optionally creates auto-links to project/people notes.
 */

import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { WorkflowBase, type WorkflowResult } from './base.js';
import { applyTemplate } from '../templates/engine.js';

interface ParsedMeeting {
  title: string;
  date: string;
  attendees: string;
  topic: string;
  summary: string;
  decisions: Array<{ index: number; content: string; owner: string; deadline: string }>;
  actions: Array<{ index: number; content: string; owner: string; deadline: string; priority: string }>;
  risks: Array<{ severity: string; description: string }>;
  todos: Array<{ content: string; owner: string; deadline: string }>;
  notes: string;
}

export class MeetingSummaryWorkflow extends WorkflowBase {
  readonly name = 'meeting_summary';

  constructor(siyuan: SiYuanClient) {
    super(siyuan);
  }

  async execute(params: Record<string, unknown>): Promise<WorkflowResult> {
    const content = String(params.content ?? params.meeting_notes ?? '');
    const appendToDoc = String(params.append_to ?? params.doc_id ?? '');
    const notebook = String(params.notebook ?? '');
    const path = String(params.path ?? '/Meetings');
    const title = String(params.title ?? `会议纪要 ${this.formatDate()}`);

    if (!content) {
      return { content: 'Error: meeting content is required for meeting_summary.' };
    }

    logger.info('Processing meeting summary', { title, hasAppend: !!appendToDoc });

    // Step 1: Parse meeting content
    const parsed = await this.parseMeetingContent(content, title);

    // Step 2: Render template
    const templateData: Record<string, unknown> = {
      title: parsed.title,
      date: parsed.date,
      attendees: parsed.attendees,
      topic: parsed.topic,
      summary: parsed.summary,
      decisions: parsed.decisions.length > 0 ? parsed.decisions : [],
      actions: parsed.actions.length > 0 ? parsed.actions : [],
      risks: parsed.risks.length > 0 ? parsed.risks : [],
      todos: parsed.todos.length > 0 ? parsed.todos : [],
      notes: parsed.notes,
    };

    const formattedSummary = applyTemplate('meeting_summary', templateData);

    // Step 3: Auto-link if enabled
    const autoLink = Boolean(params.auto_link ?? true);
    let linkResults = '';

    if (autoLink) {
      const links = await this.buildAutoLinks(content, parsed.title);
      if (links.length > 0) {
        linkResults = '\n\n---\n## 🔗 自动关联\n\n' + links.join('\n');
      }
    }

    // Step 4: Append back to SiYuan if requested
    let savedInfo = '';

    if (appendToDoc) {
      try {
        const blockId = await this.siyuan.appendMarkdown(appendToDoc, formattedSummary + linkResults);
        savedInfo = `\n\n---\n已追加到文档 ${appendToDoc} (Block: ${blockId})`;
      } catch (err) {
        logger.error('Failed to append meeting summary', { error: String(err) });
        savedInfo = `\n\n---\n⚠️ 追加到文档失败: ${String(err)}`;
      }
    } else if (notebook) {
      try {
        const docId = await this.siyuan.documents.createDocument(
          notebook,
          `${path}/${parsed.title}`,
          formattedSummary + linkResults,
        );
        savedInfo = `\n\n---\n已创建文档: ${docId}`;
      } catch (err) {
        logger.error('Failed to create meeting note', { error: String(err) });
        savedInfo = `\n\n---\n⚠️ 创建文档失败: ${String(err)}`;
      }
    }

    const result: WorkflowResult = {
      content: formattedSummary + linkResults + savedInfo,
      meta: {
        title: parsed.title,
        decisions: parsed.decisions.length,
        actions: parsed.actions.length,
        risks: parsed.risks.length,
        todos: parsed.todos.length,
        autoLinked: autoLink,
        saved: !!savedInfo,
      },
    };

    return result;
  }

  // ─── Meeting Parser ────────────────────────────────────────────────

  private async parseMeetingContent(
    rawContent: string,
    fallbackTitle: string,
  ): Promise<ParsedMeeting> {
    // Extract title from first heading
    const titleMatch = rawContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : fallbackTitle;

    // Extract date
    const dateMatch =
      rawContent.match(/日期[:：]\s*(.+)/) ??
      rawContent.match(/时间[:：]\s*(.+)/) ??
      rawContent.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1].trim() : this.formatDate();

    // Extract attendees
    const attendeesMatch =
      rawContent.match(/参会[:：人]*\s*(.+)/) ??
      rawContent.match(/参与[:：人]*\s*(.+)/) ??
      rawContent.match(/成员[:：]\s*(.+)/);
    const attendees = attendeesMatch ? attendeesMatch[1].trim() : '未指定';

    // Extract topic
    const topicMatch =
      rawContent.match(/主题[:：]\s*(.+)/) ??
      rawContent.match(/议题[:：]\s*(.+)/) ??
      rawContent.match(/议程[:：]\s*(.+)/);
    const topic = topicMatch ? topicMatch[1].trim() : '未指定';

    // Summary: first paragraph after title, or first 200 chars
    const summaryMatch = rawContent.match(/摘要[:：]\s*([\s\S]+?)(?:\n##|\n#|$)/);
    let summary = summaryMatch
      ? summaryMatch[1].trim()
      : rawContent.replace(/^#.+$/gm, '').trim().slice(0, 300);
    if (!summary) summary = '无会议摘要';

    // Extract decisions
    const decisions = this.extractSectionItems(rawContent, '决策|决定|Decision', (line) => {
      const ownerMatch = line.match(/[@＠](\S+)/);
      const deadlineMatch = line.match(/📅\s*(\S+)|截止[:：]\s*(\S+)|deadline[:：]\s*(\S+)/i);
      return {
        content: this.cleanLine(line),
        owner: ownerMatch ? ownerMatch[1] : '-',
        deadline: deadlineMatch
          ? deadlineMatch[1] || deadlineMatch[2] || deadlineMatch[3] || '-'
          : '-',
      };
    });

    // Extract actions
    const actions = this.extractSectionItems(rawContent, '行动|Action|任务', (line) => {
      const ownerMatch = line.match(/[@＠](\S+)/);
      const deadlineMatch = line.match(/📅\s*(\S+)|截止[:：]\s*(\S+)|deadline[:：]\s*(\S+)/i);
      const priorityMatch = line.match(/[Pp](\d)|优先[:：]\s*(高|中|低)/);
      return {
        content: this.cleanLine(line),
        owner: ownerMatch ? ownerMatch[1] : '-',
        deadline: deadlineMatch
          ? deadlineMatch[1] || deadlineMatch[2] || deadlineMatch[3] || '-'
          : '-',
        priority: priorityMatch
          ? `P${priorityMatch[1] || priorityMatch[2]}`
          : 'P2',
      };
    });

    // Extract risks
    const risks = this.extractSectionItems(rawContent, '风险|Risk|Issue|问题', (line) => {
      const severityMatch = line.match(/[🔴🟡🟢]|严重[:：]\s*(高|中|低)|severity[:：]\s*(high|medium|low)/i);
      return {
        severity:
          severityMatch?.[1] ||
          severityMatch?.[2] ||
          (line.toLowerCase().includes('high') || line.includes('高') ? '高' : '中'),
        description: this.cleanLine(line),
      };
    });

    // Extract TODOs from markdown checkboxes
    const todoPattern = /-\s*\[ \]\s*(.+)/g;
    const todos: Array<{ content: string; owner: string; deadline: string }> = [];
    let todoMatch: RegExpExecArray | null;
    while ((todoMatch = todoPattern.exec(rawContent)) !== null) {
      const line = todoMatch[1];
      const ownerMatch = line.match(/[@＠](\S+)/);
      const deadlineMatch = line.match(/📅\s*(\S+)|截止[:：]\s*(\S+)/);
      todos.push({
        content: this.cleanLine(line),
        owner: ownerMatch ? ownerMatch[1] : '-',
        deadline: deadlineMatch
          ? deadlineMatch[1] || deadlineMatch[2] || '-'
          : '-',
      });
    }

    // Notes: everything after "备注" or remaining content
    const notesMatch = rawContent.match(/备注[:：]\s*([\s\S]+)$/);
    const notes = notesMatch ? notesMatch[1].trim() : '';

    return {
      title,
      date,
      attendees,
      topic,
      summary,
      decisions: decisions.map((d, i) => ({ ...d, index: i + 1 })),
      actions: actions.map((a, i) => ({ ...a, index: i + 1 })),
      risks,
      todos,
      notes,
    };
  }

  // ─── Auto-Link Builder ─────────────────────────────────────────────

  private async buildAutoLinks(content: string, meetingTitle: string): Promise<string[]> {
    const links: string[] = [];

    // Extract potential project/client/people names from content
    const patterns = [
      /项目[:：]\s*(\S+)/g,
      /客户[:：]\s*(\S+)/g,
      /参与[:：人]*\s*([^,\n，]+)/g,
      /[@＠](\S+)/g,
    ];

    const names = new Set<string>();
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        names.add(match[1].trim());
      }
    }

    for (const name of names) {
      if (name.length < 2 || name === meetingTitle) continue;
      try {
        const results = await this.siyuan.searchNotes(name, 2);
        for (const r of results) {
          if (r.title.toLowerCase().includes(name.toLowerCase())) {
            links.push(`- 关联: [${r.title}](siyuan://blocks/${r.id})`);
          }
        }
      } catch {
        // Non-critical
      }
    }

    return links;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private extractSectionItems<T>(
    content: string,
    sectionPattern: string,
    transform: (line: string) => T,
  ): T[] {
    // Find the section header — use "starts with" matching, not exact match.
    // Exact match (with \\s*$) fails for headers like "## 行动项" because
    // "项" is not whitespace and the pattern "行动" doesn't reach $.
    const headerRegex = new RegExp(
      `^##\\s+(?:${sectionPattern})`,
      'im',
    );
    const headerMatch = content.match(headerRegex);
    if (!headerMatch) return [];
    if (headerMatch.index === undefined) return [];

    // Extract content from after this header to the next ## or end
    const startIdx = headerMatch.index + headerMatch[0].length;
    const rest = content.slice(startIdx);
    const nextSectionIdx = rest.search(/\n##\s/);
    const sectionContent = nextSectionIdx >= 0 ? rest.slice(0, nextSectionIdx) : rest;

    const items: T[] = [];
    const lines = sectionContent.split('\n');
    let afterHeaderRow = false; // Track if we've passed a markdown table header

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) break;

      // Extract list items: "- content" or "* content"
      const listMatch = trimmed.match(/^[-*]\s*(.+)/);
      if (listMatch) {
        items.push(transform(listMatch[1]));
        continue;
      }

      // Handle markdown table rows: | col1 | col2 | ...
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        // Skip table separator rows like "|---|----|"
        if (/^\|[\s\-:]+\|$/.test(trimmed)) {
          afterHeaderRow = true;
          continue;
        }
        // Skip the header row if it's the first table row
        if (!afterHeaderRow && trimmed.includes('---')) {
          afterHeaderRow = true;
          continue;
        }
        // Extract cell content from the first meaningful column
        const cells = trimmed
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
        // Skip header row detection: if cells look like headers (single word, colons)
        const looksLikeHeader =
          !afterHeaderRow &&
          cells.length > 1 &&
          cells.every((c) => /^[\p{L}\p{N}\s\-_/]+$/u.test(c) && c.length < 20);
        if (looksLikeHeader) {
          afterHeaderRow = true;
          continue;
        }
        // Join cells as a single description for the transform
        items.push(transform(cells.join(' | ')));
        afterHeaderRow = true;
        continue;
      }

      // Plain text line (not a list, not a table)
      if (trimmed) {
        items.push(transform(trimmed));
      }
    }

    return items;
  }

  private cleanLine(line: string): string {
    return line
      .replace(/[@＠]\S+/g, '')
      .replace(/📅\s*\S+/g, '')
      .replace(/deadline[:：]\s*\S+/gi, '')
      .replace(/优先[:：]\s*(高|中|低)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
