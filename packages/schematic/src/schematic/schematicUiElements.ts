import { createSchematicSvgElement } from "./schematicSvgDom";
import { messageText, type SchematicMessage } from "./schematicI18n";
import { escapeHtml } from "./uiUtils";

type UiTag = "a" | "aside" | "button" | "dialog" | "div" | "h2" | "h3" | "input" | "label" | "main" | "option"
  | "output" | "p" | "pre" | "section" | "select" | "span" | "strong" | "sub" | "svg" | "path" | "textarea";
type Attribute = `data-${string}` | `aria-${string}` | "accept" | "autocomplete" | "class" | "d"
  | "disabled" | "focusable" | "for" | "hidden" | "href" | "id" | "max" | "min" | "placeholder" | "readonly" | "rel" | "role"
  | "selected" | "spellcheck" | "step" | "style" | "tabindex" | "target" | "title" | "type" | "value" | "viewBox";
type Attributes = Partial<Record<Attribute, string | boolean | number | SchematicMessage>>;
type Child<T> = T | string | SchematicMessage;

export interface UiBuilder<T extends object> {
  el(this: void, tag: UiTag, attrs: Attributes, ...children: Child<T>[]): T;
  toolbarIcon(source: string): T;
}

function isMessage(child: unknown): child is SchematicMessage {
  return typeof child === "object" && child !== null && "type" in child && child.type === "schematic-message";
}

function resolveElement<T>(attrs: Attributes, children: Child<T>[]) {
  const attributes: Array<[string, string | number | true]> = [];
  for (const [name, value] of Object.entries(attrs)) {
    if (isMessage(value)) {
      attributes.push([name, messageText(value)], [`data-schematic-message-${name}`, JSON.stringify(value)]);
    } else if (value !== false && value !== undefined) {
      attributes.push([name, value]);
    }
  }
  if (children.length === 1 && isMessage(children[0])) {
    attributes.push(["data-schematic-message", JSON.stringify(children[0])]);
    return { attributes, children: [messageText(children[0])] };
  }
  return { attributes, children };
}

export function domUi(doc: Document): UiBuilder<Element> {
  const el: UiBuilder<Element>["el"] = (tag, attrs, ...children) => {
    const node = tag === "svg" || tag === "path"
      ? doc.createElementNS("http://www.w3.org/2000/svg", tag)
      : doc.createElement(tag);
    const resolved = resolveElement(attrs, children);
    for (const [name, value] of resolved.attributes) {
      node.setAttribute(name, value === true ? "" : String(value));
    }
    node.append(...resolved.children.map(child => isMessage(child) ? el("span", {}, child) : child));
    return node;
  };
  return { el, toolbarIcon: source => createSchematicSvgElement(doc, source, "toolbar") };
}

// Keep the published HTML-string API available to hosts without a DOM.
export const markupUi: UiBuilder<{ html: string }> = {
  el(tag, attrs, ...children) {
    let start = `<${tag}`;
    const resolved = resolveElement(attrs, children);
    for (const [name, value] of resolved.attributes) {
      if (value === true) start += ` ${name}`;
      else start += ` ${name}="${escapeHtml(String(value))}"`;
    }
    if (tag === "input") return { html: start + " />" };
    const content = resolved.children.map(child => {
      if (isMessage(child)) return markupUi.el("span", {}, child).html;
      return typeof child === "string" ? escapeHtml(child) : child.html;
    }).join("");
    return { html: `${start}>${content}</${tag}>` };
  },
  // Callers supply only the toolbar's shipped SVG files with namespaced IDs.
  toolbarIcon: html => ({ html })
};
