/**
 * Todo Module Test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TodoModule } from '../src/todo.js';
import { ValidationError } from '../src/errors.js';
import { createMockClient, apiResponse } from './mock-client.js';

describe('TodoModule', () => {
  let mock: ReturnType<typeof createMockClient>;
  let module: TodoModule;

  beforeEach(() => {
    mock = createMockClient();
    mock.resetMocks();
    module = new TodoModule(mock as any);
  });

  describe('listTodos', () => {
    it('returns todo items from SQL query', async () => {
      // SiYuan /api/query/sql returns data as array of row objects
      mock.mockResponse('query/sql', apiResponse([
        { id: 'todo1', content: 'Buy milk', markdown: '- [ ] Buy milk {abc123}', box: 'nb1', path: '/tasks/note1', hpath: '/Tasks/Note1' },
        { id: 'todo2', content: 'Call John', markdown: '- [x] Call John {def456}', box: 'nb1', path: '/tasks/note2', hpath: '/Tasks/Note2' },
      ]));

      const result = await module.listTodos();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('todo1');
      expect(result[0].content).toBe('Buy milk');
      expect(result[0].done).toBe(false);
      expect(result[1].id).toBe('todo2');
      expect(result[1].done).toBe(true);
      expect(mock.getCalls()[0].endpoint).toBe('query/sql');
    });

    it('filters by notebook when provided', async () => {
      mock.mockResponse('query/sql', apiResponse([]));

      await module.listTodos('nb1');

      const stmt = mock.getCalls()[0].payload?.stmt as string;
      expect(stmt).toContain("box = 'nb1'");
    });

    it('regression: queries task-list items by type=i AND subtype=t, not NodeListItem', async () => {
      // SiYuan blocks.type stores lowercase short codes ('i' = list item);
      // `type = 'NodeListItem'` matches zero rows and made list_todos return 0.
      mock.mockResponse('query/sql', apiResponse([]));

      await module.listTodos();

      const stmt = mock.getCalls()[0].payload?.stmt as string;
      expect(stmt).toContain("type = 'i'");
      expect(stmt).toContain("subtype = 't'");
      expect(stmt).not.toContain('NodeListItem');
    });

    it('regression: orders by updated DESC so LIMIT keeps the most recent todos', async () => {
      mock.mockResponse('query/sql', apiResponse([]));

      await module.listTodos();

      const stmt = mock.getCalls()[0].payload?.stmt as string;
      expect(stmt).toContain('ORDER BY updated DESC');
      expect(stmt).toContain('LIMIT 200');
    });

    it('regression: detects done state from own checkbox prefix, uppercase [X]', async () => {
      mock.mockResponse('query/sql', apiResponse([
        { id: 't1', content: '', markdown: '- [X] Uppercase done', box: 'nb1', path: '/p', hpath: '/p' },
      ]));

      const result = await module.listTodos();
      expect(result[0].done).toBe(true);
    });

    it('regression: parent with [ ] prefix stays undone even if nested children contain [x]', async () => {
      // Parent markdown embeds nested children; `includes('[x]')` would
      // wrongly flip the parent's done state.
      mock.mockResponse('query/sql', apiResponse([
        { id: 't1', content: '', markdown: '- [ ] Parent task\n\n  - [x] Child done', box: 'nb1', path: '/p', hpath: '/p' },
      ]));

      const result = await module.listTodos();
      expect(result[0].done).toBe(false);
    });

    it('returns empty array when no todos', async () => {
      mock.mockResponse('query/sql', apiResponse([]));
      const result = await module.listTodos();
      expect(result).toEqual([]);
    });

    it('extracts clean text from markdown', async () => {
      mock.mockResponse('query/sql', apiResponse([
        { id: 't1', content: '', markdown: '- [ ] Review PR {20260801120000abc123def456}', box: 'nb1', path: '/p', hpath: '/p' },
      ]));

      const result = await module.listTodos();
      expect(result[0].content).toBe('Review PR');
      expect(result[0].content).not.toContain('{');
    });

    it('strips HTML from todo markdown', async () => {
      mock.mockResponse('query/sql', apiResponse([
        { id: 't1', content: '', markdown: '- [ ] <div data-type="siyuan-plugin">Task with HTML</div> {20240101120000-abc1234}', box: 'nb1', path: '/p', hpath: '/p' },
      ]));

      const result = await module.listTodos();
      expect(result[0].content).toBe('Task with HTML');
      expect(result[0].content).not.toContain('<');
      expect(result[0].content).not.toContain('data-type');
    });

    it('strips entity-encoded HTML from todo markdown', async () => {
      // When SiYuan returns entity-encoded HTML (e.g. &quot;, &gt;),
      // extractTodoText must decode entities before stripping tags
      mock.mockResponse('query/sql', apiResponse([
        { id: 't1', content: '', markdown: '- [ ] <div contenteditable=&quot;false&quot; data-type=&quot;siyuan-plugin-custom-wrapper&quot; style=&quot;position: absolute;&quot;&gt;<div class=&quot;siyuan-plugin-task-date-info&quot;&gt;完成时间: 2026-07-27&lt;/div&gt;&lt;/div&gt; {20240101120000-abc1234}', box: 'nb1', path: '/p', hpath: '/p' },
      ]));

      const result = await module.listTodos();
      expect(result[0].content).toBe('完成时间: 2026-07-27');
      expect(result[0].content).not.toContain('contenteditable');
      expect(result[0].content).not.toContain('siyuan-plugin');
      expect(result[0].content).not.toContain('&');
      expect(result[0].content).not.toContain('<');
    });
  });

  describe('createTodo', () => {
    it('appends a checkbox list item', async () => {
      mock.mockResponse('appendBlock', apiResponse([{
        doOperations: [{ id: 'newblock1' }],
        undoOperations: null,
      }]));

      const result = await module.createTodo({
        docId: 'doc123',
        content: 'Review pull request',
        done: false,
      });

      expect(result).toBe('newblock1');
      expect(mock.getCalls()[0].endpoint).toBe('block/appendBlock');
      expect(mock.getCalls()[0].payload?.dataType).toBe('markdown');
      expect(mock.getCalls()[0].payload?.data).toBe('- [ ] Review pull request');
      expect(mock.getCalls()[0].payload?.parentID).toBe('doc123');
    });

    it('creates checked todo when done=true', async () => {
      mock.mockResponse('appendBlock', apiResponse([{
        doOperations: [{ id: 'b1' }],
        undoOperations: null,
      }]));

      await module.createTodo({
        docId: 'doc1',
        content: 'Done task',
        done: true,
      });

      expect(mock.getCalls()[0].payload?.data).toBe('- [x] Done task');
    });

    it('throws ValidationError for missing docId', async () => {
      await expect(
        module.createTodo({ docId: '', content: 'test' }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for missing content', async () => {
      await expect(
        module.createTodo({ docId: 'doc1', content: '' }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('completeTodo', () => {
    it('gets block kramdown and updates with [x]', async () => {
      // Block IDs are 22 chars (YYYYMMDDHHmmss-xxxxxxx)
      const todoId = '20240101120000-abc1234';

      mock.mockResponse('getBlockKramdown', apiResponse({
        kramdown: '- [ ] Task item {block123}',
        id: todoId,
      }));
      mock.mockResponse('updateBlock', apiResponse([{
        doOperations: [],
        undoOperations: null,
      }]));

      await module.completeTodo(todoId);

      expect(mock.getCalls()).toHaveLength(2);
      expect(mock.getCalls()[0].endpoint).toBe('block/getBlockKramdown');
      expect(mock.getCalls()[1].endpoint).toBe('block/updateBlock');
      const updateData = mock.getCalls()[1].payload?.data as string;
      expect(updateData).toContain('[x]');
      expect(updateData).not.toContain('[ ]');
      expect(mock.getCalls()[1].payload?.dataType).toBe('kramdown');
    });

    it('throws ValidationError for empty todoId', async () => {
      await expect(module.completeTodo('')).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for short todoId (looks like document ID)', async () => {
      await expect(module.completeTodo('20260801170959-21fvp2v')).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when block is not a todo', async () => {
      const todoId = '20240101120000-abc1234';
      mock.mockResponse('getBlockKramdown', apiResponse({
        kramdown: '# Just a heading',
        id: todoId,
      }));

      await expect(module.completeTodo(todoId)).rejects.toThrow(ValidationError);
    });
  });

  describe('uncompleteTodo', () => {
    it('gets block kramdown and updates with [ ]', async () => {
      const todoId = '20240101120000-abc1234';

      mock.mockResponse('getBlockKramdown', apiResponse({
        kramdown: '- [x] Done task {block123}',
        id: todoId,
      }));
      mock.mockResponse('updateBlock', apiResponse([{
        doOperations: [],
        undoOperations: null,
      }]));

      await module.uncompleteTodo(todoId);

      const updateData = mock.getCalls()[1].payload?.data as string;
      expect(updateData).toContain('[ ]');
      expect(updateData).not.toContain('[x]');
      expect(mock.getCalls()[1].payload?.dataType).toBe('kramdown');
    });
  });
});
