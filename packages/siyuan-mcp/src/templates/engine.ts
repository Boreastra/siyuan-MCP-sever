/**
 * Template Engine — loads and renders Markdown prompt templates.
 *
 * Templates use simple {{variable}} and {{#section}}...{{/section}} syntax.
 * Sections render only when the data key exists and is truthy (for objects) or
 * an array with items (for arrays).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const templateCache = new Map<string, string>();

/**
 * Load a template file by name (without .md extension).
 * Tries dist/ first (production), falls back to src/templates/ (development).
 */
export function loadTemplate(name: string): string {
  if (templateCache.has(name)) {
    return templateCache.get(name)!;
  }

  // Try dist/ directory first (production build)
  let filePath = join(__dirname, `${name}.md`);
  if (!existsSync(filePath)) {
    // Fallback: try src/templates/ relative to project root (development)
    const altPath = join(__dirname, '..', 'src', 'templates', `${name}.md`);
    if (existsSync(altPath)) {
      filePath = altPath;
    } else {
      throw new Error(
        `Template "${name}" not found at ${join(__dirname, `${name}.md`)} or ${altPath}`,
      );
    }
  }

  const content = readFileSync(filePath, 'utf-8');
  templateCache.set(name, content);
  return content;
}

/**
 * Render a template with data using simple Mustache-style syntax.
 */
export function renderTemplate(
  template: string,
  data: Record<string, unknown>,
): string {
  let result = template;

  // Step 1: Process sections FIRST (so inner {{variable}} are protected during outer variable replacement)
  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, key: string, content: string) => {
      const value = data[key];

      // Inverted section: {{^section}} — handled in step 3, skip here
      if (key.startsWith('^')) {
        return _match;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) return '';
        return value
          .map((item: unknown) => {
            if (typeof item === 'object' && item !== null) {
              return renderTemplate(content, item as Record<string, unknown>);
            }
            return renderTemplate(content, { '.': item });
          })
          .join('');
      }

      // Truthy non-array — render once with the value
      if (value) {
        if (typeof value === 'object' && value !== null) {
          return renderTemplate(content, value as Record<string, unknown>);
        }
        return renderTemplate(content, { '.': value });
      }

      return '';
    },
  );

  // Step 2: Simple {{variable}} replacement (after sections are processed)
  // Supports {{name}} and {{.}} (dot for current item in array iteration)
  result = result.replace(/\{\{(\.|\w+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    if (value === undefined || value === null) return '';
    return String(value);
  });

  // Step 3: Inverted sections: {{^section}}...{{/section}}
  result = result.replace(
    /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, key: string, content: string) => {
      const value = data[key];
      if (!value || (Array.isArray(value) && value.length === 0)) {
        return content;
      }
      return '';
    },
  );

  return result;
}

/**
 * Load and render a template in one call.
 */
export function applyTemplate(
  name: string,
  data: Record<string, unknown>,
): string {
  const template = loadTemplate(name);
  return renderTemplate(template, data);
}
