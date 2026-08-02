/**
 * Document Module Test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentModule } from '../src/document.js';
import { ValidationError } from '../src/errors.js';
import { createMockClient, apiResponse } from './mock-client.js';

describe('DocumentModule', () => {
  let mock: ReturnType<typeof createMockClient>;
  let module: DocumentModule;

  beforeEach(() => {
    mock = createMockClient();
    mock.resetMocks();
    module = new DocumentModule(mock as any);
  });

  describe('readDocument', () => {
    it('returns markdown content via exportMdContent', async () => {
      const content = '# Meeting Notes\n\nDiscussed project timeline.';
      mock.mockResponse('exportMdContent', apiResponse({ content }));

      const result = await module.readDocument('doc123');

      expect(result).toBe(content);
      expect(mock.getCalls()[0].endpoint).toBe('export/exportMdContent');
      expect(mock.getCalls()[0].payload).toEqual({ id: 'doc123' });
    });

    it('falls back to filetree/getDoc when export returns empty', async () => {
      mock.mockResponse('exportMdContent', apiResponse({ content: '' }));
      mock.mockResponse('getDoc', apiResponse({
        content: '# Title {block123}\n\nText',
        id: 'doc123',
      }));

      const result = await module.readDocument('doc123');

      // Should strip block ID markers
      expect(result).not.toContain('{block123}');
      expect(result).toContain('# Title');
    });

    it('throws ValidationError for empty docId', async () => {
      await expect(module.readDocument('')).rejects.toThrow(ValidationError);
    });
  });

  describe('createDocument', () => {
    it('creates document and returns root ID', async () => {
      mock.mockResponse('createDocWithMd', apiResponse({ docCount: 1, rootID: 'newdoc123' }));

      const result = await module.createDocument('nb1', '/Meetings/Standup', '# Standup');

      expect(result).toBe('newdoc123');
      expect(mock.getCalls()[0].endpoint).toBe('filetree/createDocWithMd');
      expect(mock.getCalls()[0].payload).toEqual({
        notebook: 'nb1',
        path: '/Meetings/Standup',
        markdown: '# Standup',
      });
    });

    it('normalizes path with leading slash', async () => {
      mock.mockResponse('createDocWithMd', apiResponse({ docCount: 1, rootID: 'd1' }));

      await module.createDocument('nb1', 'Notes/Test', '# Hi');

      expect(mock.getCalls()[0].payload?.path).toBe('/Notes/Test');
    });

    it('throws ValidationError for missing notebook', async () => {
      await expect(module.createDocument('', '/path', '# Hi')).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for missing path', async () => {
      await expect(module.createDocument('nb1', '', '# Hi')).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for missing markdown', async () => {
      await expect(module.createDocument('nb1', '/path', '')).rejects.toThrow(ValidationError);
    });
  });

  describe('appendMarkdown', () => {
    it('appends content and returns block ID', async () => {
      mock.mockResponse('appendBlock', apiResponse([{
        doOperations: [{ action: 'insert', id: 'block456', parentID: 'doc123', data: 'text' }],
        undoOperations: null,
      }]));

      const result = await module.appendMarkdown('doc123', '## New Section\n\nMore content.');

      expect(result).toBe('block456');
      expect(mock.getCalls()[0].endpoint).toBe('block/appendBlock');
      expect(mock.getCalls()[0].payload).toEqual({
        dataType: 'markdown',
        data: '## New Section\n\nMore content.',
        parentID: 'doc123',
      });
    });

    it('returns empty string when no doOperations returned', async () => {
      mock.mockResponse('appendBlock', apiResponse([{ doOperations: [], undoOperations: null }]));

      const result = await module.appendMarkdown('doc123', 'text');
      expect(result).toBe('');
    });

    it('returns empty string when data is empty array', async () => {
      mock.mockResponse('appendBlock', apiResponse([]));

      const result = await module.appendMarkdown('doc123', 'text');
      expect(result).toBe('');
    });

    it('throws ValidationError for empty docId', async () => {
      await expect(module.appendMarkdown('', 'content')).rejects.toThrow(ValidationError);
    });
  });

  describe('Daily Note', () => {
    it('createDailyNote calls filetree/createDailyNote', async () => {
      mock.mockResponse('createDailyNote', apiResponse({
        id: 'daily123',
        path: '/2026/08/20260801120000-daily',
        hPath: '/Daily/2026-08-01',
        box: 'nb1',
        isNew: true,
      }));

      const result = await module.createDailyNote('nb1');

      expect(result.id).toBe('daily123');
      expect(result.isNew).toBe(true);
      expect(mock.getCalls()[0].payload?.notebook).toBe('nb1');
      expect(mock.getCalls()[0].payload?.app).toBe('siyuan');
    });

    it('getDailyNote delegates to createDailyNote (idempotent)', async () => {
      mock.mockResponse('createDailyNote', apiResponse({
        id: 'daily123',
        path: '/2026/08/20260801120000-daily',
        hPath: '/Daily/2026-08-01',
        box: 'nb1',
        isNew: false,
      }));

      const result = await module.getDailyNote('nb1');

      expect(result.id).toBe('daily123');
      expect(result.isNew).toBe(false);
    });
  });

  describe('renameNote', () => {
    it('calls filetree/renameDocByID with id and title', async () => {
      mock.mockResponse('renameDocByID', apiResponse(null));

      await module.renameNote('doc123', 'New Title');

      expect(mock.getCalls()[0].endpoint).toBe('filetree/renameDocByID');
      expect(mock.getCalls()[0].payload).toEqual({
        id: 'doc123',
        title: 'New Title',
      });
    });

    it('throws ValidationError for empty docId', async () => {
      await expect(module.renameNote('', 'title')).rejects.toThrow(ValidationError);
    });
  });

  describe('moveNote', () => {
    it('calls filetree/moveDocsByID with fromIDs and toID', async () => {
      mock.mockResponse('moveDocsByID', apiResponse(null));

      await module.moveNote('doc123', 'nb2', 'Archive/2026');

      expect(mock.getCalls()[0].endpoint).toBe('filetree/moveDocsByID');
      expect(mock.getCalls()[0].payload).toEqual({
        fromIDs: ['doc123'],
        toID: 'nb2',
      });
    });
  });

  describe('deleteNote', () => {
    it('calls filetree/removeDocByID with document id', async () => {
      mock.mockResponse('removeDocByID', apiResponse(null));

      await module.deleteNote('doc123');

      expect(mock.getCalls()[0].endpoint).toBe('filetree/removeDocByID');
      expect(mock.getCalls()[0].payload).toEqual({
        id: 'doc123',
      });
    });
  });
});
