/**
 * SiYuan SDK - Notebook Module
 */

import type { SiYuanHTTPClient } from './client.js';
import type { Notebook, ListNotebooksResponse } from './types.js';

export class NotebookModule {
  constructor(private readonly client: SiYuanHTTPClient) {}

  /** List all notebooks */
  async listNotebooks(): Promise<Notebook[]> {
    const data = await this.client.post<ListNotebooksResponse>('notebook/lsNotebooks');
    return data.notebooks ?? [];
  }

  /** Get a notebook by ID */
  async getNotebook(notebookId: string): Promise<Notebook | undefined> {
    const notebooks = await this.listNotebooks();
    return notebooks.find((nb) => nb.id === notebookId);
  }

  /** Get a notebook by name (case-insensitive) */
  async getNotebookByName(name: string): Promise<Notebook | undefined> {
    const notebooks = await this.listNotebooks();
    const lower = name.toLowerCase();
    return notebooks.find((nb) => nb.name.toLowerCase() === lower);
  }

  /** Get notebook configuration */
  async getNotebookConf(notebookId: string): Promise<Record<string, unknown>> {
    const data = await this.client.post<{ conf: Record<string, unknown> }>('notebook/getNotebookConf', {
      notebook: notebookId,
    });
    return data.conf;
  }
}
