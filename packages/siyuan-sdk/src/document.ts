/**
 * SiYuan SDK - Document Module
 *
 * Handles: read, create, append, daily note, rename, move, delete.
 * Uses SiYuan's filetree + block APIs.
 */

import type { SiYuanHTTPClient } from './client.js';
import type { DocumentInfo, AppendBlockResponse, DailyNote } from './types.js';
import { ValidationError } from './errors.js';
import { logger } from './logger.js';

export class DocumentModule {
  constructor(private readonly client: SiYuanHTTPClient) {}

  // ─── Read ────────────────────────────────────────────────────────

  /**
   * Read a document's content in Markdown format.
   * Uses SiYuan's export endpoint to get clean Markdown.
   */
  async readDocument(docId: string): Promise<string> {
    if (!docId) throw new ValidationError('docId is required');

    logger.debug('Reading document', { docId });

    // Use exportMdContent to get markdown
    const data = await this.client.post<{ content: string }>('export/exportMdContent', {
      id: docId,
    });

    if (!data.content) {
      // Fallback: try block API to get kramdown
      logger.warn('exportMdContent returned empty, trying block API', { docId });
      const blockData = await this.client.post<{ content: string }>('filetree/getDoc', {
        id: docId,
        k: undefined,
        mode: 0,
        size: 102400,
        startID: undefined,
        endID: undefined,
      });
      return this.kramdownToMarkdown(blockData.content || '');
    }

    return data.content;
  }

  /** Get document metadata */
  async getDocInfo(docId: string): Promise<DocumentInfo> {
    if (!docId) throw new ValidationError('docId is required');
    const data = await this.client.post<DocumentInfo>('filetree/getDocInfo', {
      id: docId,
    });
    return data;
  }

  // ─── Create ──────────────────────────────────────────────────────

  /**
   * Create a new document from Markdown content.
   * @param notebook - Notebook ID
   * @param path - Document path within the notebook (e.g. "/folder/title")
   * @param markdown - Document content in Markdown
   * @returns The new document ID
   */
  async createDocument(notebook: string, path: string, markdown: string): Promise<string> {
    if (!notebook) throw new ValidationError('notebook is required');
    if (!path) throw new ValidationError('path is required');
    if (!markdown) throw new ValidationError('markdown is required');

    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    const data = await this.client.post<unknown>(
      'filetree/createDocWithMd',
      {
        notebook,
        path: normalizedPath,
        markdown,
      },
    );

    // SiYuan returns the new doc ID as a plain string (e.g. "20260802145248-abc123")
    if (typeof data === 'string' && data.length > 0) {
      logger.debug('Found doc ID from response string', { id: data });
      return data;
    }

    // Some older SiYuan versions may return { rootID: "..." }
    if (data && typeof data === 'object' && 'rootID' in data) {
      const rootID = (data as { rootID: string }).rootID;
      if (rootID) {
        logger.debug('Found doc ID from rootID', { rootID });
        return rootID;
      }
    }

    // Fallback 1: search by document title using filetree/searchDocs
    // listDocTree only returns top-level nodes — cannot find docs in subfolders
    const title = normalizedPath.split('/').pop() || '';

    // SiYuan needs a brief moment to index newly created documents
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      logger.debug('Searching for created doc by title', { title, path: normalizedPath });

      // searchDocs returns data as a flat array (not { docs: [...] })
      // Each item has: { box, boxIcon, hPath, path } — no id field
      // The doc ID is embedded in the path field: /parent-id/doc-id.sy
      const docs = await this.client.post<
        Array<{ box: string; hPath: string; path: string }>
      >('filetree/searchDocs', { k: title });

      const docArray = Array.isArray(docs) ? docs : [];

      // hPath includes notebook name prefix (e.g. "工作/folder/title")
      // normalizedPath starts with "/" (e.g. "/folder/title")
      // Match by checking if hPath ends with the path without leading "/"
      const pathWithoutSlash = normalizedPath.slice(1);
      const match = docArray.find(
        (d) => d.hPath.endsWith(pathWithoutSlash) || d.hPath.endsWith(normalizedPath),
      );

      if (match) {
        // Extract doc ID from path: /parent-id/doc-id.sy -> doc-id
        const pathParts = match.path.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        const docId = lastPart.replace(/\.sy$/, '');
        if (docId) {
          logger.debug('Found doc via searchDocs', { id: docId, hPath: match.hPath });
          return docId;
        }
      }

      logger.warn('searchDocs returned no match for path', {
        normalizedPath,
        foundHPaths: docArray.map((d) => d.hPath),
      });
    } catch (err) {
      logger.warn('searchDocs fallback failed', { error: String(err) });
    }

