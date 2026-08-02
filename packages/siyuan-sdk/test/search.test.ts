/**
 * Search Module Test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SearchModule } from '../src/search.js';
import { createMockClient, apiResponse } from './mock-client.js';

describe('SearchModule', () => {
  let mock: ReturnType<typeof createMockClient>;
  let module: SearchModule;

  beforeEach(() => {
    mock = createMockClient();
    mock.resetMocks();
    module = new SearchModule(mock as any);
  });

  it('searchBlocks returns matching blocks', async () => {
    const blocks = [
      {
        id: 'block1',
        path: '/Projects/note1',
        box: 'nb1',
        content: 'This is a note about **docker**',
        type: 'NodeParagraph',
        subtype: '',
        hPath: '/Projects/note1',
        score: 1.5,
      },
    ];
    mock.mockResponse('fullTextSearchBlock', apiResponse({ blocks }));

    const result = await module.searchBlocks('docker');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('block1');
    expect(result[0].content).toContain('docker');
  });

  it('searchBlocks returns empty array when no matches', async () => {
    mock.mockResponse('fullTextSearchBlock', apiResponse({ blocks: [] }));
    const result = await module.searchBlocks('nonexistent');
    expect(result).toEqual([]);
  });

  it('searchDocs returns documents with limit', async () => {
    const docs = Array.from({ length: 20 }, (_, i) => ({
      id: `doc${i}`,
      path: `/Projects/doc${i}`,
      name: `Doc ${i}`,
      hPath: `/Projects/doc${i}`,
      score: 1.0 - i * 0.05,
    }));
    mock.mockResponse('searchDocs', apiResponse({
      docs,
      matchedBlockCount: 20,
      matchedRootCount: 20,
    }));

    const result = await module.searchDocs('project', 5);
    expect(result).toHaveLength(5);
    expect(result[0].id).toBe('doc0');
  });

  it('searchNotes combines block and doc results', async () => {
    // Mock blocks search
    mock.mockResponse('fullTextSearchBlock', apiResponse({
      blocks: [
        {
          id: 'b1',
          path: '/note1',
          box: 'nb1',
          content: 'Meeting notes about CRM',
          type: 'NodeParagraph',
          subtype: '',
          hPath: '/note1',
          score: 2.0,
        },
      ],
    }));

    // Mock docs search (should not be called since blocks already fill the limit)
    mock.mockResponse('searchDocs', apiResponse({
      docs: [],
      matchedBlockCount: 0,
      matchedRootCount: 0,
    }));

    const result = await module.searchNotes('CRM', 10);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
    expect(result[0].title).toBe('Meeting notes about CRM');
    expect(result[0].snippet).toContain('Meeting notes');
  });

  it('sql executes query and returns row objects', async () => {
    // SiYuan /api/query/sql returns data as array of row objects
    mock.mockResponse('query/sql', apiResponse([
      { id: 'b1', content: 'Hello' },
      { id: 'b2', content: 'World' },
    ]));

    const result = await module.sql("SELECT id, content FROM blocks LIMIT 2");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('b1');
    expect(result[0].content).toBe('Hello');
  });

  it('searchNotes strips entity-encoded HTML from titles', async () => {
    // SiYuan may return block content with HTML entities (e.g. &quot;, &gt;)
    // If entity decoding is skipped, &gt; prevents <[^>]*> from matching
    mock.mockResponse('fullTextSearchBlock', apiResponse({
      blocks: [
        {
          id: 'b1',
          path: '/doc1',
          box: 'nb1',
          content: '<div contenteditable=&quot;false&quot; data-type=&quot;siyuan-plugin-custom-wrapper&quot; style=&quot;position: absolute;&quot;&gt;<div class=&quot;siyuan-plugin-task-date-info&quot;&gt;完成时间: 2026-07-27&lt;/div&gt;&lt;/div&gt;',
          type: 'NodeListItem',
          subtype: '',
          hPath: '/doc1',
          score: 1.0,
        },
      ],
    }));
    mock.mockResponse('searchDocs', apiResponse({ docs: [], matchedBlockCount: 0, matchedRootCount: 0 }));

    const result = await module.searchNotes('plugin', 10);

    expect(result[0].title).toBe('完成时间: 2026-07-27');
    expect(result[0].title).not.toContain('contenteditable');
    expect(result[0].title).not.toContain('siyuan-plugin');
    expect(result[0].title).not.toContain('&');
    expect(result[0].title).not.toContain('<');
    expect(result[0].snippet).toContain('完成时间');
    expect(result[0].snippet).not.toContain('contenteditable');
  });
});
