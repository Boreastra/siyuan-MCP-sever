/**
 * SiYuan SDK - Todo Module
 *
 * SiYuan doesn't have a dedicated "todo" API. Todos are checkbox list items
 * inside documents. This module uses SQL + block APIs to manage them.
 *
 * A "todo" in SiYuan is a task-list item block (blocks.type='i',
 * blocks.subtype='t') whose markdown starts with `- [ ]` (incomplete) or
 * `- [x]` / `- [X]` (complete).
 */

import type { SiYuanHTTPClient } from './client.js';
import type { TodoItem } from './types.js';
import { ValidationError } from './errors.js';
import { logger } from './logger.js';

export interface CreateTodoOptions {
  /** Document ID to append the todo into */
  docId: string;
  /** Todo text content */
  content: string;
  /** Whether the todo is already done (default: false) */
  done?: boolean;
}

export class TodoModule {
  constructor(private readonly client: SiYuanHTTPClient) {}

  /**
   * List all todo items across all notebooks.
   * Uses SQL to query task-list blocks with checkbox markers.
   *
   * @param notebookId - Optional: restrict to a specific notebook
   * @returns Todo items with done status and location info
   */
  async listTodos(notebookId?: string): Promise<TodoItem[]> {
    const boxClause = notebookId ? `AND box = '${this.sanitize(notebookId)}'` : '';

    // SiYuan blocks.type uses lowercase short codes, NOT AST names:
    //   'i' = list item, 'l' = list container, 'd' = document ...
    // `type = 'NodeListItem'` matches ZERO rows — the historical cause of
    // list_todos always returning 0. Task-list (checkbox) items are identified
    // by subtype = 't'; verified against SiYuan 3.8.8 that subtype='t' items
    // always carry a `- [ ]` / `- [x]` / `- [X]` markdown prefix.
    // ORDER BY updated DESC: with LIMIT 200 an unordered scan truncates
    // arbitrarily; keep the most recently updated todos.
    const stmt = `SELECT id, content, markdown, box, path, hpath FROM blocks WHERE type = 'i' AND subtype = 't' ${boxClause} ORDER BY updated DESC LIMIT 200`;

    // SiYuan /api/query/sql returns data as Array<Record<string, unknown>> (each row is an object with column-name keys)
    const rows = await this.client.post<Array<Record<string, unknown>>>('query/sql', { stmt });

    if (!Array.isArray(rows)) {
      logger.warn('listTodos: unexpected SQL response (not an array)', { rows });
      return [];
    }

    return rows.map((row) => {
      const markdown = String(row.markdown ?? '');
      // Done state comes from the item's OWN checkbox marker (the markdown
      // prefix), not `markdown.includes('[x]')` — parent list items may embed
      // nested children whose markers would otherwise flip the parent's state.
      return {
        id: String(row.id ?? ''),
        content: this.extractTodoText(markdown),
        done: /^[-*+]\s*\[[xX]\]/.test(markdown),
        box: String(row.box ?? ''),
        path: String(row.path ?? ''),
        hPath: String(row.hpath ?? ''),
      } satisfies TodoItem;
    });
  }

  /**
   * Create a new todo item by appending a checkbox list block to a document.
   */
  async createTodo(options: CreateTodoOptions): Promise<string> {
    const { docId, content, done = false } = options;

    if (!docId) throw new ValidationError('docId is required');
    if (!content) throw new ValidationError('content is required');

    const checkbox = done ? '[x]' : '[ ]';
    const markdown = `- ${checkbox} ${content}`;

    // SiYuan returns data as: [{ doOperations: [...], undoOperations: null }]
    const data = await this.client.post<Array<{ doOperations: Array<{ id: string }>; undoOperations: unknown }>>('block/appendBlock', {
      dataType: 'markdown',
      data: markdown,
      parentID: docId,
    });

    if (Array.isArray(data) && data.length > 0 && data[0].doOperations?.length > 0) {
      return data[0].doOperations[0].id;
    }
    return '';
  }

