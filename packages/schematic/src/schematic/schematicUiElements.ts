import { createSchematicSvgElement } from "./schematicSvgDom";
import { escapeHtml } from "./uiUtils";

type UiTag = "aside" | "button" | "dialog" | "div" | "h2" | "h3" | "input" | "label" | "main" | "option"
  | "output" | "p" | "pre" | "section" | "select" | "span" | "strong" | "sub" | "svg" | "path" | "textarea";
type Attribute = `data-${string}` | `aria-${string}` | "accept" | "autocomplete" | "class" | "d"
  | "disabled" | "focusable" | "for" | "hidden" | "id" | "max" | "min" | "placeholder" | "readonly" | "role"
  | "spellcheck" | "step" | "style" | "tabindex" | "title" | "type" | "value" | "viewBox";
type Attributes = Partial<Record<Attribute, string | boolean | number>>;

export interface UiBuilder<T extends object> {
  el(this: void, tag: UiTag, attrs: Attributes, ...children: (T | string)[]): T;
  toolbarIcon(source: string): T;
}

export function domUi(doc: Document): UiBuilder<Element> {
  return {
    el(tag, attrs, ...children) {
      const node = tag === "svg" || tag === "path"
        ? doc.createElementNS("http://www.w3.org/2000/svg", tag)
        : doc.createElement(tag);
      for (const [name, value] of Object.entries(attrs)) {
        if (value !== false) node.setAttribute(name, value === true ? "" : String(value));
      }
      node.append(...children);
      return node;
    },
    toolbarIcon: source => createSchematicSvgElement(doc, source, "toolbar")
  };
}

// Keep the published HTML-string API available to hosts without a DOM.
export const markupUi: UiBuilder<{ html: string }> = {
  el(tag, attrs, ...children) {
    let start = `<${tag}`;
    for (const [name, value] of Object.entries(attrs)) {
      if (value === true) start += ` ${name}`;
      else if (value !== false) start += ` ${name}="${escapeHtml(String(value))}"`;
    }
    if (tag === "input") return { html: start + " />" };
    const content = children.map(child => typeof child === "string" ? escapeHtml(child) : child.html).join("");
    return { html: `${start}>${content}</${tag}>` };
  },
  // Callers supply only the toolbar's shipped SVG files with namespaced IDs.
  toolbarIcon: html => ({ html })
};
