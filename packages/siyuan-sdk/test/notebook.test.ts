/**
 * Notebook Module Test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookModule } from '../src/notebook.js';
import { createMockClient, apiResponse } from './mock-client.js';

describe('NotebookModule', () => {
  let mock: ReturnType<typeof createMockClient>;
  let module: NotebookModule;

  beforeEach(() => {
    mock = createMockClient();
    mock.resetMocks();
    module = new NotebookModule(mock as any);
  });

  it('listNotebooks returns all notebooks', async () => {
    const notebooks = [
      { id: 'nb1', name: 'Inbox', icon: '1F4E5', sort: 0, conf: {} },
      { id: 'nb2', name: 'Projects', icon: '1F4DA', sort: 1, conf: {} },
    ];
    mock.mockResponse('lsNotebooks', apiResponse({ notebooks }));

    const result = await module.listNotebooks();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('nb1');
    expect(result[0].name).toBe('Inbox');
    expect(result[1].id).toBe('nb2');
    expect(mock.getCalls()[0].endpoint).toBe('notebook/lsNotebooks');
  });

  it('listNotebooks returns empty array when no notebooks', async () => {
    mock.mockResponse('lsNotebooks', apiResponse({ notebooks: [] }));
    const result = await module.listNotebooks();
    expect(result).toEqual([]);
  });

  it('getNotebook returns notebook by ID', async () => {
    const notebooks = [
      { id: 'nb1', name: 'Inbox', icon: '', sort: 0, conf: {} },
      { id: 'nb2', name: 'Projects', icon: '', sort: 1, conf: {} },
    ];
    mock.mockResponse('lsNotebooks', apiResponse({ notebooks }));

    const result = await module.getNotebook('nb2');
    expect(result?.id).toBe('nb2');
    expect(result?.name).toBe('Projects');
  });

  it('getNotebook returns undefined for unknown ID', async () => {
    mock.mockResponse('lsNotebooks', apiResponse({ notebooks: [] }));
    const result = await module.getNotebook('unknown');
    expect(result).toBeUndefined();
  });

  it('getNotebookByName matches case-insensitively', async () => {
    const notebooks = [
      { id: 'nb1', name: 'Projects', icon: '', sort: 0, conf: {} },
    ];
    mock.mockResponse('lsNotebooks', apiResponse({ notebooks }));

    const result = await module.getNotebookByName('PROJECTS');
    expect(result?.id).toBe('nb1');
  });

  it('getNotebookConf returns configuration', async () => {
    const conf = { dailyNoteSavePath: '/daily/{{now | date "2006/01"}}/{{now | date "2006-01-02"}}' };
    mock.mockResponse('getNotebookConf', apiResponse({ conf }));

    const result = await module.getNotebookConf('nb1');
    expect(result).toEqual(conf);
    expect(mock.getCalls()[0].payload).toEqual({ notebook: 'nb1' });
  });
});