  /**
   * Mark a todo as complete by updating its block content.
   * @param todoId - Block ID of the todo item (must be a valid block ID, not document ID)
   */
  async completeTodo(todoId: string): Promise<void> {
    if (!todoId) throw new ValidationError('todoId is required');

    // Validate todoId format: SiYuan block IDs are 22 chars (YYYYMMDDHHmmss-xxxxxxx)
    if (todoId.length < 22) {
      throw new ValidationError(
        `Invalid todo ID "${todoId}". Expected a block ID (e.g. 20240101120000-abc1234), not a document ID. Use list_todos to find the correct block ID.`,
      );
    }

    // First, get the current content of the block
    let blockData: { kramdown: string; id?: string };
    try {
      blockData = await this.client.post<{ kramdown: string; id: string }>('block/getBlockKramdown', {
        id: todoId,
      });
    } catch (err) {
      // If getBlockKramdown fails, the block doesn't exist
      throw new ValidationError(
        `Todo block "${todoId}" not found. Use list_todos to find valid todo block IDs.`,
      );
    }

    const kramdown = blockData.kramdown || '';

    // Verify this is actually a todo item (contains checkbox syntax)
    if (!kramdown.includes('[ ]') && !kramdown.includes('[x]') && !kramdown.includes('[X]')) {
      throw new ValidationError(
        `Block "${todoId}" is not a todo item (no checkbox found in content). Use list_todos to find valid todo block IDs.`,
      );
    }

    // Replace [ ] with [x]
    const updated = kramdown.replace(/\[ \]/, '[x]');

    if (updated === kramdown) {
      // Todo is already complete — not an error, just inform
      logger.info('Todo already marked as complete, skipping', { todoId });
      return;
    }

    // Update the block with kramdown dataType
    await this.client.post('block/updateBlock', {
      dataType: 'kramdown',
      data: updated,
      id: todoId,
    });
  }

  /**
   * Mark a todo as incomplete (un-complete).
   */
  async uncompleteTodo(todoId: string): Promise<void> {
    if (!todoId) throw new ValidationError('todoId is required');

    if (todoId.length < 22) {
      throw new ValidationError(
        `Invalid todo ID "${todoId}". Expected a block ID, not a document ID.`,
      );
    }

    let blockData: { kramdown: string };
    try {
      blockData = await this.client.post<{ kramdown: string }>('block/getBlockKramdown', {
        id: todoId,
      });
    } catch {
      throw new ValidationError(
        `Todo block "${todoId}" not found. Use list_todos to find valid todo block IDs.`,
      );
    }

    const kramdown = blockData.kramdown || '';

    if (!kramdown.includes('[x]') && !kramdown.includes('[X]') && !kramdown.includes('[ ]')) {
      throw new ValidationError(`Block "${todoId}" is not a todo item`);
    }

    const updated = kramdown.replace(/\[x\]/i, '[ ]');

    await this.client.post('block/updateBlock', {
      dataType: 'kramdown',
      data: updated,
      id: todoId,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private extractTodoText(markdown: string): string {
    // Remove checkbox markers: "- [ ] " or "- [x] "
    return markdown
      .replace(/^-\s*\[[ xX]\]\s*/, '')
      // Remove block ID markers: {block-id} (IDs are 4-40 alphanumeric chars)
      .replace(/\{[a-zA-Z0-9_-]{4,40}\}/g, '')
      // Decode entities — &amp; FIRST (before &gt;/&lt;/&quot;)
      // Reason: SiYuan may double-encode as &amp;gt; for >
      .replace(/&amp;/gi, '&')
      .replace(/&gt;/gi, '>')
      .replace(/&lt;/gi, '<')
      .replace(/&quot;/gi, '"')
      .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
      // Strip HTML tags (plugin wrappers, etc.)
      .replace(/<[^>]*>/g, '')
      // Strip kramdown inline attributes: {: ... }
      .replace(/\{:[\s\S]*?\}/g, '')
      .trim();
  }

  private sanitize(str: string): string {
    // Basic SQL injection prevention for notebook IDs
    return str.replace(/'/g, "''");
  }
}