    // Fallback 2: find by path in doc tree (only works for top-level docs)
    const docInfo = await this.findDocByPath(notebook, normalizedPath);
    if (docInfo?.id) {
      logger.debug('Found doc via listDocTree', { id: docInfo.id });
    }
    return docInfo?.id ?? '';
  }

  /**
   * Append Markdown content to an existing document.
   * Uses SiYuan's block append API.
   */
  async appendMarkdown(docId: string, markdown: string): Promise<string> {
    if (!docId) throw new ValidationError('docId is required');
    if (!markdown) throw new ValidationError('markdown is required');

    // SiYuan returns data as: [{ doOperations: [...], undoOperations: null }]
    const data = await this.client.post<AppendBlockResponse[]>('block/appendBlock', {
      dataType: 'markdown',
      data: markdown,
      parentID: docId,
    });

    if (Array.isArray(data) && data.length > 0 && data[0].doOperations?.length > 0) {
      return data[0].doOperations[0].id;
    }
    return '';
  }

  // ─── Daily Note ──────────────────────────────────────────────────

  /**
   * Create a daily note for today.
   * @param notebook - Notebook ID (optional, uses default notebook if not specified)
   * @param template - Template content (optional)
   * @returns Daily note info
   */
  async createDailyNote(notebook?: string, template?: string): Promise<DailyNote> {
    const payload: Record<string, unknown> = {};
    if (notebook) payload.notebook = notebook;
    if (template) payload.template = template;
    payload.app = 'siyuan';

    const data = await this.client.post<DailyNote>('filetree/createDailyNote', payload);
    return data;
  }

  /**
   * Get today's daily note, creating it if it doesn't exist.
   * This is the "get or create" behavior for daily notes.
   */
  async getDailyNote(notebook?: string, template?: string): Promise<DailyNote> {
    // SiYuan's createDailyNote is idempotent — calling it again for the same day
    // returns the same document. So we can safely call it.
    const dailyNote = await this.createDailyNote(notebook, template);
    return dailyNote;
  }

  // ─── Rename / Move / Delete ──────────────────────────────────────

  /** Rename a document by ID */
  async renameNote(docId: string, title: string): Promise<void> {
    if (!docId) throw new ValidationError('docId is required');
    if (!title) throw new ValidationError('title is required');

    await this.client.post('filetree/renameDocByID', {
      id: docId,
      title,
    });
  }

  /** Move a document to a target notebook */
  async moveNote(docId: string, targetNotebook: string, _targetPath?: string): Promise<void> {
    if (!docId) throw new ValidationError('docId is required');
    if (!targetNotebook) throw new ValidationError('targetNotebook is required');

    // moveDocsByID: notebook ID is also the root document ID
    await this.client.post('filetree/moveDocsByID', {
      fromIDs: [docId],
      toID: targetNotebook,
    });
  }

  /** Delete a document by ID */
  async deleteNote(docId: string): Promise<void> {
    if (!docId) throw new ValidationError('docId is required');

    await this.client.post('filetree/removeDocByID', {
      id: docId,
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  /**
   * Find a document by its path within a notebook.
   */
  async findDocByPath(notebook: string, path: string): Promise<DocumentInfo | undefined> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    try {
      const data = await this.client.post<{ tree: DocumentInfo[] }>('filetree/listDocTree', {
        notebook,
      });
      return this.findInTree(data.tree || [], normalizedPath);
    } catch {
      return undefined;
    }
  }

  private findInTree(tree: DocumentInfo[], targetPath: string): DocumentInfo | undefined {
    for (const node of tree) {
      if (node.path === targetPath) return node;
      if (node.subFileCount > 0) {
        // Would need to recurse with child tree, but listDocTree returns a flat-ish tree
        // For now, a simple match
      }
    }
    return undefined;
  }

  /**
   * Convert kramdown to approximate Markdown.
   * SiYuan uses kramdown, which is close to Markdown but with some differences.
   */
  private kramdownToMarkdown(kramdown: string): string {
    return kramdown
      // Remove SiYuan block ID markers: {block-id} (IDs are 4-40 alphanumeric chars)
      .replace(/\{[a-zA-Z0-9_-]{4,40}\}/g, '')
      // Remove attribute blocks: {: attribute="value"}
      .replace(/\{:[^}]*\}/g, '')
      // Convert kramdown-style blockquotes
      .trim();
  }
}
