import type { UiBuilder } from "./schematicUiElements";
import { message } from "./schematicI18n";
import analysisIcon from "./icons/analysis.svg?raw";
import deleteIcon from "./icons/delete.svg?raw";
import libraryIcon from "./icons/library.svg?raw";
import netlistIcon from "./icons/netlist.svg?raw";
import fitIcon from "./icons/fit.svg?raw";
import instanceIcon from "./icons/instance.svg?raw";
import labelIcon from "./icons/label.svg?raw";
import leftRightMirrorIcon from "./icons/mirror-x.svg?raw";
import upDownMirrorIcon from "./icons/mirror-y.svg?raw";
import noteIcon from "./icons/note.svg?raw";
import presentationIcon from "./icons/presentation.svg?raw";
import redoIcon from "./icons/redo.svg?raw";
import resetIcon from "./icons/reset.svg?raw";
import rotateIcon from "./icons/rotate.svg?raw";
import tempDeleteIcon from "./icons/temp-delete.svg?raw";
import undoIcon from "./icons/undo.svg?raw";
import wireIcon from "./icons/wire.svg?raw";
import optionsIcon from "./icons/options.svg?raw";
import helpIcon from "./icons/help.svg?raw";

type ToolbarCommandKind = "tool" | "toggle" | "action";

function toolbarButton<T extends object>(
  ui: UiBuilder<T>,
  command: string,
  label: string,
  shortcut: string,
  icon: string,
  kind: ToolbarCommandKind = "action"
) {
  const hint = { ...message(`toolbar.${command}`, label), suffix: shortcut ? ` (${shortcut})` : "" };
  return ui.el("button", {
    type: "button", "data-command": command, "data-command-kind": kind, title: hint, "aria-label": hint,
    "aria-pressed": kind === "action" ? false : "false"
  }, ui.toolbarIcon(icon));
}

export function buildSchematicToolbar<T extends object>(ui: UiBuilder<T>, namespace: string) {
  return [
    ui.el("button", {
      type: "button", "data-schematic-open-options": true, "aria-haspopup": "dialog",
      "aria-controls": `${namespace}-options`,
      title: message("options.title", "Options"), "aria-label": message("options.title", "Options")
    }, ui.toolbarIcon(optionsIcon)),
    toolbarButton(ui, "library", "Library", "", namespaceSvgIds(libraryIcon, `${namespace}-library`)),
    toolbarButton(ui, "instance", "Instance", "i", namespaceSvgIds(instanceIcon, `${namespace}-instance`), "tool"),
    toolbarButton(ui, "wire", "Wire", "w", namespaceSvgIds(wireIcon, `${namespace}-wire`), "tool"),
    toolbarButton(ui, "label", "Net Label", "L", namespaceSvgIds(labelIcon, `${namespace}-label`), "tool"),
    toolbarButton(ui, "note", "Note", "Shift+N", namespaceSvgIds(noteIcon, `${namespace}-note`)),
    toolbarButton(ui, "rotate", "Rotate", "r", namespaceSvgIds(rotateIcon, `${namespace}-rotate`)),
    toolbarButton(ui, "mirror-x", "Mirror X", "Ctrl+R", namespaceSvgIds(upDownMirrorIcon, `${namespace}-mirror-x`)),
    toolbarButton(ui, "mirror-y", "Mirror Y", "Shift+R", namespaceSvgIds(leftRightMirrorIcon, `${namespace}-mirror-y`)),
    toolbarButton(ui, "delete", "Delete", "Del", namespaceSvgIds(deleteIcon, `${namespace}-delete`)),
    toolbarButton(ui, "temp-delete", "Temporary Delete", "Shift+Del", namespaceSvgIds(tempDeleteIcon, `${namespace}-temp-delete`)),
    toolbarButton(ui, "presentation", "Presentation Mode", "", namespaceSvgIds(presentationIcon, `${namespace}-presentation`), "toggle"),
    toolbarButton(ui, "fit", "Fit", "f", namespaceSvgIds(fitIcon, `${namespace}-fit`)),
    toolbarButton(ui, "reset", "Reset", "", namespaceSvgIds(resetIcon, `${namespace}-reset`)),
    toolbarButton(ui, "undo", "Undo", "u", namespaceSvgIds(undoIcon, `${namespace}-undo`)),
    toolbarButton(ui, "redo", "Redo", "Shift+u", namespaceSvgIds(redoIcon, `${namespace}-redo`)),
    toolbarButton(ui, "analysis", "Analysis", "", namespaceSvgIds(analysisIcon, `${namespace}-analysis`)),
    toolbarButton(ui, "netlist", "Netlist", "", namespaceSvgIds(netlistIcon, `${namespace}-netlist`)),
    ui.el("a", {
      class: "schematic-toolbar-help", href: "./manual.html", target: "_blank", rel: "noopener",
      "data-schematic-help": true, title: message("toolbar.help", "Help (opens in a new tab)"),
      "aria-label": message("toolbar.help", "Help (opens in a new tab)")
    }, ui.toolbarIcon(helpIcon))
  ];
}

function namespaceSvgIds(svg: string, namespace: string) {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  return ids.reduce((source, id) => {
    const nextId = `${namespace}-${id}`.replace(/[^A-Za-z0-9_-]/g, "_");
    return source
      .replaceAll(`id="${id}"`, `id="${nextId}"`)
      .replaceAll(`url(#${id})`, `url(#${nextId})`)
      .replaceAll(`href="#${id}"`, `href="#${nextId}"`);
  }, svg);
}
