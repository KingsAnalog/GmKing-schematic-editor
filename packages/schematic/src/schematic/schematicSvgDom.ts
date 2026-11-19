import createDOMPurify, { type Config, type DOMPurify } from "dompurify";

const svgNamespace = "http://www.w3.org/2000/svg";
const purifiers = new WeakMap<Window, DOMPurify>();

// Preserve opaque document identifiers, including IDs containing colons.
const metadataAttributes = [
  "data-note-id", "data-markdown-note-fallback",
  "data-component-id", "data-pin-id", "data-selector", "data-symbol-content-path", "data-symbol-content-run",
  "data-wire-id", "data-wire-endpoint", "data-net-label-id", "data-junction", "data-inductor-coupling-id",
  "data-coupling-core", "data-coupling-arc", "data-coupling-arrows", "data-coupling-label", "data-wire-digital-slash", "data-wire-digital-label"
];

const drawing = {
  ALLOWED_TAGS: ["svg", "g", "defs", "pattern", "clipPath", "path", "rect", "circle", "line",
    "polygon", "polyline", "text", "tspan"],
  ALLOWED_ATTR: ["xmlns", "class", "id", "viewBox", "width", "height", "x", "y", "dx", "dy",
    "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "transform",
    "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
    "stroke-linejoin", "opacity", "patternUnits", "clip-path", "font-family", "font-size",
    "font-style", "font-weight", "text-decoration", "text-anchor", "dominant-baseline",
    "xml:space", "focusable", "aria-hidden", ...metadataAttributes],
  ADD_URI_SAFE_ATTR: metadataAttributes,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  RETURN_DOM_FRAGMENT: true
} satisfies Config;

// The bundled toolbar artwork uses gradients, blur and local <use> references.
const toolbarIcon = {
  ...drawing,
  ADD_TAGS: ["linearGradient", "radialGradient", "stop", "filter", "feGaussianBlur", "use"],
  ADD_ATTR: ["offset", "stop-color", "filter", "color-interpolation-filters", "stdDeviation", "href"]
} satisfies Config;

const localPaint = /^url\(#[\w.-]+\)$/;
const color = /^(?:#[\da-f]{3,8}|[a-z]+)$/i;

function purifierFor(doc: Document) {
  const view = doc.defaultView ?? window;
  let purifier = purifiers.get(view);
  if (!purifier) {
    purifier = createDOMPurify(view);
    purifier.addHook("uponSanitizeAttribute", (_node, attr) => {
      const { attrName, attrValue } = attr;
      if (attrName === "fill" || attrName === "stroke" || attrName === "stop-color") {
        attr.keepAttr = color.test(attrValue) || localPaint.test(attrValue);
      } else if (attrName === "clip-path" || attrName === "filter") {
        attr.keepAttr = localPaint.test(attrValue);
      } else if (attrName === "href") {
        attr.keepAttr = /^#[\w.-]+$/.test(attrValue);
      }
    });
    purifiers.set(view, purifier);
  }
  return purifier;
}

export function createSchematicSvgElement(doc: Document, source: string, kind: "drawing" | "toolbar" = "drawing"): SVGSVGElement {
  const fragment = purifierFor(doc).sanitize(source, kind === "toolbar" ? toolbarIcon : drawing);
  const svg = fragment.firstElementChild;
  if (svg?.namespaceURI !== svgNamespace || svg.localName !== "svg") {
    throw new Error("Expected a schematic SVG root.");
  }
  return doc.adoptNode(svg) as SVGSVGElement;
}
