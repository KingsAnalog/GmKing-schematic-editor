import { symbolTextRun, type SymbolTextRun } from "./symbolContentModel";

export function splitComponentName(ref: string) {
  const match = /^([+\-−]?(?:\p{Nd}+(?:\.\p{Nd}*)?|\.\p{Nd}+)?)(\p{L})([\p{L}\p{Nd}]*)$/u.exec(ref);
  if (!match) return { prefix: ref, head: "", tail: "", literal: true };
  return {
    prefix: (match[1] ?? "").replace(/^-/, "−"),
    head: match[2] ?? "",
    tail: match[3] ?? "",
    literal: false
  };
}

/** Numeric values stay literal; symbolic values use the same subscripts as component names. */
export function symbolicValueRuns(value: string, fontSize: number, scriptFontSize: number): SymbolTextRun[] {
  if (Number.isFinite(Number(value))) {
    return [symbolTextRun(value, fontSize, { fontStyle: "normal", fontWeight: 700 })];
  }
  const { prefix, head, tail } = splitComponentName(value);
  return [
    symbolTextRun(prefix, fontSize, { fontStyle: "normal", fontWeight: 700 }),
    symbolTextRun(head, fontSize, { fontStyle: "italic", fontWeight: 700 }),
    symbolTextRun(tail, scriptFontSize, { fontStyle: "normal", fontWeight: 700, script: "subscript" })
  ].filter(run => run.text);
}
