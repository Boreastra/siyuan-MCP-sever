/**
 * SiYuan SDK - Type Definitions
 */

// ─── SiYuan API Response ──────────────────────────────────────────

export interface SiYuanAPIResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

// ─── Notebook ─────────────────────────────────────────────────────

export interface Notebook {
  id: string;
  name: string;
  icon: string;
  sort: number;
  conf: Record<string, unknown>;
}

export interface ListNotebooksResponse {
  notebooks: Notebook[];
}

// ─── Document ─────────────────────────────────────────────────────

export interface DocumentInfo {
  id: string;
  path: string;
  name: string;
  hPath: string;
  box: string;
  icon: string;
  sort: number;
  subFileCount: number;
  refs: number;
  size: number;
  type?: string;
}

export interface SearchDocResult {
  id: string;
  path: string;
  name: string;
  hPath: string;
  score: number;
}

export interface FullTextSearchBlock {
  id: string;
  path: string;
  box: string;
  content: string;
  type: string;
  subtype: string;
  hPath: string;
  score: number;
}

export interface DocumentContent {
  id: string;
  content: string; // kramdown/markdown
}

// ─── Block ─────────────────────────────────────────────────────────

export interface Block {
  id: string;
  parentID: string;
  type: string;
  subtype: string;
  content: string;
  kramdown: string;
  box: string;
  path: string;
  hPath: string;
}

export interface AppendBlockResponse {
  doOperations: Array<{
    action: string;
    id: string;
    parentID: string;
    data: string;
  }>;
  undoOperations: unknown;
}

// ─── Todo ──────────────────────────────────────────────────────────

export interface TodoItem {
  id: string;
  content: string;
  done: boolean;
  box: string;
  path: string;
  hPath: string;
}

// ─── Daily Note ────────────────────────────────────────────────────

export interface DailyNote {
  id: string;
  path: string;
  hPath: string;
  box: string;
  isNew: boolean;
}

// ─── Client Config ─────────────────────────────────────────────────

export interface SiYuanClientConfig {
  url: string;
  token?: string;
  timeout?: number;
  retry?: number;
  retryDelay?: number;
}

// ─── Search Options ─────────────────────────────────────────────────

export interface SearchOptions {
  group: number;
  flashcard: boolean;
  document: boolean;
  heading: boolean;
  list: boolean;
  list1: boolean;
  list2: boolean;
  list3: boolean;
  blockquote: boolean;
  superBlock: boolean;
  paragraph: boolean;
  math: boolean;
  table: boolean;
  codeBlock: boolean;
  htmlBlock: boolean;
  embedBlock: boolean;
  childBlockSup: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  group: 0,
  flashcard: true,
  document: true,
  heading: true,
  list: true,
  list1: true,
  list2: true,
  list3: true,
  blockquote: true,
  superBlock: true,
  paragraph: true,
  math: true,
  table: true,
  codeBlock: true,
  htmlBlock: true,
  embedBlock: true,
  childBlockSup: true,
};
