/**
 * SiYuan SDK - Search Module
 */

import type { SiYuanHTTPClient } from './client.js';
import type { FullTextSearchBlock, SearchDocResult, SearchOptions } from './types.js';
import { DEFAULT_SEARCH_OPTIONS } from './types.js';

export interface SearchResult {
  id: string;
  title: string;
  path: string;
  box: string;
  snippet: string;
  score: number;
  updatedAt?: string;
}

export class SearchModule {
  constructor(private readonly client: SiYuanHTTPClient) {}

  /**
   * Full-text search across all blocks in all notebooks.
   * Returns matched blocks with content snippets.
   */
  async searchBlocks(query: string, options?: Partial<SearchOptions>): Promise<FullTextSearchBlock[]> {
    const merged = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const data = await this.client.post<{ blocks: FullTextSearchBlock[] }>('search/fullTextSearchBlock', {
      query,
      ...merged,
    });
    return data.blocks ?? [];
  }

  /**
   * Search for documents (file-level) by keyword.
   * Returns matched document paths and IDs.
   */
  async searchDocs(query: string, limit = 10): Promise<SearchDocResult[]> {
    const data = await this.client.post<{
      docs: SearchDocResult[];
      matchedBlockCount: number;
      matchedRootCount: number;
    }>('filetree/searchDocs', { k: query });
    const docs = data.docs ?? [];
    return docs.slice(0, limit);
  }

  /**
   * Combined search: search both blocks and documents.
   * Returns a unified result set with snippets.
   */
  async searchNotes(keyword: string, limit = 10): Promise<SearchResult[]> {
    // Search blocks for content snippets
    const blocks = await this.searchBlocks(keyword);
    const blockResults: SearchResult[] = blocks.slice(0, limit).map((b) => ({
      id: b.id,
      title: this.extractTitle(b.content),
      path: b.hPath || b.path,
      box: b.box,
      snippet: this.truncate(b.content, 200),
      score: b.score,
    }));

    // If we still have room, add document-level matches
    if (blockResults.length < limit) {
      const remaining = limit - blockResults.length;
      const docs = await this.searchDocs(keyword, remaining + blockResults.length);

      const existingIds = new Set(blockResults.map((r) => r.id));
      for (const doc of docs) {
        if (blockResults.length >= limit) break;
        if (existingIds.has(doc.id)) continue;
        blockResults.push({
          id: doc.id,
          title: doc.name,
          path: doc.hPath || doc.path,
          box: '',
          snippet: '',
          score: doc.score,
        });
      }
    }

    return blockResults;
  }

  /**
   * Execute a raw SQL query against SiYuan's block database.
   * Returns an array of row objects (SiYuan format: each row is Record<string, unknown>).
   */
  async sql(stmt: string): Promise<Array<Record<string, unknown>>> {
    return this.client.post<Array<Record<string, unknown>>>('query/sql', { stmt });
  }

  /**
   * Strip HTML from content: decode entities → remove tags → remove kramdown attributes.
   * Entity decoding FIRST is critical because SiYuan may return content where
   * `>` is encoded as `&gt;` — if we apply `/<[^>]*>/g` before decoding, the
   * regex never finds a literal `>` and the entire tag content leaks through.
   *
   * IMPORTANT: `&amp;` MUST be decoded before `&gt;`/`&lt;`/`&quot;` because
   * SiYuan may double-encode entities (e.g. `&amp;gt;` for `>`). If we decode
   * `&gt;` before `&amp;`, we get `&amp>` which is broken and leaks raw HTML.
   */
  private cleanHtml(str: string): string {
    return str
      // Step 1: Decode HTML entities — &amp; FIRST because others may be double-encoded
      .replace(/&amp;/gi, '&')
      .replace(/&gt;/gi, '>')
      .replace(/&lt;/gi, '<')
      .replace(/&quot;/gi, '"')
      .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
      // Step 2: Strip tags and metadata
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')          // HTML tags (incl. multi-line — [^>] matches \n)
      .replace(/\{:[\s\S]*?\}/g, '');   // Kramdown inline attributes
  }

  private extractTitle(content: string): string {
    const plain = this.cleanHtml(content);

    // Then find the first non-empty line
    const lines = plain.split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/^#+\s*/, '').trim();
      if (cleaned.length > 0) return cleaned;
    }
    return '';
  }

  private truncate(str: string, max: number): string {
    const plain = this.cleanHtml(str).trim();
    if (plain.length <= max) return plain;
    return plain.slice(0, max) + '...';
  }
}
