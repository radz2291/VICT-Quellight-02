import { createHash } from 'node:crypto';
import conversation from './conversation.json' with { type: 'json' };

export interface PromptDefinition {
  id: string;
  description: string;
  variables: readonly string[];
  template: readonly string[];
}

export const promptCatalog = { conversation } satisfies Record<string, PromptDefinition>;

/** Resolve template fields once, preserving supplied context as literal text. */
export function renderPrompt(definition: PromptDefinition, values: Record<string, string>) {
  const template = definition.template.join('\n').replace(/\r\n?/g, '\n');
  if (!definition.id.trim() || !template.trim()) throw new Error('PROMPT_DEFINITION_EMPTY');

  const declared = new Set(definition.variables);
  const supplied = Object.keys(values);
  if (declared.size !== definition.variables.length || supplied.length !== declared.size ||
      supplied.some(key => !declared.has(key) || typeof values[key] !== 'string')) {
    throw new Error('PROMPT_VARIABLES_INVALID');
  }

  const used = new Set<string>();
  const text = template.replace(/\{\{([^{}]*)\}\}/g, (_match, field: string) => {
    const key = field.trim();
    if (!declared.has(key)) throw new Error('PROMPT_VARIABLE_UNDECLARED');
    used.add(key);
    return values[key];
  });
  if (used.size !== declared.size) throw new Error('PROMPT_VARIABLE_UNUSED');

  const revision = createHash('sha256').update(JSON.stringify({ id: definition.id, text })).digest('hex');
  return { id: definition.id, revision, text };
}
