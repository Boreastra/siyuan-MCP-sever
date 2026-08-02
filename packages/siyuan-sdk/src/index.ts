/**
 * SiYuan SDK - Main Entry Point
 *
 * SiYuanClient bundles all modules into a single, cohesive API.
 *
 * Usage:
 *   import { SiYuanClient } from '@siyuan-ai/sdk';
 *
 *   const client = new SiYuanClient({
 *     url: 'http://127.0.0.1:6806',
 *     token: 'your-token',
 *     timeout: 10000,
 *     retry: 3,
 *   });
 *
 *   const notebooks = await client.notebooks.listNotebooks();
 *   const results = await client.search.searchNotes('keyword');
 *   await client.documents.createDocument(notebookId, '/path', '# Hello');
 */

import { SiYuanHTTPClient } from './client.js';
import { AuthModule } from './auth.js';
import { NotebookModule } from './notebook.js';
import { DocumentModule } from './document.js';
import { TodoModule } from './todo.js';
import { SearchModule, type SearchResult } from './search.js';
import { setLogLevel, type LogLevel } from './logger.js';

export { setLogLevel, logger } from './logger.js';
export type { LogLevel } from './logger.js';

// Re-export all types
export type {
  SiYuanClientConfig,
  SiYuanAPIResponse,
  Notebook,
  ListNotebooksResponse,
  DocumentInfo,
  SearchDocResult,
  FullTextSearchBlock,
  DocumentContent,
  Block,
  AppendBlockResponse,
  TodoItem,
  DailyNote,
  SearchOptions,
} from './types.js';

// Re-export errors
export {
  SiYuanError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  NetworkError,
  TimeoutError,
  ServerError,
  wrapAxiosError,
  type ErrorCode,
} from './errors.js';

// Re-export search result type
export { type SearchResult } from './search.js';

// Re-export modules (for advanced use)
export { SiYuanHTTPClient } from './client.js';
export { AuthModule } from './auth.js';
export { NotebookModule } from './notebook.js';
export { DocumentModule } from './document.js';
export { TodoModule } from './todo.js';
export { SearchModule } from './search.js';

export class SiYuanClient {
  readonly http: SiYuanHTTPClient;
  readonly auth: AuthModule;
  readonly notebooks: NotebookModule;
  readonly documents: DocumentModule;
  readonly todos: TodoModule;
  readonly search: SearchModule;

  constructor(config?: {
    url?: string;
    token?: string;
    timeout?: number;
    retry?: number;
    logLevel?: LogLevel;
  }) {
    const url = config?.url ?? process.env.SIYUAN_URL ?? 'http://127.0.0.1:6806';
    const token = config?.token ?? process.env.SIYUAN_TOKEN ?? '';
    const timeout = config?.timeout ?? Number(process.env.TIMEOUT) ?? 10000;
    const retry = config?.retry ?? Number(process.env.RETRY) ?? 3;

    if (config?.logLevel) {
      setLogLevel(config.logLevel);
    } else if (process.env.LOG_LEVEL) {
      setLogLevel(process.env.LOG_LEVEL as LogLevel);
    }

    this.http = new SiYuanHTTPClient({ url, token, timeout, retry });
    this.auth = new AuthModule(this.http);
    this.notebooks = new NotebookModule(this.http);
    this.documents = new DocumentModule(this.http);
    this.todos = new TodoModule(this.http);
    this.search = new SearchModule(this.http);
  }

  /**
   * High-level convenience methods — these are the primary SDK API
   * used by the MCP layer and any future CLI / workflow integrations.
   */

  async listNotebooks() {
    return this.notebooks.listNotebooks();
  }

  async createNotebook(name: string) {
    return this.notebooks.createNotebook(name);
  }

  async renameNotebook(notebookId: string, name: string): Promise<void> {
    return this.notebooks.renameNotebook(notebookId, name);
  }

  async removeNotebook(notebookId: string): Promise<void> {
    return this.notebooks.removeNotebook(notebookId);
  }

  async searchNotes(keyword: string, limit = 10): Promise<SearchResult[]> {
    return this.search.searchNotes(keyword, limit);
  }

  async readDocument(docId: string): Promise<string> {
    return this.documents.readDocument(docId);
  }

  async createDocument(notebook: string, path: string, markdown: string): Promise<string> {
    return this.documents.createDocument(notebook, path, markdown);
  }

  async appendMarkdown(docId: string, markdown: string): Promise<string> {
    return this.documents.appendMarkdown(docId, markdown);
  }

  async listTodos(notebookId?: string) {
    return this.todos.listTodos(notebookId);
  }

  async createTodo(docId: string, content: string, done = false): Promise<string> {
    return this.todos.createTodo({ docId, content, done });
  }

  async completeTodo(todoId: string): Promise<void> {
    return this.todos.completeTodo(todoId);
  }

  async getDailyNote(notebook?: string, template?: string) {
    return this.documents.getDailyNote(notebook, template);
  }

  async renameNote(docId: string, title: string): Promise<void> {
    return this.documents.renameNote(docId, title);
  }

  async moveNote(docId: string, notebook: string, path: string): Promise<void> {
    return this.documents.moveNote(docId, notebook, path);
  }

  async deleteNote(docId: string): Promise<void> {
    return this.documents.deleteNote(docId);
  }

  /** Health check — verify connectivity to SiYuan kernel */
  async ping(): Promise<boolean> {
    return this.http.ping();
  }
}

export default SiYuanClient;
