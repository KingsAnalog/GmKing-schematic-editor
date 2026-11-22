import { renderComponentSvg } from "./componentSvgRenderer";
import { hasUniquePortNames, isPortName, parseBusName } from "./busName";
import { blockGeometry, nextPortSlot, PORT_IDENTIFIER, PORT_SIDES, PORT_TYPES, readSheetPort, sheetPorts, type PortSide, type PortType } from "./hierarchyPins";
import { blockFields, blockTarget, canReferenceSheet, type SchematicProject, type SchematicSheet } from "./schematicProject";
import { createEmptySchematicContent } from "./document/documentModel";
import { t } from "./schematicI18n";
import type { ComponentInstance } from "./types";

export interface HierarchyStep { sheetId: string; instanceId?: string }

interface HierarchyActions {
  project(): SchematicProject | null;
  path(): HierarchyStep[];
  change(mutate: (project: SchematicProject, activeSheet: string) => void): void;
  navigate(path: HierarchyStep[], selection?: string): void;
  arm(component: ComponentInstance): void;
  cancelTool(): void;
  focus(id: string): void;
  status(text: string): void;
  refreshLibrary(): void;
  id(): string;
}

export class SchematicHierarchyPanel {
  private readonly document: Document;
  private readonly lifetime: AbortController;
  private readonly panel: HTMLElement;
  private readonly paper: HTMLElement | null;
  private readonly dialog: HTMLDialogElement;
  private readonly properties: HTMLElement;
  private readonly header: HTMLElement;
  private readonly sheetList: HTMLElement;
  private readonly search: HTMLInputElement;
  private selectedId?: string;
  private propertySignature = "";
  private pickingChild = false;
  private readonly expanded = new Set<string>();
  private readonly sections = new Map<string, boolean>();

  constructor(private readonly root: HTMLElement, private readonly actions: HierarchyActions) {
    this.document = root.ownerDocument;
    this.lifetime = new this.document.defaultView!.AbortController();
    this.panel = root.querySelector("[data-right-panel='hierarchy']") ?? this.element("section");
    this.paper = root.querySelector("[data-schematic-paper]");
    const body = this.element("div", "hierarchy-body");
    this.header = this.element("div", "hierarchy-header");
    this.sheetList = this.element("div", "hierarchy-sheet-list");
    this.search = this.element("input", "hierarchy-search");
    this.search.type = "search";
    body.append(this.header, this.search, this.sheetList);
    this.panel.append(body);
    this.dialog = this.element("dialog", "schematic-dialog hierarchy-dialog");
    this.dialog.dataset.hierarchyDialog = "";
    this.root.append(this.dialog);
    this.properties = this.element("section", "hierarchy-properties");
    this.properties.hidden = true;
    this.properties.dataset.hierarchyProperties = "";
    root.querySelector("[data-schematic-property-editor]")?.append(this.properties);
  }

