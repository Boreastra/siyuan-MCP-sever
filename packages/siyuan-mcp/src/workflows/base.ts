/**
 * Workflow Base Class
 *
 * All workflows extend this base. Workflows sit above Tools in the hierarchy:
 *
 *   AI → Workflow → Tool(s) → SDK → SiYuan API
 *
 * Workflows can call multiple SDK methods. Tools cannot call Workflows.
 */

import type { SiYuanClient, SearchResult } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { workflowCache, WorkflowCache, type WorkflowCache as IWorkflowCache } from '../cache/index.js';

/** Standard workflow output format */
export interface WorkflowResult {
  /** Markdown-formatted result for consumption by AI */
  content: string;
  /** Structured metadata */
  meta?: Record<string, unknown>;
}

export abstract class WorkflowBase {
  protected readonly siyuan: SiYuanClient;
  protected readonly cache: IWorkflowCache;

  constructor(siyuan: SiYuanClient) {
    this.siyuan = siyuan;
    this.cache = workflowCache;
  }

  /** Execute the workflow. Subclasses implement their logic. */
  abstract execute(params: Record<string, unknown>): Promise<WorkflowResult>;

  /** Name for cache key generation and logging */
  abstract readonly name: string;

  // ─── Shared Helpers ────────────────────────────────────────────────

  /**
   * Search + read top N documents automatically.
   * Returns full document contents with metadata.
   */
  protected async searchAndRead(
    keyword: string,
    topN = 5,
  ): Promise<
    Array<{
      id: string;
      title: string;
      path: string;
      content: string;
      snippet: string;
    }>
  > {
    const results = await this.siyuan.searchNotes(keyword, topN);
    const docs: Array<{
      id: string;
      title: string;
      path: string;
      content: string;
      snippet: string;
    }> = [];

    for (const r of results) {
      try {
        const content = await this.siyuan.readDocument(r.id);
        docs.push({
          id: r.id,
          title: r.title,
          path: r.path,
          content,
          snippet: r.snippet,
        });
      } catch (err) {
        logger.warn('Failed to read document in workflow', {
          docId: r.id,
          error: String(err),
        });
      }
    }

    return docs;
  }

  /**
   * Get cache key for this workflow + params. Uses cached result if available.
   */
  protected getCached<T extends WorkflowResult>(
    params: Record<string, unknown>,
  ): T | undefined {
    const key = WorkflowCache.key(this.name, params);
    return this.cache.get<T>(key);
  }

  /**
   * Set cache for this workflow result.
   */
  protected setCache(params: Record<string, unknown>, result: WorkflowResult, ttlMs?: number): void {
    const key = WorkflowCache.key(this.name, params);
    this.cache.set(key, result, ttlMs);
  }

  /**
   * Build a dedup'd list of search results by doc ID.
   */
  protected dedupDocs(docs: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return docs.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }
}
