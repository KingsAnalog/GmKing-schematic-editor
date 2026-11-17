/** Symbol appearance families, independent of circuit-combination templates. */
export type SymbolTemplateId = "razavi" | "abidi";

export interface SymbolTemplateDefinition {
  readonly id: SymbolTemplateId;
  readonly label: string;
  readonly available: boolean;
}

export const DEFAULT_SYMBOL_TEMPLATE: SymbolTemplateId = "razavi";

export const SYMBOL_TEMPLATES: readonly SymbolTemplateDefinition[] = Object.freeze([
  Object.freeze({ id: "razavi", label: "razavi", available: true }),
  Object.freeze({ id: "abidi", label: "abidi", available: false })
]);

export function resolveSymbolTemplate(value: unknown = DEFAULT_SYMBOL_TEMPLATE): SymbolTemplateDefinition {
  const template = SYMBOL_TEMPLATES.find(candidate => candidate.id === value);
  if (!template) throw new Error(`Unknown symbol template: ${String(value)}.`);
  if (!template.available) throw new Error(`Symbol template ${template.label} is not ready yet.`);
  return template;
}

export interface SymbolTemplateContext {
  /** Omission means Razavi; never a process-wide or browser-wide preference. */
  symbolTemplate?: SymbolTemplateId;
}
