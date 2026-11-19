// @vitest-environment jsdom
import { expect, it } from "vitest";
import { mountSchematicTab, querySchematicEditorMountElements, renderSchematicTabShell } from "../../../src/schematic/schematicTabShell";

it("mounts the standalone controls and bundled SVG icons using the same structure as the HTML entry point", () => {
  const root = document.createElement("div");
  mountSchematicTab(root);
  expect(querySchematicEditorMountElements(root)).toBeTruthy();
  const expected = new DOMParser().parseFromString(renderSchematicTabShell(), "text/html").body;
  const describeElement = (element: Element) => [
    element.namespaceURI, element.localName,
    Array.from(element.attributes, attr => [attr.name, attr.value.replace(/schematic-shell-\d+/g, "shell")]).sort(),
    Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent?.trim()).filter(Boolean)
  ];
  expect(Array.from(root.querySelectorAll("*"), describeElement))
    .toEqual(Array.from(expected.querySelectorAll("*"), describeElement));
  const instance = root.querySelector('[data-command="instance"] svg')!;
  const reference = instance.querySelector("use")!.getAttribute("href")!;
  expect(instance.querySelector(reference)).toBeTruthy();
});