  bind() {
    const { signal } = this.lifetime;
    this.search.addEventListener("input", () => this.renderTree(), { signal });
    this.root.querySelector("[data-command='pin']")?.addEventListener("click", () => this.openPinDialog(), { signal });
    this.document.defaultView!.addEventListener("keydown", event => {
      const target = event.target as HTMLElement | null;
      if (!target || !this.root.contains(target) || target.closest("dialog[open], input, textarea, select, [contenteditable]")
        || event.isComposing) return;
      const key = event.key.toLowerCase();
      if (key === "e" && !event.shiftKey && !event.altKey && !event.metaKey) {
        this.consumeShortcut(event);
        if (event.repeat) return;
        if (event.ctrlKey) {
          this.setPickingChild(false);
          this.goUp();
        } else {
          this.actions.cancelTool();
          this.setPickingChild(true);
          this.paper?.focus({ preventScroll: true });
          this.actions.status(this.caption("pickChild", "Select a sheet instance to enter. Press Esc to cancel."));
        }
        return;
      }
      if (this.pickingChild && key === "escape") {
        this.consumeShortcut(event);
        this.setPickingChild(false);
        this.actions.status(t("hierarchy.pickCanceled", "Sheet selection canceled."));
        return;
      }
      if (!["control", "shift", "alt", "meta"].includes(key)) this.setPickingChild(false);
      if (key !== "p" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      this.consumeShortcut(event);
      this.openPinDialog();
    }, { capture: true, signal });
    this.document.defaultView!.addEventListener("pointerdown", event => {
      if (!this.pickingChild || event.button !== 0) return;
      if (!this.paper?.contains(event.target as Node)) {
        this.setPickingChild(false);
        return;
      }
      this.consumeShortcut(event);
      const block = this.blockAt(event.target);
      if (block) this.enterBlock(block);
    }, { capture: true, signal });
    this.paper?.addEventListener("dblclick", event => {
      const block = this.blockAt(event.target);
      if (!block) return;
      event.preventDefault();
      this.enterBlock(block);
    }, { signal });
  }

  private consumeShortcut(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private setPickingChild(active: boolean) {
    this.pickingChild = active;
    this.paper?.classList.toggle("is-hierarchy-picking", active);
  }

  private blockAt(target: EventTarget | null) {
    const id = (target as Element | null)?.closest("[model-id]")?.getAttribute("model-id");
    if (!id) return;
    return this.activeSheet()?.content.components.find(component =>
      component.id === id && !component.temporarilyDeleted && blockTarget(component));
  }

  destroy() {
    this.lifetime.abort();
    this.setPickingChild(false);
    this.dialog.remove();
    this.properties.remove();
  }

  refresh() {
    this.setPickingChild(false);
    this.renderTree();
    this.renderProperties();
    this.actions.refreshLibrary();
  }

  select(id?: string) {
    this.selectedId = id;
    this.renderProperties();
  }

  library() {
    const project = this.actions.project();
    if (!project) return [];
    const current = this.currentId();
    return project.sheets.map(sheet => ({
      id: sheet.id, name: sheet.name, enabled: canReferenceSheet(project, current, sheet.id),
      preview: () => {
        const block = this.makeBlock(sheet, "preview", "");
        const { width, height } = blockGeometry(sheetPorts(sheet.content.components)).size;
        return `<svg viewBox="${-width / 2 - 6} ${-height / 2 - 6} ${width + 12} ${height + 12}" aria-hidden="true">${renderComponentSvg(block)}</svg>`;
      }
    }));
  }

  placeSheet(id: string) {
    const project = this.actions.project();
    const current = this.currentId();
    if (!project || !canReferenceSheet(project, current, id)) return;
    const sheet = project.sheets.find(candidate => candidate.id === id)!;
    const occupied = new Set(this.activeSheet()?.content.components.map(component => component.ref.toLowerCase()));
    let index = 1;
    while (occupied.has(`x${index}`)) index++;
    this.actions.arm(this.makeBlock(sheet, this.actions.id(), `X${index}`));
  }

  private makeBlock(sheet: SchematicSheet, id: string, ref: string): ComponentInstance {
    return { id, ref, type: "sheetBlock", x: 0, y: 0, rotation: 0, mirrored: false, values: blockFields(sheet) };
  }

  private currentId() { return this.actions.path().at(-1)?.sheetId ?? "top"; }
  private activeSheet() { return this.actions.project()?.sheets.find(sheet => sheet.id === this.currentId()); }

  private navigate(path: HierarchyStep[], selection?: string) {
    this.setPickingChild(false);
    this.actions.navigate(path, selection);
    this.paper?.focus({ preventScroll: true });
  }

  private enterBlock(block: ComponentInstance) {
    const sheetId = blockTarget(block);
    if (!sheetId) return;
    this.navigate([...this.actions.path(), { sheetId, instanceId: block.id }]);
  }

  private goUp() {
    const path = this.actions.path();
    if (path.length < 2) return;
    this.navigate(path.slice(0, -1), path.at(-1)?.instanceId);
  }

  private renderTree() {
    const project = this.actions.project();
    this.header.replaceChildren();
    this.sheetList.replaceChildren();
    if (!project) return;
    const path = this.actions.path(), current = this.currentId();
    const bar = this.element("div", "hierarchy-actions hierarchy-toolbar");
    bar.append(this.button("new-sheet", this.caption("newSheet", "New sheet"), () => this.openSheetDialog()),
      this.button("top", this.caption("returnTop", "Return to Top"), () => this.navigate([{ sheetId: project.topSheetId }])),
      this.button("up", this.caption("returnParent", "Return to Parent"), () => this.goUp(), path.length < 2),
      this.button("globals", this.caption("globalNets", "Global nets"), () => this.openGlobalsDialog(project)));
    const upButton = bar.querySelector("[data-hierarchy-action='up']");
    upButton?.setAttribute("aria-keyshortcuts", "Control+E");
    this.header.append(bar, this.renderPath(project, path));
    this.search.placeholder = this.caption("search", "Search sheets and instances");
    this.search.ariaLabel = this.search.placeholder;
    const query = this.search.value.trim().toLowerCase();
    for (const sheet of project.sheets) {
      const children = sheet.content.components.filter(component => !!blockTarget(component) && !component.temporarilyDeleted);
      if (query && !sheet.name.toLowerCase().includes(query) && !children.some(child => child.ref.toLowerCase().includes(query))) continue;
      const entry = this.element("details", "hierarchy-sheet");
      entry.dataset.hierarchySheet = sheet.id;
      const sheetKey = JSON.stringify([project.id, sheet.id]);
      entry.open = sheet.id === current || !!query || this.expanded.has(sheetKey);
      entry.addEventListener("toggle", () => { if (entry.open) this.expanded.add(sheetKey); else this.expanded.delete(sheetKey); });
      const heading = this.element("summary");
      heading.textContent = sheet.name + (sheet.id === project.topSheetId ? " · TOP" : "");
      heading.addEventListener("dblclick", () => this.navigate([{ sheetId: sheet.id }]));
      const actions = this.element("div", "hierarchy-actions");
      const callers = project.sheets.flatMap(parent => parent.content.components
        .filter(component => !component.temporarilyDeleted && blockTarget(component) === sheet.id)
        .map(component => ({ parent, component })));
      actions.append(
        this.button("rename", t("ui.rename", "Rename"), () => this.openSheetDialog(sheet)),
        this.button("enter", this.caption("enter", "Enter"), () => this.navigate([{ sheetId: sheet.id }])),
        this.button("place", this.caption("place", "Place"), () => this.placeSheet(sheet.id), !canReferenceSheet(project, current, sheet.id)),
        this.button("set-top", this.caption("setTop", "Set as Top"), () => this.apply(draft => { draft.topSheetId = sheet.id; }), sheet.id === project.topSheetId),
        this.button("delete", t("toolbar.delete", "Delete"), () => this.deleteSheet(sheet), sheet.id === project.topSheetId || callers.length > 0)
      );
      entry.append(heading, actions);
      const included = this.fold(sheetKey, "include-cells", this.caption("includeCells", "Include cells"), children.length, true);
      for (const block of children) {
        const target = project.sheets.find(candidate => candidate.id === blockTarget(block));
        const row = this.element("div", "hierarchy-actions");
        const label = `${block.ref} · ${target?.name ?? blockTarget(block)}`;
        const select = this.button("instance", label, () => {
          if (sheet.id !== current) this.navigate([{ sheetId: sheet.id }], block.id);
          else this.actions.focus(block.id);
        });
        select.addEventListener("dblclick", () => {
          const base = sheet.id === current ? this.actions.path() : [{ sheetId: sheet.id }];
          if (target) this.navigate([...base, { sheetId: target.id, instanceId: block.id }]);
        });
        row.append(select, this.button("enter-instance", "↳", () => {
          if (!target) return;
          const base = sheet.id === current ? this.actions.path() : [{ sheetId: sheet.id }];
          this.navigate([...base, { sheetId: target.id, instanceId: block.id }]);
        }));
        included.append(row);
      }
      const ports = sheetPorts(sheet.content.components);
      const pinList = this.fold(sheetKey, "pin-list", this.caption("pinList", "Pin list"), ports.length, true);
      ports.forEach((port, index) => {
        const row = this.element("div", "hierarchy-actions");
        const select = this.button("select-pin", port.name, () => {
          if (sheet.id !== current) this.navigate([{ sheetId: sheet.id }], port.id);
          else this.actions.focus(port.id);
        });
        select.title = `${port.type} · ${port.direction}`;
        row.append(select,
          this.button("pin-up", "↑", () => this.swapOrder(sheet.id, port.id, ports[index - 1].id), index === 0),
          this.button("pin-down", "↓", () => this.swapOrder(sheet.id, port.id, ports[index + 1].id), index === ports.length - 1));
        pinList.append(row);
      });
      const callerList = this.fold(sheetKey, "show-callers", this.caption("showCallers", "Show callers"), callers.length, false);
      for (const { parent, component } of callers) {
        const row = this.element("div", "hierarchy-actions");
        row.append(this.button("caller", `${parent.name} · ${component.ref}`,
          () => this.navigate([{ sheetId: parent.id }], component.id)));
        callerList.append(row);
      }
      entry.append(included, pinList, callerList);
      this.sheetList.append(entry);
    }
  }

  private renderPath(project: SchematicProject, path: HierarchyStep[]) {
    const row = this.element("div", "hierarchy-current-path");
    const caption = this.element("span");
    caption.textContent = this.caption("currentPath", "Current hierarchy:");
    const breadcrumb = this.element("nav", "hierarchy-breadcrumb");
    breadcrumb.ariaLabel = this.caption("path", "Sheet path");
    const list = this.element("ol");
    const labels = path.map(step => project.sheets.find(sheet => sheet.id === step.sheetId)?.name ?? step.sheetId);
    breadcrumb.title = labels.join(" / ");
    labels.forEach((label, index) => {
      const item = this.element("li");
      const button = this.button("breadcrumb", label, () => this.navigate(path.slice(0, index + 1)));
      if (index === labels.length - 1) button.setAttribute("aria-current", "page");
      item.append(button);
      list.append(item);
    });
    breadcrumb.append(list);
    row.append(caption, breadcrumb);
    return row;
  }

  private fold(sheetKey: string, name: string, label: string, count: number, defaultOpen: boolean) {
    const group = this.element("details", "hierarchy-fold");
    const key = `${sheetKey}/${name}`;
    group.dataset.hierarchySection = name;
    group.open = this.sections.get(key) ?? (defaultOpen && count > 0);
    group.addEventListener("toggle", () => this.sections.set(key, group.open));
    const heading = this.element("summary");
    heading.textContent = `${label} (${count})`;
    group.append(heading);
    return group;
  }

  private swapOrder(sheetId: string, first: string, second: string) {
    this.apply(project => {
      const components = project.sheets.find(sheet => sheet.id === sheetId)!.content.components;
      const a = components.find(component => component.id === first)!;
      const b = components.find(component => component.id === second)!;
      [a.values["port:order"], b.values["port:order"]] = [b.values["port:order"], a.values["port:order"]];
    });
  }

  private openGlobalsDialog(project: SchematicProject) {
    const input = this.element("input");
    input.type = "text";
    input.value = project.globalNets.join(", ");
    this.openDialog(this.caption("globalNets", "Global nets"),
      [this.field(this.caption("globalNetField", "Net names (comma-separated)"), input)], () => {
        const nets = ["0", ...input.value.split(",").map(name => name.trim()).filter(Boolean)];
        if (nets.some(name => name !== "0" && !PORT_IDENTIFIER.test(name))) {
          throw new Error(this.caption("identifier", "Enter a scalar name starting with a letter or underscore, up to 64 characters."));
        }
        this.apply(draft => { draft.globalNets = [...new Set(nets)]; }, true);
      });
  }

  private openSheetDialog(sheet?: SchematicSheet) {
    const name = this.nameInput(sheet?.name ?? "");
    let created: string | undefined;
    this.openDialog(sheet ? this.caption("renameSheet", "Rename sheet") : this.caption("newSheet", "New sheet"),
      [this.field(this.caption("sheetName", "Sheet name"), name)], () => {
        const value = this.identifier(name.value);
        const changed = this.apply(project => {
          if (project.sheets.some(item => item.id !== sheet?.id && item.name.toLowerCase() === value.toLowerCase())) {
            throw new Error(this.caption("duplicateSheet", "A sheet with this name already exists."));
          }
          if (sheet) project.sheets.find(item => item.id === sheet.id)!.name = value;
          else {
            created = this.actions.id();
            project.sheets.push({ id: created, name: value, content: createEmptySchematicContent() });
          }
        }, true);
        if (changed && created) this.navigate([{ sheetId: created }]);
      });
  }

  private deleteSheet(sheet: SchematicSheet) {
    this.openDialog(this.caption("deleteSheet", "Delete sheet"), [this.document.createTextNode(sheet.name)], () => {
      this.apply(project => {
        if (project.topSheetId === sheet.id || project.sheets.some(parent =>
          parent.content.components.some(component => blockTarget(component) === sheet.id))) return;
        project.sheets = project.sheets.filter(candidate => candidate.id !== sheet.id);
      }, true);
    });
  }

  private openPinDialog() {
    if (!this.activeSheet()) return;
    const { name, type, side, fields } = this.pinFields();
    type.addEventListener("change", () => {
      side.value = ({ input: "left", output: "right", supply: "top", ground: "bottom" } as Partial<Record<PortType, PortSide>>)
        [type.value as PortType] ?? "left";
    });
    this.openDialog(this.caption("placePin", "Place pin"), fields, () => {
      const ref = this.portName(name.value);
      const ports = sheetPorts(this.activeSheet()!.content.components);
      this.checkPinName(ref);
      this.actions.arm({ id: this.actions.id(), type: "sheetPort", ref, x: 0, y: 0, rotation: 0, mirrored: false,
        values: { "port:type": type.value, "port:side": side.value,
          "port:order": String(Math.max(-1, ...ports.map(port => port.order)) + 1),
          "port:slot": String(nextPortSlot(ports, side.value as PortSide)) } });
    });
  }

  private renderProperties() {
    const sheet = this.selectedId ? this.activeSheet() : undefined;
    const component = sheet?.content.components.find(item => item.id === this.selectedId);
    const port = component?.type === "sheetPort" ? readSheetPort(component) : undefined;
    this.properties.parentElement?.classList.toggle("has-hierarchy-pin", !!port);
    const signature = port ? JSON.stringify([sheet?.id, port, t("hierarchy.pinName", "Pin Name")]) : "";
    if (signature === this.propertySignature) return;
    this.propertySignature = signature;
    this.properties.replaceChildren();
    this.properties.hidden = !port;
    if (!port) return;
    const { name, type, side, fields } = this.pinFields(port);
    const edit = () => {
      if (!this.apply(project => {
        const ref = this.portName(name.value);
        this.checkPinName(ref, port.id);
        const active = project.sheets.find(item => item.id === sheet!.id)!;
        const pin = active.content.components.find(item => item.id === port.id)!;
        pin.ref = ref;
        pin.values["port:type"] = type.value;
        if (side.value !== port.direction) {
          pin.values["port:side"] = side.value;
          pin.values["port:slot"] = String(nextPortSlot(sheetPorts(active.content.components).filter(item => item.id !== port.id), side.value as PortSide));
        }
      })) { name.value = port.name; type.value = port.type; side.value = port.direction; }
    };
    name.addEventListener("change", edit);
    type.addEventListener("change", edit);
    side.addEventListener("change", edit);
    name.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); name.blur(); }
      if (event.key === "Escape") { event.preventDefault(); name.value = port.name; name.blur(); }
    });
    const controls = this.element("div", "hierarchy-actions");
    controls.append(this.button("delete-pin", this.caption("deletePin", "Delete Pin"), () => this.apply(project => {
      const { content } = project.sheets.find(item => item.id === sheet!.id)!;
      content.components = content.components.filter(item => item.id !== port.id);
      delete content.connections.pins[port.id];
    })));
    this.properties.append(...fields, controls);
  }

  private pinFields(port?: ReturnType<typeof readSheetPort>) {
    const name = this.nameInput(port?.name ?? "");
    name.maxLength = 80;
    name.placeholder = "OUT<7:0>";
    name.dataset.pinName = "";
    const type = this.selectField(PORT_TYPES, port?.type ?? "input");
    const side = this.selectField(PORT_SIDES, port?.direction ?? "left");
    type.dataset.pinType = "";
    side.dataset.pinDirection = "";
    return { name, type, side, fields: [
      this.field(this.caption("pinName", "Pin Name"), name),
      this.field(this.caption("pinType", "Type"), type),
      this.field(this.caption("direction", "Direction"), side)
    ] };
  }

  private checkPinName(name: string, except?: string) {
    const names = sheetPorts(this.activeSheet()?.content.components ?? []).filter(port => port.id !== except).map(port => port.name);
    if (!hasUniquePortNames([...names, name])) {
      throw new Error(this.caption("duplicatePin", "This pin name or a bus member already exists in this sheet."));
    }
  }

  private identifier(value: string) {
    const name = value.trim();
    if (!PORT_IDENTIFIER.test(name)) throw new Error(this.caption("identifier", "Enter a scalar name starting with a letter or underscore, up to 64 characters."));
    return name;
  }

  private portName(value: string) {
    const name = value.trim();
    if (!isPortName(name)) {
      throw new Error(this.caption("portNameFormat", "Enter a pin name like OUT, OUT<3>, or OUT<7:0> (up to 256 bits)."));
    }
    return parseBusName(name)?.name ?? name;
  }

  private apply(mutate: Parameters<HierarchyActions["change"]>[0], rethrow = false) {
    try { this.actions.change(mutate); return true; }
    catch (error) {
      if (rethrow) throw error;
      this.actions.status(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private openDialog(title: string, fields: Node[], submit: () => void) {
    if (this.dialog.open) return;
    this.dialog.ariaLabel = title;
    const form = this.element("form");
    const heading = this.element("h2");
    heading.textContent = title;
    const error = this.element("p", "property-error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    const controls = this.element("div", "hierarchy-actions");
    const confirm = this.element("button");
    confirm.type = "submit";
    confirm.textContent = this.caption("confirm", "Confirm");
    confirm.dataset.hierarchyConfirm = "";
    controls.append(confirm, this.button("cancel", t("export.cancel", "Cancel"), () => this.dialog.close()));
    form.append(heading, ...fields, error, controls);
    form.addEventListener("submit", event => {
      event.preventDefault();
      try { submit(); this.dialog.close(); }
      catch (failure) { error.textContent = failure instanceof Error ? failure.message : String(failure); error.hidden = false; }
    });
    this.dialog.replaceChildren(form);
    this.dialog.showModal();
  }

  private selectField(values: readonly string[], value: string) {
    const select = this.element("select");
    for (const choice of values) {
      const option = this.element("option");
      option.value = choice;
      option.textContent = this.caption(choice, choice === "inout" ? "InOut" : choice[0].toUpperCase() + choice.slice(1));
      select.append(option);
    }
    select.value = value;
    return select;
  }

  private nameInput(value: string) {
    const input = this.element("input");
    input.type = "text";
    input.spellcheck = false;
    input.maxLength = 64;
    input.value = value;
    return input;
  }

  private field(label: string, input: HTMLElement) {
    const element = this.element("label", "property-row");
    const name = this.element("span");
    name.textContent = label;
    element.append(name, input);
    return element;
  }

  private button(action: string, text: string, click: () => void, disabled = false) {
    const button = this.element("button");
    button.type = "button";
    button.textContent = text;
    button.dataset.hierarchyAction = action;
    button.disabled = disabled;
    button.addEventListener("click", click);
    return button;
  }

  private caption(key: string, fallback: string) { return t(`hierarchy.${key}`, fallback); }

  private element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
    const element = this.document.createElement(tag);
    if (className) element.className = className;
    return element;
  }
}
