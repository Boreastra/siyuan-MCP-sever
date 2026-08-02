/**
 * MCP Tools - Handlers
 *
 * Each handler validates input via Zod, calls the SiYuan SDK (Phase 1/2)
 * or delegates to Workflows (Phase 3), and formats the result as MCP tool
 * response content.
 *
 * Architecture: Workflow → Tool → SDK → SiYuan API
 * Workflows can call multiple SDK methods. Tools call Workflows or SDK.
 */

import type { SiYuanClient } from '@siyuan-ai/sdk';
import { SiYuanError, logger } from '@siyuan-ai/sdk';

import {
  // Phase 1
  searchNotesSchema,
  readNoteSchema,
  createNoteSchema,
  appendNoteSchema,
  getDailyNoteSchema,
  // Phase 2
  listTodosSchema,
  createTodoSchema,
  completeTodoSchema,
  renameNoteSchema,
  moveNoteSchema,
  deleteNoteSchema,
  // Phase 3 (V1.1)
  knowledgeContextSchema,
  projectContextSchema,
  meetingSummarySchema,
  dailyReviewSchema,
  weeklyReviewSchema,
  findRelatedNotesSchema,
  // Phase 4 (V1.2)
  customerContextSchema,
  projectTimelineSchema,
  // Phase 5 (V1.1) — Notebook Management
  createNotebookSchema,
  renameNotebookSchema,
  deleteNotebookSchema,
} from './schemas.js';

// Workflows
import {
  KnowledgeContextWorkflow,
  ProjectContextWorkflow,
  MeetingSummaryWorkflow,
  DailyReviewWorkflow,
  WeeklyReviewWorkflow,
  FindRelatedNotesWorkflow,
  CustomerContextWorkflow,
  ProjectTimelineWorkflow,
} from '../workflows/index.js';

export interface ToolHandlerResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export class ToolHandlers {
  private readonly siyuan: SiYuanClient;

  // Workflow instances (lazy initialized)
  private _knowledgeContext?: KnowledgeContextWorkflow;
  private _projectContext?: ProjectContextWorkflow;
  private _meetingSummary?: MeetingSummaryWorkflow;
  private _dailyReview?: DailyReviewWorkflow;
  private _weeklyReview?: WeeklyReviewWorkflow;
  private _findRelatedNotes?: FindRelatedNotesWorkflow;
  private _customerContext?: CustomerContextWorkflow;
  private _projectTimeline?: ProjectTimelineWorkflow;

  constructor(siyuan: SiYuanClient) {
    this.siyuan = siyuan;
  }

  // ─── Lazy workflow accessors ─────────────────────────────────────

  private get knowledgeContext(): KnowledgeContextWorkflow {
    this._knowledgeContext ??= new KnowledgeContextWorkflow(this.siyuan);
    return this._knowledgeContext;
  }
  private get projectContext(): ProjectContextWorkflow {
    this._projectContext ??= new ProjectContextWorkflow(this.siyuan);
    return this._projectContext;
  }
  private get meetingSummary(): MeetingSummaryWorkflow {
    this._meetingSummary ??= new MeetingSummaryWorkflow(this.siyuan);
    return this._meetingSummary;
  }
  private get dailyReview(): DailyReviewWorkflow {
    this._dailyReview ??= new DailyReviewWorkflow(this.siyuan);
    return this._dailyReview;
  }
  private get weeklyReview(): WeeklyReviewWorkflow {
    this._weeklyReview ??= new WeeklyReviewWorkflow(this.siyuan);
    return this._weeklyReview;
  }
  private get findRelatedNotes(): FindRelatedNotesWorkflow {
    this._findRelatedNotes ??= new FindRelatedNotesWorkflow(this.siyuan);
    return this._findRelatedNotes;
  }
  private get customerContext(): CustomerContextWorkflow {
    this._customerContext ??= new CustomerContextWorkflow(this.siyuan);
    return this._customerContext;
  }
  private get projectTimeline(): ProjectTimelineWorkflow {
    this._projectTimeline ??= new ProjectTimelineWorkflow(this.siyuan);
    return this._projectTimeline;
  }

