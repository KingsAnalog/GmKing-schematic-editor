export interface WindowOwnedCoordinator {
  readonly ownerWindow: Window;
  destroy(): void;
}

/** Keeps one coordinator per live Obsidian Window and owns its disposal. */
export class WindowCoordinatorRegistry<Coordinator extends WindowOwnedCoordinator> {
  private readonly byWindow = new WeakMap<Window, Coordinator>();
  private readonly live = new Set<Coordinator>();

  constructor(
    private readonly createCoordinator: (
      ownerWindow: Window & typeof globalThis
    ) => Coordinator
  ) {}

  getOrCreate(ownerWindow: Window & typeof globalThis) {
    const existing = this.byWindow.get(ownerWindow);
    if (existing) return existing;
    const coordinator = this.createCoordinator(ownerWindow);
    this.byWindow.set(ownerWindow, coordinator);
    this.live.add(coordinator);
    return coordinator;
  }

  get(ownerWindow: Window) {
    return this.byWindow.get(ownerWindow) ?? null;
  }

  find(predicate: (coordinator: Coordinator) => boolean) {
    return [...this.live].find(predicate) ?? null;
  }

  forEach(callback: (coordinator: Coordinator) => void) {
    this.live.forEach(callback);
  }

  destroyWindow(ownerWindow: Window) {
    const coordinator = this.byWindow.get(ownerWindow);
    if (!coordinator) return false;
    this.byWindow.delete(ownerWindow);
    this.live.delete(coordinator);
    coordinator.destroy();
    return true;
  }

  destroyAll() {
    [...this.live].forEach((coordinator) => {
      this.destroyWindow(coordinator.ownerWindow);
    });
  }

  get size() {
    return this.live.size;
  }
}
