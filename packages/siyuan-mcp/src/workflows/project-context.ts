/**
 * Project Context Workflow
 *
 * Aggregates all project-related knowledge:
 * - Project documents (materials, design, implementation)
 * - Meeting notes
 * - Daily notes mentioning the project
 * - TODOs related to the project
 *
 * One call → complete project context.
 */

import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { WorkflowBase, type WorkflowResult } from './base.js';

export class ProjectContextWorkflow extends WorkflowBase {
  readonly name = 'project_context';

  constructor(siyuan: SiYuanClient) {
    super(siyuan);
  }

  async execute(params: Record<string, unknown>): Promise<WorkflowResult> {
    const projectName = String(params.project ?? params.project_name ?? '');
    const depth = Number(params.depth ?? 10);

    if (!projectName) {
      return { content: 'Error: project name is required for project_context.' };
    }

    const cached = this.getCached(params);
    if (cached) {
      logger.debug('Project context cache hit', { project: projectName });
      return cached;
    }

    logger.info('Building project context', { project: projectName, depth });

    // Step 1: Search for project-related documents
    const searchQueries = [
      projectName,
      `${projectName} 设计`,
      `${projectName} 实施`,
      `${projectName} 日报`,
      `${projectName} 会议`,
      `${projectName} 总结`,
    ];

    const allResults: Array<{
      id: string;
      title: string;
      path: string;
      content: string;
      snippet: string;
    }> = [];

    const seenIds = new Set<string>();

    for (const query of searchQueries) {
      try {
        const results = await this.siyuan.searchNotes(query, 5);
        for (const r of results) {
          if (seenIds.has(r.id)) continue;
          seenIds.add(r.id);

          try {
            const content = await this.siyuan.readDocument(r.id);
            allResults.push({
              id: r.id,
              title: r.title,
              path: r.path,
              content,
              snippet: r.snippet,
            });
          } catch {
            allResults.push({
              id: r.id,
              title: r.title,
              path: r.path,
              content: '',
              snippet: r.snippet,
            });
          }

          if (allResults.length >= depth) break;
        }
      } catch {
        // Continue to next query
      }
      if (allResults.length >= depth) break;
    }

    // Step 2: Get TODOs related to project
    let todos: string[] = [];
    try {
      const allTodos = await this.siyuan.listTodos();
      const proj = projectName.toLowerCase();
      todos = allTodos
        .filter((t) => t.content.toLowerCase().includes(proj))
        .slice(0, 10)
        .map((t) => `${t.done ? '✅' : '⏳'} ${t.content} — \`${t.hPath || t.path}\``);
    } catch {
      // Non-critical
    }

    // Step 3: Categorize documents
    const materials = allResults.filter(
      (d) =>
        d.title.includes('设计') ||
        d.title.includes('需求') ||
        d.title.includes('方案') ||
        d.title.includes('资料'),
    );
    const meetings = allResults.filter(
      (d) =>
        d.title.includes('会议') ||
        d.title.includes('纪要') ||
        d.title.includes('讨论'),
    );
    const reports = allResults.filter(
      (d) =>
        d.title.includes('日报') ||
        d.title.includes('周报') ||
        d.title.includes('总结') ||
        d.title.includes('复盘'),
    );
    const impl = allResults.filter(
      (d) =>
        d.title.includes('实施') ||
        d.title.includes('部署') ||
        d.title.includes('开发') ||
        d.title.includes('上线'),
    );
    const other = allResults.filter(
      (d) =>
        !materials.includes(d) &&
        !meetings.includes(d) &&
        !reports.includes(d) &&
        !impl.includes(d),
    );

    // Step 4: Build formatted output
    const sections: string[] = [];
    sections.push(`## 🏗️ 项目上下文: "${projectName}"`);
    sections.push('');
    sections.push(`> 共找到 ${allResults.length} 篇相关文档，${todos.length} 项待办`);
    sections.push('');

    if (allResults.length === 0) {
      sections.push('_未找到与该项目相关的文档。请检查项目名称是否正确。_');
      const result: WorkflowResult = {
        content: sections.join('\n'),
        meta: { project: projectName, totalDocs: 0 },
      };
      this.setCache(params, result);
      return result;
    }

    // Project materials
    if (materials.length > 0) {
      sections.push('### 📋 项目资料');
      sections.push('');
      for (const doc of materials) {
        const snippet = doc.snippet || doc.content.slice(0, 150);
        sections.push(`#### ${doc.title}`);
        sections.push(`> ${snippet}`);
        sections.push(`- **路径**: ${doc.path}`);
        sections.push('');
      }
    }

    // Meetings
    if (meetings.length > 0) {
      sections.push('### 📅 会议记录');
      sections.push('');
      for (const doc of meetings) {
        sections.push(`- 📝 [${doc.title}](${doc.id}) — ${doc.path}`);
      }
      sections.push('');
    }

    // Reports
    if (reports.length > 0) {
      sections.push('### 📊 报告与总结');
      sections.push('');
      for (const doc of reports) {
        sections.push(`- 📈 [${doc.title}](${doc.id}) — ${doc.path}`);
      }
      sections.push('');
    }

    // Implementation
    if (impl.length > 0) {
      sections.push('### 🚀 实施与部署');
      sections.push('');
      for (const doc of impl) {
        sections.push(`- 🔧 [${doc.title}](${doc.id}) — ${doc.path}`);
      }
      sections.push('');
    }

    // Other
    if (other.length > 0) {
      sections.push('### 📌 其他相关资料');
      sections.push('');
      for (const doc of other) {
        sections.push(`- [${doc.title}](${doc.id}) — ${doc.path}`);
      }
      sections.push('');
    }

    // TODOs
    sections.push('### 📝 相关待办事项');
    sections.push('');
    if (todos.length > 0) {
      sections.push(...todos);
    } else {
      sections.push('_无相关待办事项_');
    }
    sections.push('');

    // Timeline (sorted by path depth as proxy)
    sections.push('### 📊 关键时间线');
    sections.push('');
    const timeline = [...allResults].sort((a, b) => a.path.localeCompare(b.path));
    for (const doc of timeline.slice(0, 8)) {
      sections.push(`| ${doc.path} | ${doc.title} |`);
    }

    const result: WorkflowResult = {
      content: sections.join('\n'),
      meta: {
        project: projectName,
        totalDocs: allResults.length,
        materials: materials.length,
        meetings: meetings.length,
        reports: reports.length,
        implementation: impl.length,
        todos: todos.length,
      },
    };

    this.setCache(params, result);
    return result;
  }
}
