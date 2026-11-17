import { describe, expect, it } from "vitest";
import {
  WindowCoordinatorRegistry,
  type WindowOwnedCoordinator
} from "../src/windowCoordinatorRegistry";

class ListeningCoordinator implements WindowOwnedCoordinator {
  destroyCalls = 0;
  eventCalls = 0;

  constructor(readonly ownerWindow: Window) {
    ownerWindow.addEventListener("schematic-registry-probe", this.handleProbe);
  }

  destroy() {
    this.destroyCalls += 1;
    this.ownerWindow.removeEventListener("schematic-registry-probe", this.handleProbe);
  }

  private readonly handleProbe = () => {
    this.eventCalls += 1;
  };
}

describe("Window coordinator registry", () => {
  it("creates one coordinator per Window and removes listeners on close", () => {
    const created: ListeningCoordinator[] = [];
    const registry = new WindowCoordinatorRegistry((ownerWindow) => {
      const coordinator = new ListeningCoordinator(ownerWindow);
      created.push(coordinator);
      return coordinator;
    });
    const ownerWindow = window as Window & typeof globalThis;

    const first = registry.getOrCreate(ownerWindow);
    expect(registry.getOrCreate(ownerWindow)).toBe(first);
    expect(created).toEqual([first]);
    expect(registry.size).toBe(1);

    ownerWindow.dispatchEvent(new Event("schematic-registry-probe"));
    expect(first.eventCalls).toBe(1);
    expect(registry.destroyWindow(ownerWindow)).toBe(true);
    expect(registry.get(ownerWindow)).toBeNull();
    expect(registry.size).toBe(0);
    expect(first.destroyCalls).toBe(1);

    ownerWindow.dispatchEvent(new Event("schematic-registry-probe"));
    expect(first.eventCalls).toBe(1);
    expect(registry.destroyWindow(ownerWindow)).toBe(false);
    expect(first.destroyCalls).toBe(1);
  });

  it("destroys every live Window exactly once on plugin unload", () => {
    const registry = new WindowCoordinatorRegistry(
      (ownerWindow) => new ListeningCoordinator(ownerWindow)
    );
    const firstWindow = new EventTarget() as Window & typeof globalThis;
    const secondWindow = new EventTarget() as Window & typeof globalThis;
    const first = registry.getOrCreate(firstWindow);
    const second = registry.getOrCreate(secondWindow);

    registry.destroyAll();

    expect(registry.size).toBe(0);
    expect(registry.get(firstWindow)).toBeNull();
    expect(registry.get(secondWindow)).toBeNull();
    expect(first.destroyCalls).toBe(1);
    expect(second.destroyCalls).toBe(1);
    registry.destroyAll();
    expect(first.destroyCalls).toBe(1);
    expect(second.destroyCalls).toBe(1);
  });
});
