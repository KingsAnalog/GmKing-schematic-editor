import { describe, expect, it } from "vitest";
import { SchematicToolbarController } from "../../../src/schematic/toolbar";

class FakeClassList {
  private readonly names = new Set<string>();

  contains(name: string) {
    return this.names.has(name);
  }

  toggle(name: string, force?: boolean) {
    const enabled = force ?? !this.names.has(name);
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  disabled = false;
  parent: FakeElement | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();

  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatchEvent(event: FakeEvent) {
    (this.listeners.get(event.type) ?? []).forEach((listener) => listener(event));
  }

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  closest(selector: string): FakeElement | null {
    if (selector === "[data-command]" && this.dataset.command !== undefined) return this;
    return this.parent?.closest(selector) ?? null;
  }

  querySelectorAll(_selector: string) {
    const matches: FakeElement[] = [];
    const visit = (element: FakeElement) => {
      if (element.dataset.command !== undefined) matches.push(element);
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

class FakeEvent {
  constructor(readonly type: string, readonly target: FakeElement) {}
}

function button(command: string, kind?: string) {
  const element = new FakeElement();
  element.dataset.command = command;
  if (kind) element.dataset.commandKind = kind;
  return element;
}

describe("SchematicToolbarController", () => {
  it("dispatches toolbar commands from nested targets and binds only once", () => {
    const root = new FakeElement();
    const wireButton = root.appendChild(button("wire", "tool"));
    const icon = wireButton.appendChild(new FakeElement());
    const commands: string[] = [];
    const controller = new SchematicToolbarController(root as unknown as Element, {
      onCommand: (command) => commands.push(command)
    });

    controller.bind();
    controller.bind();
    root.dispatchEvent(new FakeEvent("click", icon));

    expect(commands).toEqual(["wire"]);
  });

  it("ignores clicks without an in-scope toolbar command", () => {
    const root = new FakeElement();
    const outsideButton = button("delete");
    const outsideIcon = outsideButton.appendChild(new FakeElement());
    const commands: string[] = [];
    const controller = new SchematicToolbarController(root as unknown as Element, {
      onCommand: (command) => commands.push(command)
    });

    controller.bind();
    root.dispatchEvent(new FakeEvent("click", root.appendChild(new FakeElement())));
    root.dispatchEvent(new FakeEvent("click", outsideIcon));

    expect(commands).toEqual([]);
  });

  it("applies active, aria-pressed, and undo/redo disabled projection", () => {
    const root = new FakeElement();
    const instanceButton = root.appendChild(button("instance", "tool"));
    const wireButton = root.appendChild(button("wire", "tool"));
    const presentationButton = root.appendChild(button("presentation", "toggle"));
    const rotateButton = root.appendChild(button("rotate"));
    const undoButton = root.appendChild(button("undo"));
    const redoButton = root.appendChild(button("redo"));
    const controller = new SchematicToolbarController(root as unknown as Element, {
      onCommand: () => {}
    });

    controller.sync({
      mode: "wire",
      presentationMode: true,
      canUndo: false,
      canRedo: true
    });

    expect(instanceButton.classList.contains("is-active")).toBe(false);
    expect(instanceButton.getAttribute("aria-pressed")).toBe("false");
    expect(wireButton.classList.contains("is-active")).toBe(true);
    expect(wireButton.getAttribute("aria-pressed")).toBe("true");
    expect(presentationButton.classList.contains("is-active")).toBe(true);
    expect(presentationButton.getAttribute("aria-pressed")).toBe("true");
    expect(rotateButton.classList.contains("is-active")).toBe(false);
    expect(rotateButton.getAttribute("aria-pressed")).toBeNull();
    expect(undoButton.disabled).toBe(true);
    expect(redoButton.disabled).toBe(false);

    controller.sync({
      mode: "select",
      presentationMode: false,
      canUndo: true,
      canRedo: false
    });

    expect(wireButton.classList.contains("is-active")).toBe(false);
    expect(wireButton.getAttribute("aria-pressed")).toBe("false");
    expect(presentationButton.classList.contains("is-active")).toBe(false);
    expect(presentationButton.getAttribute("aria-pressed")).toBe("false");
    expect(undoButton.disabled).toBe(false);
    expect(redoButton.disabled).toBe(true);
  });
});