  async handle(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    try {
      switch (name) {
        // ─── Phase 1 ───────────────────────────────────────────────
        case 'search_notes':
          return await this.handleSearchNotes(args);
        case 'read_note':
          return await this.handleReadNote(args);
        case 'create_note':
          return await this.handleCreateNote(args);
        case 'append_note':
          return await this.handleAppendNote(args);
        case 'list_notebooks':
          return await this.handleListNotebooks(args);
        case 'get_daily_note':
          return await this.handleGetDailyNote(args);

        // ─── Phase 2 ───────────────────────────────────────────────
        case 'list_todos':
          return await this.handleListTodos(args);
        case 'create_todo':
          return await this.handleCreateTodo(args);
        case 'complete_todo':
          return await this.handleCompleteTodo(args);
        case 'rename_note':
          return await this.handleRenameNote(args);
        case 'move_note':
          return await this.handleMoveNote(args);
        case 'delete_note':
          return await this.handleDeleteNote(args);

        // ─── Phase 3 (V1.1) AI Workflows ───────────────────────────
        case 'knowledge_context':
          return await this.handleKnowledgeContext(args);
        case 'project_context':
          return await this.handleProjectContext(args);
        case 'meeting_summary':
          return await this.handleMeetingSummary(args);
        case 'daily_review':
          return await this.handleDailyReview(args);
        case 'weekly_review':
          return await this.handleWeeklyReview(args);
        case 'find_related_notes':
          return await this.handleFindRelatedNotes(args);

        // ─── Phase 4 (V1.2) ───────────────────────────────────────
        case 'customer_context':
          return await this.handleCustomerContext(args);
        case 'project_timeline':
          return await this.handleProjectTimeline(args);

        // ─── Phase 5 (V1.1) — Notebook Management ──────────────────
        case 'create_notebook':
          return await this.handleCreateNotebook(args);
        case 'rename_notebook':
          return await this.handleRenameNotebook(args);
        case 'delete_notebook':
          return await this.handleDeleteNotebook(args);

        default:
          return this.error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return this.handleError(err);
    }
  }

  // ─── Phase 1 Handlers ────────────────────────────────────────────

  private async handleSearchNotes(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { keyword, limit, mode, sort } = searchNotesSchema.parse(args);
    const results = await this.siyuan.search.searchNotes(keyword, limit);

    if (results.length === 0) {
      return this.text(`No notes found for keyword: "${keyword}"`);
    }

    // Apply sort based on mode/sort params
    let sorted = results;
    if (mode === 'recent' || sort === 'updated') {
      // Sort by path depth/snippet length as proxy for recency
      sorted = [...results].sort((a, b) => b.path.length - a.path.length);
    } else if (sort === 'composite' || mode === 'hybrid') {
      // Weighted: score * 0.7 + recency_proxy * 0.3 (default)
      sorted = [...results].sort((a, b) => {
        const aRecency = Math.min(a.path.length / 100, 1);
        const bRecency = Math.min(b.path.length / 100, 1);
        return b.score * 0.7 + bRecency * 0.3 - (a.score * 0.7 + aRecency * 0.3);
      });
    }

    const lines = sorted.map((r, i) => {
      const parts = [
        `### ${i + 1}. ${r.title}`,
        `- **ID**: ${r.id}`,
        `- **Path**: ${r.path}`,
        r.box ? `- **Notebook**: ${r.box}` : '',
        r.snippet ? `- **Snippet**: ${r.snippet}` : '',
      ].filter(Boolean);
      return parts.join('\n');
    });

    return this.text(
      `Found ${results.length} note(s) [mode: ${mode}, sort: ${sort}]:\n\n${lines.join('\n\n')}`,
    );
  }

  private async handleReadNote(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { doc_id } = readNoteSchema.parse(args);
    const content = await this.siyuan.documents.readDocument(doc_id);

    if (!content || content.trim() === '') {
      return this.text(`Document ${doc_id} is empty or not found.`);
    }

    return this.text(content);
  }

  private async handleCreateNote(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { notebook, path, title, markdown, auto_link } = createNoteSchema.parse(args);

    // Build full path with title
    const fullPath = path.endsWith('/') ? `${path}${title}` : `${path}/${title}`;

    const docId = await this.siyuan.documents.createDocument(
      notebook,
      fullPath,
      markdown,
    );

    let linkInfo = '';

    // Auto-link to related notes if enabled
    if (auto_link) {
      try {
        const related = await this.findRelatedNotes.execute({
          doc_id: docId,
        });
        const relatedCount =
          (related.meta?.relatedCount as number) ?? 0;
        if (relatedCount > 0) {
          linkInfo = `\n- **Auto-linked**: ${relatedCount} related notes found`;
        }
      } catch {
        linkInfo = '\n- **Auto-link**: attempted but failed silently';
      }
    }

    return this.text(
      `Document created successfully.\n- **ID**: ${docId}\n- **Path**: ${fullPath}${linkInfo}`,
    );
  }

  private async handleAppendNote(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { doc_id, markdown } = appendNoteSchema.parse(args);
    const blockId = await this.siyuan.documents.appendMarkdown(doc_id, markdown);

    return this.text(
      `Content appended to document ${doc_id}.\n- **Block ID**: ${blockId}`,
    );
  }

  private async handleListNotebooks(
    _args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const notebooks = await this.siyuan.notebooks.listNotebooks();

    if (notebooks.length === 0) {
      return this.text('No notebooks found.');
    }

    const lines = notebooks.map(
      (nb, i) =>
        `### ${i + 1}. ${nb.name}\n- **ID**: ${nb.id}\n- **Icon**: ${nb.icon || 'none'}`,
    );

    return this.text(
      `Found ${notebooks.length} notebook(s):\n\n${lines.join('\n\n')}`,
    );
  }

  private async handleGetDailyNote(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { notebook } = getDailyNoteSchema.parse(args);
    const dailyNote = await this.siyuan.documents.getDailyNote(notebook);

    if (!dailyNote) {
      return this.text(
        `Daily note for ${new Date().toISOString().split('T')[0]} not found. Ensure daily note is configured in SiYuan settings.`,
      );
    }

    return this.text(
      `Daily note for ${new Date().toISOString().split('T')[0]}:\n- **ID**: ${dailyNote.id}\n- **Path**: ${dailyNote.hPath || dailyNote.path}\n- **Notebook**: ${dailyNote.box}`,
    );
  }

  // ─── Phase 2 Handlers ────────────────────────────────────────────

  private async handleListTodos(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { notebook } = listTodosSchema.parse(args);
    const todos = await this.siyuan.todos.listTodos(notebook);

    if (todos.length === 0) {
      return this.text('No todo items found.');
    }

    const lines = todos.map((t, i) => {
      const status = t.done ? '[x]' : '[ ]';
      const parts = [
        `### ${i + 1}. ${status} ${t.content}`,
        `- **Block ID**: ${t.id}`,
        `- **Path**: ${t.hPath || t.path}`,
      ].filter(Boolean);
      return parts.join('\n');
    });

    const completed = todos.filter((t) => t.done).length;
    return this.text(
      `Found ${todos.length} todo(s) (${completed} completed):\n\n${lines.join('\n\n')}`,
    );
  }

  private async handleCreateTodo(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { doc_id, content, done } = createTodoSchema.parse(args);
    const blockId = await this.siyuan.createTodo(doc_id, content, done);

    return this.text(
      `Todo created in document ${doc_id}.\n- **Block ID**: ${blockId}\n- **Content**: ${content}\n- **Status**: ${done ? 'completed' : 'pending'}`,
    );
  }

  private async handleCompleteTodo(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { todo_id } = completeTodoSchema.parse(args);
    await this.siyuan.todos.completeTodo(todo_id);

    return this.text(`Todo ${todo_id} marked as complete.`);
  }

  private async handleRenameNote(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { doc_id, title } = renameNoteSchema.parse(args);
    await this.siyuan.documents.renameNote(doc_id, title);

    return this.text(`Document ${doc_id} renamed to "${title}".`);
  }

  private async handleMoveNote(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { doc_id, notebook, path } = moveNoteSchema.parse(args);
    await this.siyuan.documents.moveNote(doc_id, notebook, path);

    return this.text(`Document ${doc_id} moved to notebook ${notebook}.`);
  }

  private async handleDeleteNote(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { doc_id } = deleteNoteSchema.parse(args);
    await this.siyuan.documents.deleteNote(doc_id);

    return this.text(`Document ${doc_id} deleted.`);
  }

  // ─── Phase 3 (V1.1) AI Workflow Handlers ─────────────────────────

  private async handleKnowledgeContext(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { topic, depth } = knowledgeContextSchema.parse(args);
    const result = await this.knowledgeContext.execute({ topic, depth });
    return this.text(result.content);
  }

  private async handleProjectContext(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { project, depth } = projectContextSchema.parse(args);
    const result = await this.projectContext.execute({
      project,
      project_name: project,
      depth,
    });
    return this.text(result.content);
  }

  private async handleMeetingSummary(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { content, title, notebook, path, append_to, auto_link } =
      meetingSummarySchema.parse(args);
    const result = await this.meetingSummary.execute({
      content,
      meeting_notes: content,
      title: title ?? undefined,
      notebook: notebook ?? '',
      path: path ?? '/Meetings',
      append_to: append_to ?? '',
      doc_id: append_to ?? '',
      auto_link,
    });
    return this.text(result.content);
  }

  private async handleDailyReview(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { notebook } = dailyReviewSchema.parse(args);
    const result = await this.dailyReview.execute({
      notebook: notebook ?? '',
    });
    return this.text(result.content);
  }

  private async handleWeeklyReview(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { notebook } = weeklyReviewSchema.parse(args);
    const result = await this.weeklyReview.execute({
      notebook: notebook ?? '',
    });
    return this.text(result.content);
  }

  private async handleFindRelatedNotes(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { doc_id } = findRelatedNotesSchema.parse(args);
    const result = await this.findRelatedNotes.execute({ doc_id });
    return this.text(result.content);
  }

  // ─── Phase 4 (V1.2) Handlers ────────────────────────────────────

  private async handleCustomerContext(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { customer, depth } = customerContextSchema.parse(args);
    const result = await this.customerContext.execute({ customer, depth });
    return this.text(result.content);
  }

  private async handleProjectTimeline(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { project, depth } = projectTimelineSchema.parse(args);
    const result = await this.projectTimeline.execute({ project, depth });
    return this.text(result.content);
  }

  // ─── Phase 5 (V1.1) — Notebook Management Handlers ──────────────

  private async handleCreateNotebook(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { name } = createNotebookSchema.parse(args);
    const notebook = await this.siyuan.notebooks.createNotebook(name);

    return this.text(
      `Notebook created successfully.\n- **ID**: ${notebook.id}\n- **Name**: ${notebook.name}\n- **Icon**: ${notebook.icon || 'none'}\n- **Closed**: ${notebook.closed ?? false}`,
    );
  }

  private async handleRenameNotebook(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { notebook_id, name } = renameNotebookSchema.parse(args);
    await this.siyuan.notebooks.renameNotebook(notebook_id, name);

    return this.text(
      `Notebook ${notebook_id} renamed to "${name}".`,
    );
  }

  private async handleDeleteNotebook(
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> {
    const { notebook_id } = deleteNotebookSchema.parse(args);
    await this.siyuan.notebooks.removeNotebook(notebook_id);

    return this.text(
      `Notebook ${notebook_id} has been deleted.`,
    );
  }

  // ─── Response Helpers ────────────────────────────────────────────

  private text(text: string): ToolHandlerResult {
    return { content: [{ type: 'text', text }] };
  }

  private error(message: string): ToolHandlerResult {
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }

  private handleError(err: unknown): ToolHandlerResult {
    if (err instanceof SiYuanError) {
      logger.error('Tool error', {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
      });
      return {
        content: [
          {
            type: 'text',
            text: `SiYuan error [${err.code}]: ${err.message}`,
          },
        ],
        isError: true,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    logger.error('Unexpected tool error', { message });
    return {
      content: [{ type: 'text', text: `Unexpected error: ${message}` }],
      isError: true,
    };
  }
}
