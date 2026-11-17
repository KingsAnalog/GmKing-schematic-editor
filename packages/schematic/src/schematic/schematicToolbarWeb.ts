import deleteIcon from "./icons/delete.svg?raw";
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

function toolbarButton(
  command: string,
  label: string,
  shortcut: string,
  icon: string,
  kind: ToolbarCommandKind = "action"
) {
  const hint = shortcut ? `${label} (${shortcut})` : label;
  const pressed = kind === "action" ? "" : ` aria-pressed="false"`;
  return `<button type="button" data-command="${command}" data-command-kind="${kind}" title="${hint}" aria-label="${hint}"${pressed}>${icon}</button>`;
}

export function renderSchematicToolbar(namespace = "schematic-toolbar") {
  return [
    toolbarButton("instance", "Instance", "i", namespaceSvgIds(instanceIcon, `${namespace}-instance`), "tool"),
    toolbarButton("wire", "Wire", "w", namespaceSvgIds(wireIcon, `${namespace}-wire`), "tool"),
    toolbarButton("label", "Net Label", "L", namespaceSvgIds(labelIcon, `${namespace}-label`), "tool"),
    toolbarButton("note", "Note", "Shift+N", namespaceSvgIds(noteIcon, `${namespace}-note`)),
    toolbarButton("rotate", "Rotate", "r", namespaceSvgIds(rotateIcon, `${namespace}-rotate`)),
    toolbarButton("mirror-x", "Mirror X", "Shift+R", namespaceSvgIds(mirrorXIcon, `${namespace}-mirror-x`)),
    toolbarButton("mirror-y", "Mirror Y", "", namespaceSvgIds(mirrorYIcon, `${namespace}-mirror-y`)),
    toolbarButton("delete", "Delete", "Del", namespaceSvgIds(deleteIcon, `${namespace}-delete`)),
    toolbarButton("temp-delete", "Temporary Delete", "Shift+Del", namespaceSvgIds(tempDeleteIcon, `${namespace}-temp-delete`)),
    toolbarButton("presentation", "Presentation Mode", "", namespaceSvgIds(presentationIcon, `${namespace}-presentation`), "toggle"),
    toolbarButton("fit", "Fit", "f", namespaceSvgIds(fitIcon, `${namespace}-fit`)),
    toolbarButton("reset", "Reset", "", namespaceSvgIds(resetIcon, `${namespace}-reset`)),
    toolbarButton("undo", "Undo", "u", namespaceSvgIds(undoIcon, `${namespace}-undo`)),
    toolbarButton("redo", "Redo", "Shift+u", namespaceSvgIds(redoIcon, `${namespace}-redo`))
  ].join("");
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
