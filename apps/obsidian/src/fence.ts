import {
  parseSchematicContent,
  SCHEMATIC_FILE_FORMAT,
  serializeSchematicContent,
  type SchematicContent
} from "@edahelper/schematic/core";

export interface SchematicFenceSourceMap {
  from: number;
  to: number;
  bodyFrom: number;
  bodyTo: number;
  marker: "`" | "~";
  markerLength: number;
  infoString: string;
  openingPrefix: string;
  bodyPrefix: string;
  newline: "\n" | "\r\n";
  rawBody: string;
  logicalBody: string;
}

export type SchematicFenceProjection =
  | { kind: "schematic"; map: SchematicFenceSourceMap; content: SchematicContent; canonical: string }
  | { kind: "diagnostic"; map: SchematicFenceSourceMap; message: string };

export interface MinimalTextChange {
  from: number;
  to: number;
  insert: string;
}

export interface SchematicFenceInsertion {
  from: number;
  to: number;
  insert: string;
  fenceFrom: number;
  fenceTo: number;
}

const FORMAT_HINT = /["']format["']\s*:\s*["']adc-helper\/schematic["']/;

export function parseSchematicFence(
  documentSource: string,
  from = 0,
  to = documentSource.length
): SchematicFenceProjection | null {
  const map = parseJsonFenceSourceMap(documentSource, from, to);
  if (!map) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(map.logicalBody);
  } catch (error) {
    if (!FORMAT_HINT.test(map.logicalBody)) return null;
    return {
      kind: "diagnostic",
      map,
      message: `Invalid schematic JSON: ${errorMessage(error)}`
    };
  }

  if (!isRecord(parsed) || parsed.format !== SCHEMATIC_FILE_FORMAT) return null;
  try {
    const content = parseSchematicContent(map.logicalBody);
    return {
      kind: "schematic",
      map,
      content,
      canonical: serializeSchematicContent(content)
    };
  } catch (error) {
    return { kind: "diagnostic", map, message: errorMessage(error) };
  }
}

