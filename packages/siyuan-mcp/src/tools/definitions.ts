/**
 * MCP Tools - Tool Definitions
 *
 * Metadata for the MCP ListTools response.
 * Each definition pairs a tool name with its JSON Schema (derived from Zod).
 *
 * Phase 1: Core CRUD tools (search, read, create, append, list, daily note)
 * Phase 2: Todo and note management (list/create/complete todo, rename, move, delete)
 * Phase 3 (V1.1): AI Workflow tools (knowledge context, project context, meeting,
 *                daily/weekly review, related notes)
 */

import { z } from 'zod';
import {
  // Phase 1
  searchNotesSchema,
  readNoteSchema,
  createNoteSchema,
  appendNoteSchema,
  listNotebooksSchema,
  getDailyNoteSchema,
  // Phase 2
  listTodosSchema,
  createTodoSchema,
  completeTodoSchema,
  renameNoteSchema,
  moveNoteSchema,
  deleteNoteSchema,
  // Phase 3 (V1.1)
  knowledgeContextSchema,
  projectContextSchema,
  meetingSummarySchema,
  dailyReviewSchema,
  weeklyReviewSchema,
  findRelatedNotesSchema,
  // Phase 4 (V1.2)
  customerContextSchema,
  projectTimelineSchema,
} from './schemas.js';

/**
 * JSON Schema object shape expected by MCP inputSchema.
 */
interface JSONSchemaObject {
  type: string;
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Convert a Zod schema to a JSON Schema object for MCP.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): JSONSchemaObject {
  return zodToJsonSchemaInternal(schema);
}

function zodToJsonSchemaInternal(schema: z.ZodTypeAny): JSONSchemaObject {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const propSchema = zodToJsonSchemaInternal(value);
      properties[key] = propSchema;

      // Check if required (not optional and not has default)
      if (
        !(value instanceof z.ZodOptional) &&
        !(value instanceof z.ZodDefault)
      ) {
        required.push(key);
      }
    }

    const result: JSONSchemaObject = {
      type: 'object',
      properties,
    };
    if (required.length > 0) {
      result.required = required;
    }
    return result;
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string', description: schema.description ?? undefined };
  }

  if (schema instanceof z.ZodNumber) {
    const desc: JSONSchemaObject = {
      type: 'number',
      description: schema.description ?? undefined,
    };
    // Propagate min/max
    const checks = (schema as z.ZodNumber)._def.checks ?? [];
    for (const check of checks) {
      if (check.kind === 'min') {
        desc.minimum = check.value;
      } else if (check.kind === 'max') {
        desc.maximum = check.value;
      }
    }
    return desc;
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: schema.description ?? undefined };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchemaInternal(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchemaInternal(schema.removeDefault());
    return { ...inner, default: schema._def.defaultValue() };
  }

  if (schema instanceof z.ZodEnum) {
    const values = (schema as z.ZodEnum<[string, ...string[]]>).options;
    return {
      type: 'string',
      description: schema.description ?? undefined,
      enum: values,
    };
  }

  return { type: 'string' };
}

/**
 * Tool definitions for the MCP ListTools response.
 */
