/**
 * MCP Tool Handlers Test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolHandlers } from '../src/tools/handlers.js';
import { SiYuanError, ValidationError } from '@siyuan-ai/sdk';

// Create a mock SiYuanClient
function createMockSiYuanClient() {
  return {
    http: { baseURL: 'http://mock:6806' },
    auth: {
      checkAuth: vi.fn().mockResolvedValue(true),
      getSystemInfo: vi.fn().mockResolvedValue({ version: '3.1.0', kernelStarted: true }),
    },
    notebooks: {
      listNotebooks: vi.fn().mockResolvedValue([]),
      getNotebook: vi.fn().mockResolvedValue(undefined),
      getNotebookByName: vi.fn().mockResolvedValue(undefined),
    },
    documents: {
      readDocument: vi.fn().mockResolvedValue(''),
      createDocument: vi.fn().mockResolvedValue(''),
      appendMarkdown: vi.fn().mockResolvedValue(''),
      getDailyNote: vi.fn().mockResolvedValue({}),
      renameNote: vi.fn().mockResolvedValue(undefined),
      moveNote: vi.fn().mockResolvedValue(undefined),
      deleteNote: vi.fn().mockResolvedValue(undefined),
    },
    todos: {
      listTodos: vi.fn().mockResolvedValue([]),
      createTodo: vi.fn().mockResolvedValue(''),
      completeTodo: vi.fn().mockResolvedValue(undefined),
    },
    search: {
      searchNotes: vi.fn().mockResolvedValue([]),
      searchDocs: vi.fn().mockResolvedValue([]),
      searchBlocks: vi.fn().mockResolvedValue([]),
      sql: vi.fn().mockResolvedValue({ columns: [], rows: [] }),
    },
    ping: vi.fn().mockResolvedValue(true),
    // High-level convenience methods
    createTodo: vi.fn().mockResolvedValue(''),
    getDailyNote: vi.fn().mockResolvedValue({}),
  };
}

describe('ToolHandlers', () => {
  let mockClient: ReturnType<typeof createMockSiYuanClient>;
  let handlers: ToolHandlers;

  beforeEach(() => {
    mockClient = createMockSiYuanClient();
    handlers = new ToolHandlers(mockClient as any);
  });

  describe('search_notes', () => {
    it('returns formatted results when notes found', async () => {
      mockClient.search.searchNotes.mockResolvedValue([
        {
          id: 'doc1',
          title: 'Meeting Notes',
          path: '/Meetings/2026-08-01',
          box: 'nb1',
          snippet: 'Discussed project timeline',
          score: 2.0,
        },
      ]);

      const result = await handlers.handle('search_notes', { keyword: 'meeting' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Meeting Notes');
      expect(result.content[0].text).toContain('doc1');
      expect(result.content[0].text).toContain('Found 1 note');
    });

    it('returns empty message when no results', async () => {
      mockClient.search.searchNotes.mockResolvedValue([]);

      const result = await handlers.handle('search_notes', { keyword: 'nonexistent' });

      expect(result.content[0].text).toContain('No notes found');
    });

    it('passes keyword and limit to SDK', async () => {
      mockClient.search.searchNotes.mockResolvedValue([]);

      await handlers.handle('search_notes', { keyword: 'docker', limit: 5 });

      expect(mockClient.search.searchNotes).toHaveBeenCalledWith('docker', 5);
    });
  });

  describe('read_note', () => {
    it('returns document content', async () => {
      mockClient.documents.readDocument.mockResolvedValue('# Title\n\nContent');

      const result = await handlers.handle('read_note', { doc_id: 'doc123' });

      expect(result.content[0].text).toBe('# Title\n\nContent');
      expect(mockClient.documents.readDocument).toHaveBeenCalledWith('doc123');
    });

    it('returns empty message for empty document', async () => {
      mockClient.documents.readDocument.mockResolvedValue('');

      const result = await handlers.handle('read_note', { doc_id: 'empty' });

      expect(result.content[0].text).toContain('empty or not found');
    });
  });

  describe('create_note', () => {
    it('creates note and returns doc ID', async () => {
      mockClient.documents.createDocument.mockResolvedValue('newdoc456');

      const result = await handlers.handle('create_note', {
        notebook: 'nb1',
        path: '/Meetings',
        title: 'Standup',
        markdown: '# Standup\n\nNotes',
      });

      expect(result.content[0].text).toContain('newdoc456');
      expect(result.content[0].text).toContain('Document created');
      // Path should be /Meetings/Standup
      expect(mockClient.documents.createDocument).toHaveBeenCalledWith(
        'nb1',
        '/Meetings/Standup',
        '# Standup\n\nNotes',
      );
    });
  });

  describe('append_note', () => {
    it('appends content and returns block ID', async () => {
      mockClient.documents.appendMarkdown.mockResolvedValue('block789');

      const result = await handlers.handle('append_note', {
        doc_id: 'doc1',
        markdown: '## New Section',
      });

      expect(result.content[0].text).toContain('block789');
      expect(result.content[0].text).toContain('Content appended');
    });
  });

  describe('list_notebooks', () => {
    it('returns all notebooks', async () => {
      mockClient.notebooks.listNotebooks.mockResolvedValue([
        { id: 'nb1', name: 'Inbox', icon: '1F4E5' },
        { id: 'nb2', name: 'Projects', icon: '1F4DA' },
      ]);

      const result = await handlers.handle('list_notebooks', {});

      expect(result.content[0].text).toContain('Inbox');
      expect(result.content[0].text).toContain('Projects');
      expect(result.content[0].text).toContain('Found 2 notebook');
    });

    it('returns empty message when no notebooks', async () => {
      mockClient.notebooks.listNotebooks.mockResolvedValue([]);

      const result = await handlers.handle('list_notebooks', {});

      expect(result.content[0].text).toContain('No notebooks found');
    });
  });

  describe('get_daily_note', () => {
    it('returns daily note info', async () => {
      mockClient.documents.getDailyNote.mockResolvedValue({
        id: 'daily1',
        path: '/daily/2026-08-01',
        hPath: '/Daily/2026-08-01',
        box: 'nb1',
        isNew: false,
      });

      const result = await handlers.handle('get_daily_note', {});

      expect(result.content[0].text).toContain('daily1');
      expect(result.content[0].text).toContain('Daily note');
    });
  });

  describe('list_todos', () => {
    it('returns formatted todo list', async () => {
      mockClient.todos.listTodos.mockResolvedValue([
        { id: 't1', content: 'Buy milk', done: false, box: 'nb1', path: '/tasks', hPath: '/Tasks' },
        { id: 't2', content: 'Call John', done: true, box: 'nb1', path: '/tasks', hPath: '/Tasks' },
      ]);

      const result = await handlers.handle('list_todos', {});

      expect(result.content[0].text).toContain('Buy milk');
      expect(result.content[0].text).toContain('[ ]');
      expect(result.content[0].text).toContain('Call John');
      expect(result.content[0].text).toContain('[x]');
      expect(result.content[0].text).toContain('1 completed');
    });

    it('returns empty message when no todos', async () => {
      mockClient.todos.listTodos.mockResolvedValue([]);

      const result = await handlers.handle('list_todos', {});

      expect(result.content[0].text).toContain('No todo items');
    });
  });

  describe('create_todo', () => {
    it('creates todo and returns block ID', async () => {
      mockClient.createTodo.mockResolvedValue('block123');

      const result = await handlers.handle('create_todo', {
        doc_id: 'doc1',
        content: 'Review PR',
        done: false,
      });

      expect(result.content[0].text).toContain('block123');
      expect(result.content[0].text).toContain('Review PR');
      expect(result.content[0].text).toContain('pending');
    });
  });

  describe('complete_todo', () => {
    it('marks todo as complete', async () => {
      const result = await handlers.handle('complete_todo', { todo_id: 'todo1' });

      expect(result.content[0].text).toContain('marked as complete');
      expect(mockClient.todos.completeTodo).toHaveBeenCalledWith('todo1');
    });
  });

  describe('rename_note', () => {
    it('renames document', async () => {
      const result = await handlers.handle('rename_note', {
        doc_id: 'doc1',
        title: 'New Title',
      });

      expect(result.content[0].text).toContain('renamed');
      expect(result.content[0].text).toContain('New Title');
    });
  });

  describe('move_note', () => {
    it('moves document', async () => {
      const result = await handlers.handle('move_note', {
        doc_id: 'doc1',
        notebook: 'nb2',
        path: '/Archive',
      });

      expect(result.content[0].text).toContain('moved');
      expect(result.content[0].text).toContain('nb2');
    });
  });

  describe('delete_note', () => {
    it('deletes document', async () => {
      const result = await handlers.handle('delete_note', { doc_id: 'doc1' });

      expect(result.content[0].text).toContain('deleted');
    });
  });

  describe('error handling', () => {
    it('returns error for unknown tool', async () => {
      const result = await handlers.handle('unknown_tool', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });

    it('handles SiYuanError properly', async () => {
      mockClient.search.searchNotes.mockRejectedValue(
        new SiYuanError('AUTH_ERROR', 'Token invalid'),
      );

      const result = await handlers.handle('search_notes', { keyword: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('AUTH_ERROR');
      expect(result.content[0].text).toContain('Token invalid');
    });

    it('handles ValidationError for missing required fields', async () => {
      const result = await handlers.handle('search_notes', { keyword: '' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
    });

    it('handles unexpected errors', async () => {
      mockClient.search.searchNotes.mockRejectedValue(new Error('Unexpected'));

      const result = await handlers.handle('search_notes', { keyword: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unexpected error');
    });
  });
});
