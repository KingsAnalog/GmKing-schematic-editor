import { StateField } from "@codemirror/state";

export const editorLivePreviewField = StateField.define<boolean>({
  create: () => false,
  update: (value) => value
});

export interface ObsidianMockMenuItem {
  title: string;
  icon: string;
  onClick: (() => unknown) | null;
}

export interface ObsidianMockMenu {
  items: ObsidianMockMenuItem[];
  onHide: (() => unknown) | null;
}

export const obsidianMockState = {
  menus: [] as ObsidianMockMenu[],
  notices: [] as string[]
};

export function resetObsidianMockState() {
  obsidianMockState.menus.length = 0;
  obsidianMockState.notices.length = 0;
}

export class Menu {
  private readonly state: ObsidianMockMenu = { items: [], onHide: null };

  constructor() {
    obsidianMockState.menus.push(this.state);
  }

  setUseNativeMenu() { return this; }
  addItem(callback: (item: MenuItem) => void) {
    const state = { title: "", icon: "", onClick: null } satisfies ObsidianMockMenuItem;
    this.state.items.push(state);
    callback(new MenuItem(state));
    return this;
  }
  onHide(callback: () => unknown) { this.state.onHide = callback; }
  showAtPosition() { return this; }
  hide() { this.state.onHide?.(); return this; }
}

class MenuItem {
  constructor(private readonly state: ObsidianMockMenuItem) {}
  setTitle(title: string) { this.state.title = title; return this; }
  setIcon(icon: string) { this.state.icon = icon; return this; }
  onClick(callback: () => unknown) { this.state.onClick = callback; return this; }
}

export class Notice {
  constructor(message: string) { obsidianMockState.notices.push(message); }
}
