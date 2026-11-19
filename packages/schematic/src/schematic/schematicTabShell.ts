import { domUi, markupUi, type UiBuilder } from "./schematicUiElements";
import { t } from "./schematicI18n";
import { buildSchematicToolbar } from "./schematicToolbarWeb";
import { buildSchematicEditorSidebar } from "./schematicEditorUiProjection";
export {
  SCHEMATIC_NETWORK_COLOR_PRESETS,
  SCHEMATIC_SYMBOL_COLOR_PRESETS
} from "./schematicEditorUiProjection";
import type { SchematicEditorMountElements } from "./editorHandle";

export type { SchematicEditorMountElements } from "./editorHandle";

let nextShellNamespace = 1;

export function renderSchematicTabShell(): string {
  return buildTabShell(markupUi).html;
}

export function mountSchematicTab(root: HTMLElement) {
  root.replaceChildren(buildTabShell(domUi(root.ownerDocument)));
}

function buildTabShell<T extends object>(ui: UiBuilder<T>) {
  const { el } = ui;
  const namespace = `schematic-shell-${nextShellNamespace++}`;
  const importInputId = `${namespace}-document-import-input`;
  const analysisIds = {
    inputP: `${namespace}-analysis-input-p`,
    inputN: `${namespace}-analysis-input-n`,
    outputP: `${namespace}-analysis-output-p`,
    outputN: `${namespace}-analysis-output-n`
  };
  return el("main", { class: "schematic-shell schematic-editor-root", "data-schematic-shell": true },
    buildSchematicEditorSidebar(el, namespace),
    el("div", {
      class: "schematic-panel-resizer",
      role: "separator",
      "aria-label": "Resize or reveal controls panel",
      "aria-orientation": "vertical",
      "aria-valuemin": "0",
      tabindex: "0",
      title: "Drag to resize or collapse controls",
      "data-schematic-panel-resizer": "left"
    }),
    el("section", { class: "schematic-workspace", "aria-label": "Schematic drawing area" },
      el("div", { class: "schematic-document-tabs", "aria-label": "Open schematics", "data-schematic-document-tabs": true },
        el("div", {
          class: "schematic-document-tab-list",
          role: "tablist",
          "aria-label": "Schematic documents",
          "data-schematic-document-tab-list": true
        }),
        el("button", {
          type: "button",
          class: "schematic-document-tab-new",
          "data-schematic-document-new": true,
          "aria-label": "New schematic",
          title: "New schematic"
        }, "+"),
        el("button", {
          type: "button",
          class: "schematic-document-tab-action",
          "data-schematic-document-import": true,
          "aria-label": "Import schematic",
          title: "Import schematic",
          "aria-controls": importInputId
        },
          el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
            el("path", { d: "M12 3v12" }),
            el("path", { d: "m7 10 5 5 5-5" }),
            el("path", { d: "M5 21h14" })
          )
        ),
        el("button", {
          type: "button",
          class: "schematic-document-tab-action",
          "data-schematic-document-paste": true,
          "aria-label": "Paste schematic JSON from clipboard",
          title: "Paste schematic JSON from clipboard"
        },
          el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
            el("path", { d: "M9 5h6" }),
            el("path", { d: "M9 3h6v4H9z" }),
            el("path", { d: "M7 5H5v16h14V5h-2" }),
            el("path", { d: "M12 10v7" }),
            el("path", { d: "m9 14 3 3 3-3" })
          )
        ),
        el("button", {
          type: "button",
          class: "schematic-document-tab-action",
          "data-schematic-document-export": true,
          "aria-label": "Export schematic",
          title: "Export schematic"
        },
          el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
            el("path", { d: "M12 21V9" }),
            el("path", { d: "m7 14 5-5 5 5" }),
            el("path", { d: "M5 3h14" })
          )
        ),
        el("input", {
          id: importInputId,
          type: "file",
          accept: ".json,application/json",
          "data-schematic-document-import-input": true,
          hidden: true
        }),
        el("div", {
          class: "schematic-close-snackbar",
          "data-schematic-close-snackbar": true,
          role: "status",
          "aria-live": "polite",
          "aria-atomic": "true",
          hidden: true
        },
          el("span", { "data-schematic-close-message": true }),
          el("button", { type: "button", "data-schematic-close-undo": true }, "Undo")
        ),
        el("div", {
          class: "schematic-storage-error-notice",
          "data-schematic-storage-error": true,
          role: "alert",
          "aria-atomic": "true",
          hidden: true
        },
          el("span", { "data-schematic-storage-error-message": true }),
          el("button", { type: "button", "data-schematic-storage-retry": true }, "Retry save"),
          el("button", {
            type: "button",
            class: "schematic-storage-error-dismiss",
            "data-schematic-storage-error-dismiss": true,
            "aria-label": "Dismiss storage error",
            title: "Dismiss"
          })
        )
      ),
      el("div", { class: "schematic-toolbar" }, ...buildSchematicToolbar(ui, namespace)),
      el("div", { class: "shape-picker", "data-shape-picker": true, hidden: true, role: "menu", "aria-label": "Draw shape" },
        el("button", { type: "button", "data-shape-tool": "rectangle" }, "Rectangle"),
        el("button", { type: "button", "data-shape-tool": "triangle" }, "Triangle"),
        el("button", { type: "button", "data-shape-tool": "ellipse" }, "Ellipse"),
        el("button", { type: "button", "data-shape-tool": "line" }, "Line"),
        el("button", { type: "button", "data-shape-tool": "polyline" }, "Polyline"),
        el("button", { type: "button", "data-shape-tool": "polygon" }, "Polygon"),
        el("button", { type: "button", "data-shape-tool": "circle" }, "Circle"),
        el("button", { type: "button", "data-shape-tool": "arc" }, "Arc")
      ),
      el("div", { class: "schematic-paper", tabindex: "0", "aria-label": "Schematic canvas", "data-schematic-paper": true }),
      el("div", {
        class: "schematic-log-drawer",
        "data-schematic-log": true,
        "aria-label": t("log.title", "Log"),
        hidden: true
      },
        el("div", {
          class: "schematic-log-resizer",
          role: "separator",
          "aria-label": "Resize log",
          "aria-orientation": "horizontal",
          "aria-valuemin": "180",
          "aria-valuemax": "400",
          "aria-valuenow": "230",
          tabindex: "0",
          "data-log-resizer": true
        }),
        el("div", { class: "schematic-log-header" },
          el("strong", {}, t("log.title", "Log")),
          el("select", { "data-log-level": true, "aria-label": t("log.filter", "Filter") },
            el("option", { value: "all" }, t("log.all", "All")),
            el("option", { value: "info" }, t("log.info", "Info")),
            el("option", { value: "warn" }, t("log.warn", "Warn")),
            el("option", { value: "error" }, t("log.error", "Error"))
          ),
          el("input", {
            type: "search",
            "data-log-search": true,
            placeholder: t("log.search", "Search log"),
            "aria-label": t("log.search", "Search log")
          }),
          el("button", { type: "button", "data-log-copy": true }, t("log.copy", "Copy")),
          el("button", { type: "button", "data-log-clear": true }, t("log.clear", "Clear")),
          el("button", {
            type: "button",
            class: "schematic-log-close",
            "data-log-close": true,
            "aria-label": "Close log"
          }, "×")
        ),
        el("div", {
          class: "schematic-log-list",
          "data-log-list": true,
          role: "log",
          "aria-live": "polite"
        })
      ),
      el("div", { class: "schematic-statusbar" },
        el("div", {
          class: "schematic-status",
          "aria-live": "polite",
          "data-schematic-status": true
        }, "Select a tool or press i to add an instance."),
        el("div", { class: "schematic-status-actions" },
          el("span", { class: "schematic-status-count", "data-diagnostic-count": true, hidden: true }),
          el("button", {
            type: "button",
            class: "schematic-status-log",
            "data-log-toggle": true,
            "aria-expanded": "false",
            title: t("log.title", "Log")
          }, t("status.log", "Log"))
        )
      )
    ),
    el("div", {
      class: "schematic-panel-resizer",
      role: "separator",
      "aria-label": "Resize or reveal analysis panel",
      "aria-orientation": "vertical",
      "aria-valuemin": "0",
      tabindex: "0",
      title: "Drag to resize or collapse analysis",
      "data-schematic-panel-resizer": "right"
    }),
    el("aside", {
      class: "analysis-panel right-dock",
      "aria-label": "Schematic inspector",
      "data-schematic-analysis-panel": true,
      "data-right-dock": true
    },
      el("div", { class: "schematic-sidebar-tabs right-dock-tabs", role: "tablist", "aria-label": "Inspector views" },
        el("button", {
          type: "button",
          class: "schematic-sidebar-tab is-active",
          role: "tab",
          "data-right-view": "analysis",
          "aria-selected": "true"
        }, t("right.analysis", "Analysis")),
        el("button", {
          type: "button",
          class: "schematic-sidebar-tab",
          role: "tab",
          "data-right-view": "netlist",
          "aria-selected": "false",
          tabindex: "-1"
        }, t("right.netlist", "Netlist"))
      ),
      el("section", { class: "right-dock-panel", "data-right-panel": "analysis", role: "tabpanel" },
        el("p", { class: "analysis-note" }, "Uses component values from the Property Editor."),
        el("div", { "data-selection-summary": true, class: "selection-summary" }, "No object selected."),
        el("div", { class: "net-pick-row" },
          el("label", { for: analysisIds.inputP }, "Input +"),
          el("select", { id: analysisIds.inputP, "data-net-select": "inputP" }),
          el("button", { type: "button", "data-pick-net": "inputP" }, "Pick")
        ),
        el("div", { class: "net-pick-row" },
          el("label", { for: analysisIds.inputN }, "Input -"),
          el("select", { id: analysisIds.inputN, "data-net-select": "inputN" }),
          el("button", { type: "button", "data-pick-net": "inputN" }, "Pick")
        ),
        el("div", { class: "net-pick-row" },
          el("label", { for: analysisIds.outputP }, "Output +"),
          el("select", { id: analysisIds.outputP, "data-net-select": "outputP" }),
          el("button", { type: "button", "data-pick-net": "outputP" }, "Pick")
        ),
        el("div", { class: "net-pick-row" },
          el("label", { for: analysisIds.outputN }, "Output -"),
          el("select", { id: analysisIds.outputN, "data-net-select": "outputN" }),
          el("button", { type: "button", "data-pick-net": "outputN" }, "Pick")
        ),
        el("div", { class: "analysis-actions" },
          el("button", { type: "button", "data-analysis": "compute" },
            "Compute H(s), Z",
            el("sub", {}, "IN"),
            "(s), Z",
            el("sub", {}, "out"),
            "(s)"
          )
        ),
        el("div", {
          class: "analysis-progress",
          "data-analysis-progress": true,
          hidden: true,
          role: "progressbar",
          "aria-label": "Symbolic analysis progress"
        },
          el("div", { class: "analysis-progress-bar" }),
          el("span", { "data-analysis-progress-text": true }, "Solving symbolic MNA...")
        ),
        el("div", { "data-analysis-diagnostics": true, class: "analysis-diagnostics" }),
        el("div", { class: "analysis-results" },
          el("h3", {}, "Transfer Function"),
          el("output", { "data-analysis-transfer": true }),
          el("h3", {}, "Input Impedance"),
          el("output", { "data-analysis-zin": true }),
          el("h3", {}, "Output Impedance"),
          el("output", { "data-analysis-zout": true })
        )
      ),
      el("section", { class: "right-dock-panel netlist-panel", "data-right-panel": "netlist", role: "tabpanel", hidden: true },
        el("div", { class: "netlist-toolbar" },
          el("div", { class: "netlist-format", role: "group", "aria-label": "Netlist format" },
            el("button", {
              type: "button",
              class: "netlist-format-button is-active",
              "data-netlist-format": "spice",
              "aria-pressed": "true"
            }, "SPICE"),
            el("button", {
              type: "button",
              class: "netlist-format-button",
              "data-netlist-format": "spectre",
              "aria-pressed": "false"
            }, "Spectre")
          ),
          el("button", { type: "button", "data-netlist-copy": true }, "Copy"),
          el("button", { type: "button", "data-netlist-download": true }, "Download")
        ),
        el("div", { class: "netlist-config" },
          el("label", { class: "netlist-config-row" },
            el("span", {}, "Process"),
            el("select", { "data-netlist-process": true, "aria-label": "Process" },
              el("option", { value: "sky130" }, "SkyWater SKY130"),
              el("option", { value: "gf180mcu" }, "GF180MCU"),
              el("option", { value: "ihp-sg13g2" }, "IHP SG13G2"),
              el("option", { value: "custom" }, "Custom")
            )
          ),
          el("div", { class: "netlist-device-grid", "data-netlist-devices": true })
        ),
        el("div", { class: "netlist-status", "data-netlist-status": true }, "Ready"),
        el("pre", { class: "netlist-code", "data-netlist-code": true }),
        el("div", { class: "netlist-diagnostics-head", "data-netlist-diagnostics-summary": true }, "No diagnostics."),
        el("div", { class: "netlist-diagnostics", "data-netlist-diagnostics-list": true })
      )
    ),
    el("button", {
      type: "button",
      class: "schematic-panel-backdrop",
      "aria-label": "Close side panel",
      "data-schematic-panel-backdrop": true,
      hidden: true
    })
  );
}

export function querySchematicEditorMountElements(root: HTMLElement): SchematicEditorMountElements | null {
  const shellEl = root.querySelector<HTMLElement>("[data-schematic-shell]");
  const documentTabsEl = root.querySelector<HTMLElement>("[data-schematic-document-tabs]");
  const paperEl = root.querySelector<HTMLElement>("[data-schematic-paper]");
  const paletteEl = root.querySelector<HTMLElement>("[data-schematic-palette]");
  const propertyEl = root.querySelector<HTMLElement>("[data-schematic-property-editor]");
  const statusEl = root.querySelector<HTMLElement>("[data-schematic-status]");
  const analysisEl = root.querySelector<HTMLElement>("[data-schematic-analysis-panel]");
  const selectionSummaryEl = root.querySelector<HTMLElement>("[data-selection-summary]") ?? undefined;
  if (!shellEl || !documentTabsEl || !paperEl || !paletteEl || !propertyEl || !statusEl || !analysisEl) return null;
  return {
    shellEl,
    documentTabsEl,
    paperEl,
    paletteEl,
    propertyEl,
    statusEl,
    analysisEl,
    selectionSummaryEl
  };
}