export const TOOL_DEFINITIONS: unknown[] = [
  // ─── Phase 1 ─────────────────────────────────────────────────────
  {
    name: 'search_notes',
    description:
      'Search for notes in SiYuan by keyword with multiple modes. Supports keyword, recent, hybrid, and semantic (reserved) modes with configurable sort order. Returns matching documents with titles, IDs, paths, and content snippets.',
    inputSchema: zodToJsonSchema(searchNotesSchema),
  },
  {
    name: 'read_note',
    description:
      'Read the full content of a SiYuan document in Markdown format by its document ID.',
    inputSchema: zodToJsonSchema(readNoteSchema),
  },
  {
    name: 'create_note',
    description:
      'Create a new document in SiYuan with Markdown content. Supports auto-linking to related notes (projects, clients, daily note). Returns the new document ID.',
    inputSchema: zodToJsonSchema(createNoteSchema),
  },
  {
    name: 'append_note',
    description: 'Append Markdown content to an existing SiYuan document.',
    inputSchema: zodToJsonSchema(appendNoteSchema),
  },
  {
    name: 'list_notebooks',
    description: 'List all SiYuan notebooks with their IDs, names, and icons.',
    inputSchema: zodToJsonSchema(listNotebooksSchema),
  },
  {
    name: 'get_daily_note',
    description:
      "Get today's daily note in SiYuan. Creates one if it doesn't exist yet. Returns the daily note document ID and path.",
    inputSchema: zodToJsonSchema(getDailyNoteSchema),
  },

  // ─── Phase 2 ─────────────────────────────────────────────────────
  {
    name: 'list_todos',
    description:
      'List all todo/checkbox items across SiYuan notebooks. Returns task content, completion status, and location.',
    inputSchema: zodToJsonSchema(listTodosSchema),
  },
  {
    name: 'create_todo',
    description: 'Create a new todo item (checkbox list item) inside a SiYuan document.',
    inputSchema: zodToJsonSchema(createTodoSchema),
  },
  {
    name: 'complete_todo',
    description: 'Mark a todo item as complete by its block ID.',
    inputSchema: zodToJsonSchema(completeTodoSchema),
  },
  {
    name: 'rename_note',
    description: 'Rename a SiYuan document.',
    inputSchema: zodToJsonSchema(renameNoteSchema),
  },
  {
    name: 'move_note',
    description: 'Move a SiYuan document to a different notebook and/or path.',
    inputSchema: zodToJsonSchema(moveNoteSchema),
  },
  {
    name: 'delete_note',
    description: 'Delete a SiYuan document by its ID.',
    inputSchema: zodToJsonSchema(deleteNoteSchema),
  },

  // ─── Phase 3 (V1.1): AI Workflow Tools ────────────────────────────
  {
    name: 'knowledge_context',
    description:
      'Build a unified knowledge context for any topic. Searches related documents, reads top N, extracts key info, finds pending TODOs and related notes — all in one call. The AI no longer needs to loop search+read manually.',
    inputSchema: zodToJsonSchema(knowledgeContextSchema),
  },
  {
    name: 'project_context',
    description:
      'Aggregate all knowledge for a project: materials, meeting notes, daily reports, design docs, implementation records, and related TODOs. Returns a complete project overview sorted by timeline.',
    inputSchema: zodToJsonSchema(projectContextSchema),
  },
  {
    name: 'meeting_summary',
    description:
      'Parse meeting notes and extract structured information: decisions, action items, risks, TODOs with owners and deadlines. Optionally saves the formatted summary back to SiYuan with auto-linking.',
    inputSchema: zodToJsonSchema(meetingSummarySchema),
  },
  {
    name: 'daily_review',
    description:
      "Generate today's daily report: aggregates daily note content, new documents, meeting records, and TODO completion status. Returns a formatted daily review ready to save.",
    inputSchema: zodToJsonSchema(dailyReviewSchema),
  },
  {
    name: 'weekly_review',
    description:
      "Generate this week's report: aggregates new documents, completed TODOs, meeting records, and project changes. Returns a formatted weekly review ready to save.",
    inputSchema: zodToJsonSchema(weeklyReviewSchema),
  },
  {
    name: 'find_related_notes',
    description:
      'Find documents related to a given note by analyzing keywords, backlinks, shared topics, and content similarity. Returns a ranked list of related notes.',
    inputSchema: zodToJsonSchema(findRelatedNotesSchema),
  },
  // ─── Phase 4 (V1.2): Customer & Timeline ───────────────────────
  {
    name: 'customer_context',
    description:
      'Build a comprehensive customer knowledge context. Searches all meeting notes, communications, documents, TODOs, and projects related to a customer. Returns a unified customer dossier including recent activities, open TODOs, and related project references. Use this instead of manual search+read chains.',
    inputSchema: zodToJsonSchema(customerContextSchema),
  },
  {
    name: 'project_timeline',
    description:
      'Build a chronological timeline of all project activities. Aggregates meetings, daily/weekly reports, design documents, implementation records, and TODOs into a unified timeline sorted by date. Returns a complete project history for AI to understand project evolution.',
    inputSchema: zodToJsonSchema(projectTimelineSchema),
  },
];
