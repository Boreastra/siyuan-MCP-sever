/**
 * MCP Tools - Zod Input Schemas
 *
 * Each schema validates the input arguments for a corresponding MCP tool.
 * Phase 1: Core Note Tools
 * Phase 2: Todo & Note Management
 * Phase 3 (V1.1): AI Workflow Tools
 */

import { z } from 'zod';

// ─── Phase 1: Core Note Tools ─────────────────────────────────────

export const searchNotesSchema = z.object({
  keyword: z.string().min(1).describe('Search keyword'),
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of results'),
  mode: z
    .enum(['keyword', 'recent', 'hybrid', 'semantic'])
    .default('hybrid')
    .describe(
      'Search mode: "keyword" for exact match, "recent" for time-sorted, "hybrid" (default) for combined relevance+time, "semantic" (reserved for future)',
    ),
  sort: z
    .enum(['relevance', 'updated', 'composite'])
    .default('composite')
    .describe('Sort order: relevance, updated time, or composite score'),
});
export type SearchNotesInput = z.infer<typeof searchNotesSchema>;

export const readNoteSchema = z.object({
  doc_id: z.string().min(1).describe('Document ID to read'),
});
export type ReadNoteInput = z.infer<typeof readNoteSchema>;

export const createNoteSchema = z.object({
  notebook: z.string().min(1).describe('Notebook ID'),
  path: z.string().min(1).describe('Document path within notebook (e.g. "/Meetings/Standup")'),
  title: z.string().min(1).describe('Document title'),
  markdown: z.string().describe('Document content in Markdown format'),
  auto_link: z
    .boolean()
    .default(false)
    .describe(
      'Auto-create bidirectional links to related notes (projects, clients, people, daily note)',
    ),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const appendNoteSchema = z.object({
  doc_id: z.string().min(1).describe('Target document ID'),
  markdown: z.string().min(1).describe('Content to append in Markdown format'),
});
export type AppendNoteInput = z.infer<typeof appendNoteSchema>;

export const listNotebooksSchema = z.object({});
export type ListNotebooksInput = z.infer<typeof listNotebooksSchema>;

export const getDailyNoteSchema = z.object({
  notebook: z
    .string()
    .optional()
    .describe('Notebook ID for the daily note (uses default if omitted)'),
});
export type GetDailyNoteInput = z.infer<typeof getDailyNoteSchema>;

// ─── Phase 2: Todo & Note Management ──────────────────────────────

export const listTodosSchema = z.object({
  notebook: z.string().optional().describe('Filter todos by notebook ID'),
});
export type ListTodosInput = z.infer<typeof listTodosSchema>;

export const createTodoSchema = z.object({
  doc_id: z.string().min(1).describe('Document ID to add the todo to'),
  content: z.string().min(1).describe('Todo task description'),
  done: z.boolean().default(false).describe('Whether the todo is already completed'),
});
export type CreateTodoInput = z.infer<typeof createTodoSchema>;

export const completeTodoSchema = z.object({
  todo_id: z.string().min(1).describe('Todo block ID to mark as complete'),
});
export type CompleteTodoInput = z.infer<typeof completeTodoSchema>;

export const renameNoteSchema = z.object({
  doc_id: z.string().min(1).describe('Document ID to rename'),
  title: z.string().min(1).describe('New document title'),
});
export type RenameNoteInput = z.infer<typeof renameNoteSchema>;

export const moveNoteSchema = z.object({
  doc_id: z.string().min(1).describe('Document ID to move'),
  notebook: z.string().min(1).describe('Target notebook ID'),
  path: z.string().min(1).describe('Target document path (e.g. "/Archive/2026")'),
});
export type MoveNoteInput = z.infer<typeof moveNoteSchema>;

export const deleteNoteSchema = z.object({
  doc_id: z.string().min(1).describe('Document ID to delete'),
});
export type DeleteNoteInput = z.infer<typeof deleteNoteSchema>;

// ─── Phase 3 (V1.1): AI Workflow / Business Tools ─────────────────

export const knowledgeContextSchema = z.object({
  topic: z.string().min(1).describe('Topic to build knowledge context for (e.g. "CRM", "客户A", "Docker")'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Number of documents to deep-read for context'),
});
export type KnowledgeContextInput = z.infer<typeof knowledgeContextSchema>;

export const projectContextSchema = z.object({
  project: z.string().min(1).describe('Project name to aggregate context for (e.g. "ERP", "CRM")'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(10)
    .describe('Maximum number of documents to fetch'),
});
export type ProjectContextInput = z.infer<typeof projectContextSchema>;

export const meetingSummarySchema = z.object({
  content: z.string().min(1).describe('Raw meeting notes or transcript content'),
  title: z
    .string()
    .optional()
    .describe('Meeting title (auto-detected from content if omitted)'),
  notebook: z
    .string()
    .optional()
    .describe('Notebook ID to save the formatted summary to'),
  path: z
    .string()
    .optional()
    .describe('Document path for saving (e.g. "/Meetings")'),
  append_to: z
    .string()
    .optional()
    .describe('Existing document ID to append the summary to (overrides notebook/path)'),
  auto_link: z
    .boolean()
    .default(true)
    .describe('Auto-create links to related project/client notes'),
});
export type MeetingSummaryInput = z.infer<typeof meetingSummarySchema>;

export const dailyReviewSchema = z.object({
  notebook: z.string().optional().describe('Notebook ID for daily note lookup'),
});
export type DailyReviewInput = z.infer<typeof dailyReviewSchema>;

export const weeklyReviewSchema = z.object({
  notebook: z.string().optional().describe('Notebook ID for weekly search scope'),
});
export type WeeklyReviewInput = z.infer<typeof weeklyReviewSchema>;

export const findRelatedNotesSchema = z.object({
  doc_id: z.string().min(1).describe('Document ID to find related notes for'),
});
export type FindRelatedNotesInput = z.infer<typeof findRelatedNotesSchema>;

// ─── Phase 4 (V1.2): Customer & Timeline Workflows ─────────────────

export const customerContextSchema = z.object({
  customer: z.string().min(1).describe('Customer name to aggregate context for (e.g. "客户A", "腾讯")'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(15)
    .describe('Maximum number of documents to fetch'),
});
export type CustomerContextInput = z.infer<typeof customerContextSchema>;

export const projectTimelineSchema = z.object({
  project: z.string().min(1).describe('Project name to build timeline for (e.g. "ERP", "CRM")'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(20)
    .describe('Maximum number of documents to fetch'),
});
export type ProjectTimelineInput = z.infer<typeof projectTimelineSchema>;
