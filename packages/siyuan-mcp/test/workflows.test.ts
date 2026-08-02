/**
 * V1.1 Workflow Tests
 *
 * Tests for cache, template engine, and all 6 AI workflows.
 * Uses mocked SiYuanClient.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowCache, workflowCache } from '../src/cache/index.js';
import {
  loadTemplate,
  renderTemplate,
  applyTemplate,
} from '../src/templates/engine.js';
import { KnowledgeContextWorkflow } from '../src/workflows/knowledge-context.js';
import { ProjectContextWorkflow } from '../src/workflows/project-context.js';
import { MeetingSummaryWorkflow } from '../src/workflows/meeting-summary.js';
import { DailyReviewWorkflow } from '../src/workflows/daily-review.js';
import { WeeklyReviewWorkflow } from '../src/workflows/weekly-review.js';
import {
  FindRelatedNotesWorkflow,
} from '../src/workflows/find-related-notes.js';
import { CustomerContextWorkflow } from '../src/workflows/customer-context.js';
import { ProjectTimelineWorkflow } from '../src/workflows/project-timeline.js';

// A minimal mock SiYuanClient
function createMockClient(overrides: Record<string, unknown> = {}) {
  return {
    searchNotes: vi.fn().mockResolvedValue([]),
    readDocument: vi.fn().mockResolvedValue(''),
    createDocument: vi.fn().mockResolvedValue('mock-doc-id'),
    appendMarkdown: vi.fn().mockResolvedValue('mock-block-id'),
    listTodos: vi.fn().mockResolvedValue([]),
    createTodo: vi.fn().mockResolvedValue('mock-todo-block'),
    completeTodo: vi.fn().mockResolvedValue(undefined),
    getDailyNote: vi.fn().mockResolvedValue({
      id: 'daily-note-id',
      path: '/daily/2026-08-01',
      hPath: '/daily/2026-08-01',
      box: 'notebook1',
      isNew: false,
    }),
    renameNote: vi.fn().mockResolvedValue(undefined),
    moveNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue(true),
    // SDK sub-modules
    search: {
      searchNotes: vi.fn().mockResolvedValue([]),
    },
    documents: {
      readDocument: vi.fn().mockResolvedValue(''),
      createDocument: vi.fn().mockResolvedValue('mock-doc-id'),
      appendMarkdown: vi.fn().mockResolvedValue('mock-block-id'),
      getDailyNote: vi.fn().mockResolvedValue({
        id: 'daily-note-id',
        path: '/daily/2026-08-01',
        hPath: '/daily/2026-08-01',
        box: 'notebook1',
        isNew: false,
      }),
      renameNote: vi.fn().mockResolvedValue(undefined),
      moveNote: vi.fn().mockResolvedValue(undefined),
      deleteNote: vi.fn().mockResolvedValue(undefined),
    },
    todos: {
      listTodos: vi.fn().mockResolvedValue([]),
      createTodo: vi.fn().mockResolvedValue('mock-todo-block'),
      completeTodo: vi.fn().mockResolvedValue(undefined),
    },
    notebooks: {
      listNotebooks: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as import('@siyuan-ai/sdk').SiYuanClient;
}

// ─── Cache Tests ────────────────────────────────────────────────────

describe('WorkflowCache', () => {
  let cache: WorkflowCache;

  beforeEach(() => {
    cache = new WorkflowCache(1000); // 1s TTL for tests
  });

  it('should store and retrieve values', () => {
    cache.set('key1', { data: 'hello' });
    expect(cache.get('key1')).toEqual({ data: 'hello' });
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should expire entries after TTL', async () => {
    cache = new WorkflowCache(10); // 10ms TTL
    cache.set('fast', 'value');
    expect(cache.get('fast')).toBe('value');
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get('fast')).toBeUndefined();
  });

  it('should generate consistent cache keys', () => {
    const k1 = WorkflowCache.key('test1', { a: 1, b: 2 });
    const k2 = WorkflowCache.key('test1', { b: 2, a: 1 }); // different order
    expect(k1).toBe(k2);
  });

  it('should generate different keys for different params', () => {
    const k1 = WorkflowCache.key('test1', { a: 1 });
    const k2 = WorkflowCache.key('test1', { a: 2 });
    expect(k1).not.toBe(k2);
  });

  it('should expireAll', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.expireAll();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
  });
});

// ─── Template Engine Tests ──────────────────────────────────────────

describe('Template Engine', () => {
  it('should load template by name', () => {
    const t = loadTemplate('daily_review');
    expect(t).toContain('日报');
    expect(t).toContain('{{date}}');
  });

  it('should throw for nonexistent template', () => {
    expect(() => loadTemplate('nonexistent_template')).toThrow();
  });

  it('should render simple variables', () => {
    const result = renderTemplate('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('should render sections with arrays', () => {
    const result = renderTemplate(
      '{{#items}}- {{name}}\n{{/items}}',
      { items: [{ name: 'A' }, { name: 'B' }] },
    );
    expect(result).toBe('- A\n- B\n');
  });

  it('should render inverted sections when falsy', () => {
    const result = renderTemplate(
      '{{#has}}yes{{/has}}{{^has}}no{{/has}}',
      { has: null },
    );
    expect(result).toBe('no');
  });

  it('should render inverted sections when empty array', () => {
    const result = renderTemplate(
      '{{^items}}empty{{/items}}',
      { items: [] },
    );
    expect(result).toBe('empty');
  });

  it('should applyTemplate load and render', () => {
    const result = applyTemplate('daily_review', {
      date: '2026-08-01',
      overview: 'Test overview',
      completedCount: '3',
      completed: [{ content: 'Task 1', id: '1', docPath: '/test' }],
      pendingCount: '1',
      pending: [{ content: 'Task 2', id: '2', docPath: '/test' }],
      meetings: [],
      highlights: ['Highlight 1'],
      tomorrowPlan: ['Plan 1'],
    });
    expect(result).toContain('2026-08-01');
    expect(result).toContain('Task 1');
    expect(result).toContain('Task 2');
    expect(result).toContain('今日无会议记录');
  });
});

// ─── Knowledge Context Workflow ─────────────────────────────────────

describe('KnowledgeContextWorkflow', () => {
  it('should return error for empty topic', async () => {
    const client = createMockClient();
    const wf = new KnowledgeContextWorkflow(client);
    const result = await wf.execute({ topic: '' });
    expect(result.content).toContain('Error');
  });

  it('should return empty result when no documents found', async () => {
    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([]),
    });
    const wf = new KnowledgeContextWorkflow(client);
    const result = await wf.execute({ topic: 'nonexistent', depth: 3 });
    expect(result.content).toContain('No related documents');
  });

  it('should build knowledge context with results', async () => {
    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([
        {
          id: 'doc1',
          title: 'CRM Project Overview',
          path: '/Projects/CRM/Overview',
          box: 'notebook1',
          snippet: 'CRM is a customer relationship...',
          score: 0.9,
        },
        {
          id: 'doc2',
          title: 'CRM 需求文档',
          path: '/Projects/CRM/Requirements',
          box: 'notebook1',
          snippet: '功能需求：客户管理...',
          score: 0.85,
        },
      ]),
      readDocument: vi.fn()
        .mockResolvedValueOnce('# CRM Project Overview\n\nCRM system design and architecture.')
        .mockResolvedValueOnce('# CRM 需求文档\n\n功能需求包括客户管理和销售跟踪。'),
      listTodos: vi.fn().mockResolvedValue([
        {
          id: 'todo1',
          content: 'Review CRM architecture',
          done: false,
          path: '/todo',
          hPath: '/todo',
          box: 'notebook1',
        },
      ]),
    });
    const wf = new KnowledgeContextWorkflow(client);
    const result = await wf.execute({ topic: 'CRM', depth: 3 });

    expect(result.content).toContain('Knowledge Context');
    expect(result.content).toContain('CRM Project Overview');
    expect(result.content).toContain('CRM 需求文档');
    expect(result.content).toContain('相关文档');
  });

  it('should use cache on repeated calls', async () => {
    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([
        {
          id: 'doc1',
          title: 'Test',
          path: '/test',
          box: 'n1',
          snippet: 'test',
          score: 0.5,
        },
      ]),
      readDocument: vi.fn().mockResolvedValue('# Test'),
    });
    const wf = new KnowledgeContextWorkflow(client);
    await wf.execute({ topic: 'test', depth: 1 });
    await wf.execute({ topic: 'test', depth: 1 });
    // Should only call search once (second is cache hit)
    expect(client.searchNotes).toHaveBeenCalledTimes(1);
  });
});

// ─── Project Context Workflow ───────────────────────────────────────

describe('ProjectContextWorkflow', () => {
  it('should return error for empty project name', async () => {
    const client = createMockClient();
    const wf = new ProjectContextWorkflow(client);
    const result = await wf.execute({ project: '' });
    expect(result.content).toContain('Error');
  });

  it('should aggregate project context', async () => {
    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([
        { id: '1', title: 'CRM 设计文档', path: '/CRM/design', box: 'n1', snippet: '', score: 0.9 },
        { id: '2', title: 'CRM 会议纪要 2026-08-01', path: '/Meetings/CRM', box: 'n1', snippet: '', score: 0.8 },
      ]),
      readDocument: vi.fn()
        .mockResolvedValueOnce('# CRM 设计文档\n\n架构设计')
        .mockResolvedValueOnce('# CRM 会议纪要\n\n讨论内容'),
    });
    const wf = new ProjectContextWorkflow(client);
    const result = await wf.execute({ project: 'CRM', depth: 5 });

    expect(result.content).toContain('CRM');
    expect(result.content).toContain('设计文档');
    expect(result.content).toContain('会议');
  });
});

// ─── Meeting Summary Workflow ───────────────────────────────────────

describe('MeetingSummaryWorkflow', () => {
  it('should return error for empty content', async () => {
    const client = createMockClient();
    const wf = new MeetingSummaryWorkflow(client);
    const result = await wf.execute({ content: '' });
    expect(result.content).toContain('Error');
  });

  it('should parse meeting content and extract structure', async () => {
    const meetingContent = `# CRM 项目周会

日期：2026-08-01
参会：张三、李四
主题：CRM 上线计划

## 摘要
讨论 CRM 上线时间和测试方案。

## 决策
- 8月15日上线 @张三
- 使用蓝绿部署方案

## 行动
- 准备上线文档 @李四 📅 2026-08-10
- 执行性能测试 @张三 📅 2026-08-12 P1

## 风险
- 🔴 测试环境资源不足
- 数据库迁移风险`;

    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([]),
      createDocument: vi.fn().mockResolvedValue('new-doc-id'),
      appendMarkdown: vi.fn().mockResolvedValue('block-id'),
    });
    const wf = new MeetingSummaryWorkflow(client);
    const result = await wf.execute({
      content: meetingContent,
      title: 'CRM 项目周会',
      auto_link: false,
    });

    expect(result.content).toContain('CRM 项目周会');
    expect(result.content).toContain('8月15日上线');
    expect(result.content).toContain('蓝绿部署');
    expect(result.content).toContain('性能测试');
    expect(result.content).toContain('测试环境资源不足');
    expect(result.meta?.decisions).toBe(2);
    expect(result.meta?.actions).toBe(2);
    expect(result.meta?.risks).toBe(2);
  });

  it('should append to existing document when append_to is set', async () => {
    const client = createMockClient({
      appendMarkdown: vi.fn().mockResolvedValue('appended-block'),
    });
    const wf = new MeetingSummaryWorkflow(client);
    const result = await wf.execute({
      content: '# Test Meeting\n\n摘要：测试',
      append_to: 'existing-doc-id',
      auto_link: false,
    });

    expect(client.appendMarkdown).toHaveBeenCalledWith(
      'existing-doc-id',
      expect.any(String),
    );
    expect(result.content).toContain('已追加');
  });

  it('should create new document when notebook is set', async () => {
    const client = createMockClient({
      createDocument: vi.fn().mockResolvedValue('new-meeting-id'),
    });
    // Also mock documents.createDocument
    (client as any).documents = {
      ...(client as any).documents,
      createDocument: vi.fn().mockResolvedValue('new-meeting-id'),
    };
    const wf = new MeetingSummaryWorkflow(client);
    const result = await wf.execute({
      content: '# Test\n\n摘要：测试',
      notebook: 'nb1',
      path: '/Meetings',
      title: 'Weekly Standup',
      auto_link: false,
    });

    expect(result.content).toContain('已创建文档');
  });
});

// ─── Daily Review Workflow ──────────────────────────────────────────

describe('DailyReviewWorkflow', () => {
  it('should generate daily review', async () => {
    const client = createMockClient({
      getDailyNote: vi.fn().mockResolvedValue({
        id: 'daily1',
        path: '/daily/2026-08-01',
        hPath: '/daily/2026-08-01',
        box: 'nb1',
        isNew: false,
      }),
      readDocument: vi.fn().mockResolvedValue('# Daily Note\n\n- 重要任务\n- 客户沟通'),
      searchNotes: vi.fn().mockResolvedValue([
        { id: 'm1', title: '会议 2026-08-01', path: '/Meetings/2026-08-01', box: 'nb1', snippet: '', score: 0.9 },
      ]),
      listTodos: vi.fn().mockResolvedValue([
        { id: 't1', content: 'Done task', done: true, path: '/a', hPath: '/a', box: 'n1' },
        { id: 't2', content: 'Pending task', done: false, path: '/b', hPath: '/b', box: 'n1' },
      ]),
    });
    const wf = new DailyReviewWorkflow(client);
    const result = await wf.execute({ notebook: '' });

    expect(result.content).toContain('日报');
    expect(result.content).toContain('Done task');
    expect(result.content).toContain('Pending task');
    expect(result.meta?.completedTodos).toBe(1);
    expect(result.meta?.pendingTodos).toBe(1);
  });
});

// ─── Weekly Review Workflow ─────────────────────────────────────────

describe('WeeklyReviewWorkflow', () => {
  it('should generate weekly review', async () => {
    const today = new Date().toISOString().split('T')[0];
    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([
        { id: '1', title: 'CRM - 设计文档更新', path: `/Projects/CRM/design/${today}`, box: 'n1', snippet: '', score: 0.9 },
        { id: '2', title: '会议纪要 2026-08-01', path: `/Meetings/${today}`, box: 'n1', snippet: '', score: 0.8 },
      ]),
      listTodos: vi.fn().mockResolvedValue([
        { id: 't1', content: 'Completed weekly report', done: true, path: '/a', hPath: '/a', box: 'n1' },
      ]),
    });
    const wf = new WeeklyReviewWorkflow(client);
    const result = await wf.execute({ notebook: '' });

    expect(result.content).toContain('周报');
    expect(result.content).toContain('项目进展');
  });
});

// ─── Find Related Notes Workflow ────────────────────────────────────

describe('FindRelatedNotesWorkflow', () => {
  it('should return error for empty doc_id', async () => {
    const client = createMockClient();
    const wf = new FindRelatedNotesWorkflow(client);
    const result = await wf.execute({ doc_id: '' });
    expect(result.content).toContain('Error');
  });

  it('should find related notes by keywords', async () => {
    const client = createMockClient({
      readDocument: vi.fn().mockResolvedValue(
        '# CRM Architecture\n\n## Overview\n\nCRM system uses Docker and microservices.\n\nSee also [[ERP Integration]] and [Database](siyuan://blocks/20220101000000-abc1234).',
      ),
      searchNotes: vi.fn().mockResolvedValue([
        { id: 'related1', title: 'ERP Integration', path: '/Projects/ERP', box: 'n1', snippet: 'ERP integration docs', score: 0.7 },
        { id: 'related2', title: 'Docker Deployment', path: '/Infra/Docker', box: 'n1', snippet: 'Docker deployment guide', score: 0.6 },
      ]),
    });
    const wf = new FindRelatedNotesWorkflow(client);
    const result = await wf.execute({ doc_id: 'doc123' });

    expect(result.content).toContain('相关笔记');
    // Should find related notes based on keywords
    expect(result.content).toContain('related');
  });

  it('should return empty when document is empty', async () => {
    const client = createMockClient({
      readDocument: vi.fn().mockResolvedValue(''),
    });
    const wf = new FindRelatedNotesWorkflow(client);
    const result = await wf.execute({ doc_id: 'empty-doc' });

    expect(result.content).toContain('empty');
  });
});

// ─── Customer Context Workflow Tests ────────────────────────────────

describe('CustomerContextWorkflow', () => {
  beforeEach(() => {
    workflowCache.clear();
  });

  it('should return error for empty customer name', async () => {
    const client = createMockClient();
    const wf = new CustomerContextWorkflow(client);
    const result = await wf.execute({ customer: '' });

    expect(result.content).toContain('Error');
  });

  it('should return empty context when no docs found', async () => {
    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([]),
      listTodos: vi.fn().mockResolvedValue([]),
    });
    const wf = new CustomerContextWorkflow(client);
    const result = await wf.execute({ customer: '客户X' });

    expect(result.content).toContain('客户X');
    expect(result.content).toContain('0');
  });

  it('should build context with search results', async () => {
    const mockSearch = vi.fn().mockResolvedValue([
      { id: 'doc1', title: '客户X 会议纪要', path: '/meetings/2026-08-01', box: 'n1', snippet: '讨论了报价方案', score: 0.9 },
    ]);
    const mockRead = vi.fn().mockResolvedValue('# 客户X 会议\n\n讨论了报价方案和合同条款');
    const mockTodos = vi.fn().mockResolvedValue([
      { content: '跟进客户X报价', done: false, hPath: '/todos' },
    ]);

    const client = createMockClient({
      searchNotes: mockSearch,
      readDocument: mockRead,
      listTodos: mockTodos,
      // Also override sub-module search so both paths work
      search: {
        searchNotes: mockSearch,
      },
    });

    // Verify client has our mock
    expect((client as Record<string, unknown>).searchNotes).toBe(mockSearch);

    const wf = new CustomerContextWorkflow(client);
    const result = await wf.execute({ customer: '客户X' });

    // Verify search was called
    expect(mockSearch).toHaveBeenCalled();
    expect(result.content).toContain('客户X');
    expect(result.meta).toBeDefined();
  });
});

// ─── Project Timeline Workflow Tests ───────────────────────────────

describe('ProjectTimelineWorkflow', () => {
  beforeEach(() => {
    workflowCache.clear();
  });

  it('should return error for empty project name', async () => {
    const client = createMockClient();
    const wf = new ProjectTimelineWorkflow(client);
    const result = await wf.execute({ project: '' });

    expect(result.content).toContain('Error');
  });

  it('should return empty timeline when no docs found', async () => {
    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([]),
      listTodos: vi.fn().mockResolvedValue([]),
    });
    const wf = new ProjectTimelineWorkflow(client);
    const result = await wf.execute({ project: '未知项目' });

    expect(result.content).toContain('未知项目');
  });

  it('should build timeline with dated documents', async () => {
    const client = createMockClient({
      searchNotes: vi.fn().mockResolvedValue([
        { id: 'doc1', title: 'ERP 周会 2026-08-01', path: '/meetings/2026-08-01', snippet: '周会记录' },
        { id: 'doc2', title: 'ERP 日报 2026-07-30', path: '/reports/2026-07-30', snippet: '日报内容' },
      ]),
      readDocument: vi.fn().mockResolvedValue('文档内容'),
      listTodos: vi.fn().mockResolvedValue([
        { content: '完成ERP部署', done: false, hPath: '/todos' },
      ]),
    });
    const wf = new ProjectTimelineWorkflow(client);
    const result = await wf.execute({ project: 'ERP' });

    expect(result.content).toContain('ERP');
    expect(result.content).toContain('2026-08-01');
    expect(result.meta).toBeDefined();
  });
});

// ─── Smart Retrieval (Natural Language Parsing) ─────────────────────

describe('Smart Retrieval', () => {
  it('should extract keywords from natural language', () => {
    const result = FindRelatedNotesWorkflow.parseNaturalQuery(
      '昨天讨论的CRM报价',
    );
    expect(result).toContain('CRM');
    expect(result).toContain('报价');
  });

  it('should extract multiple terms', () => {
    const result = FindRelatedNotesWorkflow.parseNaturalQuery(
      '客户A昨天会议',
    );
    expect(result).toContain('客户A');
    expect(result).toContain('会议');
  });

  it('should handle English terms', () => {
    const result = FindRelatedNotesWorkflow.parseNaturalQuery(
      '上周Docker部署',
    );
    expect(result).toContain('Docker');
    expect(result).toContain('部署');
  });

  it('should extract CamelCase project names', () => {
    const result = FindRelatedNotesWorkflow.parseNaturalQuery(
      'MyProject design document',
    );
    expect(result).toContain('MyProject');
  });

  it('should return original query when no keywords found', () => {
    const result = FindRelatedNotesWorkflow.parseNaturalQuery('的');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