export function parseJsonFenceSourceMap(
  documentSource: string,
  from = 0,
  to = documentSource.length
): SchematicFenceSourceMap | null {
  if (from < 0 || to < from || to > documentSource.length) return null;
  const source = documentSource.slice(from, to);
  const newline: "\n" | "\r\n" = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = sourceLines(source);
  if (lines.length < 2) return null;

  const opening = lines.find((line) => line.text.trim().length > 0);
  if (!opening) return null;
  const openingMatch = opening.text.match(/^(.*?)(`{3,}|~{3,})([^\r\n]*)$/);
  if (!openingMatch || !isContainerPrefix(openingMatch[1])) return null;
  const marker = openingMatch[2][0] as "`" | "~";
  const markerLength = openingMatch[2].length;
  const infoString = openingMatch[3].trim();
  if (infoString.split(/\s+/, 1)[0] !== "json") return null;

  let closing: SourceLine | null = null;
  for (let index = lines.length - 1; index > lines.indexOf(opening); index -= 1) {
    const line = lines[index];
    if (!line.text.trim()) continue;
    const match = line.text.match(/^(.*?)(`{3,}|~{3,})[ \t]*$/);
    if (
      match
      && isContainerPrefix(match[1])
      && match[2][0] === marker
      && match[2].length >= markerLength
    ) {
      closing = line;
    }
    break;
  }
  if (!closing || opening.endWithNewline > closing.start) return null;

  const closingMatch = closing.text.match(/^(.*?)(`{3,}|~{3,})[ \t]*$/)!;
  const bodyPrefix = closingMatch[1];
  const bodyFrom = from + opening.endWithNewline;
  const bodyTo = from + closing.start;
  const rawBody = documentSource.slice(bodyFrom, bodyTo);
  const logicalBody = stripBodyPrefix(rawBody, bodyPrefix, newline);
  return {
    from: from + opening.start,
    to: from + closing.endWithNewline,
    bodyFrom,
    bodyTo,
    marker,
    markerLength,
    infoString,
    openingPrefix: openingMatch[1],
    bodyPrefix,
    newline,
    rawBody,
    logicalBody
  };
}

export function canonicalFenceBody(content: SchematicContent, map: SchematicFenceSourceMap) {
  const canonical = serializeSchematicContent(content).replace(/\n$/, "");
  return canonical
    .split("\n")
    .map((line) => `${map.bodyPrefix}${line}`)
    .join(map.newline) + map.newline;
}

export function minimalFenceBodyChange(
  content: SchematicContent,
  map: SchematicFenceSourceMap
): MinimalTextChange | null {
  const next = canonicalFenceBody(content, map);
  return minimalUtf16TextChange(map.rawBody, next, map.bodyFrom);
}

export function minimalUtf16TextChange(
  previous: string,
  next: string,
  absoluteFrom = 0
): MinimalTextChange | null {
  if (previous === next) return null;
  let prefix = 0;
  const prefixLimit = Math.min(previous.length, next.length);
  while (prefix < prefixLimit && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix += 1;
  prefix = avoidSplitSurrogate(previous, prefix);
  prefix = avoidSplitSurrogate(next, prefix);

  let suffix = 0;
  const suffixLimit = Math.min(previous.length - prefix, next.length - prefix);
  while (
    suffix < suffixLimit
    && previous.charCodeAt(previous.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  while (
    suffix > 0
    && (
      splitsSurrogate(previous, previous.length - suffix)
      || splitsSurrogate(next, next.length - suffix)
    )
  ) {
    suffix -= 1;
  }

  return {
    from: absoluteFrom + prefix,
    to: absoluteFrom + previous.length - suffix,
    insert: next.slice(prefix, next.length - suffix)
  };
}

export function projectSchematicFenceInsertion(
  documentSource: string,
  from: number,
  to: number,
  canonical: string
): SchematicFenceInsertion {
  if (from < 0 || to < from || to > documentSource.length) {
    throw new RangeError("Invalid schematic insertion range.");
  }
  if (splitsCrLf(documentSource, from) || splitsCrLf(documentSource, to)) {
    throw new RangeError("Schematic insertion range must not split a CRLF line ending.");
  }

  const newline = detectNewline(documentSource);
  const leading = from > 0 && documentSource[from - 1] !== "\n" ? newline : "";
  const followingNewline = newlineAt(documentSource, to);
  const trailing = followingNewline ? "" : newline;
  const body = canonical
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .replace(/\n/g, newline);
  const fence = `\`\`\`json${newline}${body}${newline}\`\`\``;
  const fenceFrom = from + leading.length;
  return {
    from,
    to,
    insert: `${leading}${fence}${trailing}`,
    fenceFrom,
    // Fenced-code ranges include the closing line ending, even when it comes from the unchanged suffix.
    fenceTo: fenceFrom + fence.length + (followingNewline?.length ?? trailing.length)
  };
}

function detectNewline(source: string): "\n" | "\r\n" {
  const firstLf = source.indexOf("\n");
  return firstLf > 0 && source[firstLf - 1] === "\r" ? "\r\n" : "\n";
}

function newlineAt(source: string, offset: number): "\n" | "\r\n" | null {
  if (source.startsWith("\r\n", offset)) return "\r\n";
  return source[offset] === "\n" ? "\n" : null;
}

function splitsCrLf(source: string, offset: number) {
  return offset > 0
    && offset < source.length
    && source[offset - 1] === "\r"
    && source[offset] === "\n";
}

interface SourceLine {
  start: number;
  endWithNewline: number;
  text: string;
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const pattern = /.*?(?:\r\n|\n|$)/g;
  for (const match of source.matchAll(pattern)) {
    if (!match[0]) continue;
    const text = match[0].replace(/\r?\n$/, "");
    lines.push({
      start: match.index,
      endWithNewline: match.index + match[0].length,
      text
    });
  }
  return lines;
}

function stripBodyPrefix(rawBody: string, prefix: string, newline: string) {
  if (!prefix) return rawBody;
  const hasFinalNewline = rawBody.endsWith(newline);
  const lines = rawBody.split(newline);
  if (hasFinalNewline) lines.pop();
  const logical = lines.map((line) => line.startsWith(prefix) ? line.slice(prefix.length) : line).join("\n");
  return hasFinalNewline ? `${logical}\n` : logical;
}

function isContainerPrefix(prefix: string) {
  return /^[\t >+*\-0-9.)]*$/.test(prefix);
}

function avoidSplitSurrogate(value: string, index: number) {
  return splitsSurrogate(value, index) ? index - 1 : index;
}

function splitsSurrogate(value: string, index: number) {
  return index > 0
    && index < value.length
    && isHighSurrogate(value.charCodeAt(index - 1))
    && isLowSurrogate(value.charCodeAt(index));
}

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number) {
  return code >= 0xdc00 && code <= 0xdfff;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
