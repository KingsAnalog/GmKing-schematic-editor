import type { UiBuilder } from "./schematicUiElements";
import { t } from "./schematicI18n";
import analysisIcon from "./icons/analysis.svg?raw";
import checkIcon from "./icons/check.svg?raw";
import deleteIcon from "./icons/delete.svg?raw";
import libraryIcon from "./icons/library.svg?raw";
import logIcon from "./icons/log.svg?raw";
import netlistIcon from "./icons/netlist.svg?raw";
import fitIcon from "./icons/fit.svg?raw";
import instanceIcon from "./icons/instance.svg?raw";
import labelIcon from "./icons/label.svg?raw";
import mirrorXIcon from "./icons/mirror-x.svg?raw";
import mirrorYIcon from "./icons/mirror-y.svg?raw";
import noteIcon from "./icons/note.svg?raw";
import presentationIcon from "./icons/presentation.svg?raw";
import redoIcon from "./icons/redo.svg?raw";
import resetIcon from "./icons/reset.svg?raw";
import rotateIcon from "./icons/rotate.svg?raw";
import tempDeleteIcon from "./icons/temp-delete.svg?raw";
import undoIcon from "./icons/undo.svg?raw";
import wireIcon from "./icons/wire.svg?raw";

type ToolbarCommandKind = "tool" | "toggle" | "action";

function toolbarButton<T extends object>(
  ui: UiBuilder<T>,
  command: string,
  label: string,
  shortcut: string,
  icon: string,
  kind: ToolbarCommandKind = "action"
) {
  const hint = shortcut ? `${label} (${shortcut})` : label;
  return ui.el("button", {
    type: "button", "data-command": command, "data-command-kind": kind, title: hint, "aria-label": hint,
    "aria-pressed": kind === "action" ? false : "false"
  }, ui.toolbarIcon(icon));
}

export function buildSchematicToolbar<T extends object>(ui: UiBuilder<T>, namespace: string) {
  return [
    toolbarButton(ui, "library", t("toolbar.library", "Library"), "", namespaceSvgIds(libraryIcon, `${namespace}-library`)),
    toolbarButton(ui, "instance", "Instance", "i", namespaceSvgIds(instanceIcon, `${namespace}-instance`), "tool"),
    toolbarButton(ui, "wire", "Wire", "w", namespaceSvgIds(wireIcon, `${namespace}-wire`), "tool"),
    toolbarButton(ui, "label", "Net Label", "L", namespaceSvgIds(labelIcon, `${namespace}-label`), "tool"),
    toolbarButton(ui, "note", "Note", "Shift+N", namespaceSvgIds(noteIcon, `${namespace}-note`)),
    toolbarButton(ui, "rotate", "Rotate", "r", namespaceSvgIds(rotateIcon, `${namespace}-rotate`)),
    toolbarButton(ui, "mirror-x", "Mirror X", "Shift+R", namespaceSvgIds(mirrorXIcon, `${namespace}-mirror-x`)),
    toolbarButton(ui, "mirror-y", "Mirror Y", "", namespaceSvgIds(mirrorYIcon, `${namespace}-mirror-y`)),
    toolbarButton(ui, "delete", "Delete", "Del", namespaceSvgIds(deleteIcon, `${namespace}-delete`)),
    toolbarButton(ui, "temp-delete", "Temporary Delete", "Shift+Del", namespaceSvgIds(tempDeleteIcon, `${namespace}-temp-delete`)),
    toolbarButton(ui, "presentation", "Presentation Mode", "", namespaceSvgIds(presentationIcon, `${namespace}-presentation`), "toggle"),
    toolbarButton(ui, "fit", "Fit", "f", namespaceSvgIds(fitIcon, `${namespace}-fit`)),
    toolbarButton(ui, "reset", "Reset", "", namespaceSvgIds(resetIcon, `${namespace}-reset`)),
    toolbarButton(ui, "undo", "Undo", "u", namespaceSvgIds(undoIcon, `${namespace}-undo`)),
    toolbarButton(ui, "redo", "Redo", "Shift+u", namespaceSvgIds(redoIcon, `${namespace}-redo`)),
    toolbarButton(ui, "analysis", t("toolbar.analysis", "Analysis"), "", namespaceSvgIds(analysisIcon, `${namespace}-analysis`)),
    toolbarButton(ui, "netlist", t("toolbar.netlist", "Netlist"), "", namespaceSvgIds(netlistIcon, `${namespace}-netlist`)),
    toolbarButton(ui, "diagnostics", t("toolbar.check", "Check"), "", namespaceSvgIds(checkIcon, `${namespace}-check`)),
    toolbarButton(ui, "log", t("toolbar.log", "Log"), "", namespaceSvgIds(logIcon, `${namespace}-log`))
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
