import { domUi, markupUi, type UiBuilder } from "./schematicUiElements";
import { message } from "./schematicI18n";
import { PROCESS_IDS, processProfile } from "./netlist/profiles";
import { buildSchematicToolbar } from "./schematicToolbarWeb";
import { buildAgentBanner, buildAgentDialog } from "./agent/agentDialog";
import { buildSchematicEditorSidebar, buildSymbolTemplateControl, schematicTextFontOptions } from "./schematicEditorUiProjection";
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
  const exportDialogId = `${namespace}-document-export-dialog`;
  const exportTitleId = `${namespace}-document-export-title`;
  const analysisIds = {
    inputP: `${namespace}-analysis-input-p`,
    inputN: `${namespace}-analysis-input-n`,
    outputP: `${namespace}-analysis-output-p`,
    outputN: `${namespace}-analysis-output-n`
  };
  return el("main", { class: "schematic-shell schematic-editor-root", "data-schematic-shell": true },
    buildSchematicEditorSidebar(el, namespace, { templateInOptions: true }),
    el("dialog", {
      class: "schematic-dialog schematic-options-dialog",
      id: `${namespace}-options`,
      "aria-labelledby": `${namespace}-options-title`,
      "data-schematic-options-dialog": true
    },
      el("h2", { id: `${namespace}-options-title` }, message("options.title", "Options")),
      el("div", { class: "schematic-options-fields" },
        el("label", {},
          el("span", {}, "Language"),
          el("select", { "data-schematic-language-select": true },
            el("option", { value: "en", selected: true }, message("options.english", "English")),
            el("option", { value: "zh" }, "中文")
          )
        ),
        el("label", {},
          el("span", {}, message("options.colorMode", "Color mode")),
          el("select", { "data-schematic-theme-select": true },
            el("option", { value: "system", selected: true }, message("options.system", "Follow system")),
            el("option", { value: "light" }, message("options.light", "Light")),
            el("option", { value: "dark" }, message("options.dark", "Dark"))
          )
        ),
        el("label", {},
          el("span", {}, message("options.defaultTextFont", "Default text font")),
          el("select", { "data-schematic-text-font": true }, ...schematicTextFontOptions(el))
        ),
        el("label", {},
          el("span", {}, message("ui.process", "Process")),
          el("select", { "data-netlist-process": true },
            ...PROCESS_IDS.map(id => el("option", { value: id },
              id === "custom" ? message("ui.custom", "Custom") : processProfile(id).label))
          )
        ),
        buildSymbolTemplateControl(el),
        el("label", {},
          el("span", {}, message("options.wireCrossings", "Wire crossings")),
          el("select", { "data-schematic-wire-crossings": true },
            el("option", { value: "plain" }, message("options.crossingPlain", "Plain")),
            el("option", { value: "hop" }, message("options.crossingHop", "Hop"))
          )
        ),
        el("label", {},
          el("span", {}, message("options.wireAngle", "Wire angle")),
          el("select", { "data-schematic-wire-angle": true },
            el("option", { value: "orthogonal" }, message("options.wireAngleOrthogonal", "Orthogonal")),
            el("option", { value: "diagonal45" }, message("options.wireAngle45", "45 Degree")),
            el("option", { value: "freeAngle" }, message("options.wireAngleFree", "Free"))
          )
        )
      ),
      el("button", { type: "button", "data-schematic-options-close": true }, message("options.close", "Close"))
    ),
    buildAgentDialog(ui, namespace),
    el("div", {
      class: "schematic-panel-resizer",
      role: "separator",
      "aria-label": message("ui.resizeOrRevealControlsPanel", "Resize or reveal controls panel"),
      "aria-orientation": "vertical",
      "aria-valuemin": "0",
      tabindex: "0",
      title: message("ui.dragToResizeOrCollapseControls", "Drag to resize or collapse controls"),
      "data-schematic-panel-resizer": "left"
    }),
    el("section", { class: "schematic-workspace", "aria-label": message("ui.schematicDrawingArea", "Schematic drawing area") },
      el("div", { class: "schematic-document-tabs", "aria-label": message("ui.openSchematics", "Open schematics"), "data-schematic-document-tabs": true },
        el("div", {
          class: "schematic-document-tab-list",
          role: "tablist",
          "aria-label": message("ui.schematicDocuments", "Schematic documents"),
          "data-schematic-document-tab-list": true
        }),
        el("button", {
          type: "button",
          class: "schematic-document-tab-new",
          "data-schematic-document-new": true,
          "aria-label": message("document.new", "New schematic"),
          title: message("document.new", "New schematic")
        }, "+"),
        el("button", {
          type: "button",
          class: "schematic-document-tab-action",
          "data-schematic-document-import": true,
          "aria-label": message("document.import", "Import schematic"),
          title: message("document.import", "Import schematic"),
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
          "aria-label": message("document.paste", "Paste schematic JSON from clipboard into a new tab"),
          title: message("document.paste", "Paste schematic JSON from clipboard into a new tab")
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
          "aria-label": message("export.title", "Export schematic"),
          "aria-haspopup": "dialog",
          "aria-controls": exportDialogId,
          title: message("export.title", "Export schematic")
        },
          el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
            el("path", { d: "M12 21V9" }),
            el("path", { d: "m7 14 5-5 5 5" }),
            el("path", { d: "M5 3h14" })
          )
        ),
        el("dialog", {
          class: "schematic-dialog schematic-document-export-dialog",
          id: exportDialogId,
          "aria-labelledby": exportTitleId,
          "data-schematic-document-export-dialog": true
        },
          el("h2", { id: exportTitleId }, message("export.title", "Export schematic")),
          el("label", {},
            el("input", { type: "checkbox", "data-schematic-export-hidden": true }),
            message("export.includeHidden", "Include hidden objects in images")
          ),
          el("div", { class: "schematic-document-export-formats" },
            el("button", { type: "button", "data-schematic-export-format": "json" }, message("export.json", "Schematic JSON")),
            el("button", { type: "button", "data-schematic-export-format": "project" }, message("hierarchy.projectJson", "Project JSON")),
            el("button", { type: "button", "data-schematic-export-format": "svg" }, "SVG"),
            el("button", { type: "button", "data-schematic-export-format": "png" }, "PNG")
          ),
          el("button", { type: "button", "data-schematic-export-cancel": true }, message("export.cancel", "Cancel"))
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
          el("button", { type: "button", "data-schematic-close-undo": true }, message("ui.undo", "Undo"))
        ),
        el("div", {
          class: "schematic-storage-error-notice",
          "data-schematic-storage-error": true,
          role: "alert",
          "aria-atomic": "true",
          hidden: true
        },
          el("span", { "data-schematic-storage-error-message": true }),
          el("button", { type: "button", "data-schematic-storage-retry": true }, message("ui.retrySave", "Retry save")),
          el("button", {
            type: "button",
            class: "schematic-storage-error-dismiss",
            "data-schematic-storage-error-dismiss": true,
            "aria-label": message("ui.dismissStorageError", "Dismiss storage error"),
            title: message("ui.dismiss", "Dismiss")
          })
        )
      ),
      el("div", {},
        el("div", { class: "schematic-toolbar" }, ...buildSchematicToolbar(ui, namespace)),
        buildAgentBanner(ui)
      ),
      el("div", { class: "schematic-paper", tabindex: "0", "aria-label": message("ui.schematicCanvas", "Schematic canvas"), "data-schematic-paper": true }),
      el("div", {
        class: "schematic-log-drawer",
        "data-schematic-log": true,
        "aria-label": message("log.title", "Log"),
        hidden: true
      },
        el("div", {
          class: "schematic-log-resizer",
          role: "separator",
          "aria-label": message("ui.resizeLog", "Resize log"),
          "aria-orientation": "horizontal",
          "aria-valuemin": "180",
          "aria-valuemax": "400",
          "aria-valuenow": "230",
          tabindex: "0",
          "data-log-resizer": true
        }),
        el("div", { class: "schematic-log-header" },
          el("strong", {}, message("log.title", "Log")),
          el("select", { "data-log-level": true, "aria-label": message("log.filter", "Filter") },
            el("option", { value: "all" }, message("log.all", "All")),
            el("option", { value: "info" }, message("log.info", "Info")),
            el("option", { value: "warn" }, message("log.warn", "Warn")),
            el("option", { value: "error" }, message("log.error", "Error"))
          ),
          el("input", {
            type: "search",
            "data-log-search": true,
            placeholder: message("log.search", "Search log"),
            "aria-label": message("log.search", "Search log")
          }),
          el("button", { type: "button", "data-log-copy": true }, message("log.copy", "Copy")),
          el("button", { type: "button", "data-log-clear": true }, message("log.clear", "Clear")),
          el("button", {
            type: "button",
            class: "schematic-log-close",
            "data-log-close": true,
            "aria-label": message("ui.closeLog", "Close log")
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
        }, message("ui.selectAToolOrPressIToAddAnInstance", "Select a tool or press i to add an instance.")),
        el("div", { class: "schematic-status-actions" },
          el("span", { class: "schematic-status-count", "data-diagnostic-count": true, hidden: true }),
          el("button", {
            type: "button",
            class: "schematic-status-log",
            "data-log-toggle": true,
            "aria-expanded": "false",
            title: message("log.title", "Log")
          }, message("status.log", "Log"))
        )
      )
    ),
    el("div", {
      class: "schematic-panel-resizer",
      role: "separator",
      "aria-label": message("ui.resizeOrRevealAnalysisPanel", "Resize or reveal analysis panel"),
      "aria-orientation": "vertical",
      "aria-valuemin": "0",
      tabindex: "0",
      title: message("ui.dragToResizeOrCollapseAnalysis", "Drag to resize or collapse analysis"),
      "data-schematic-panel-resizer": "right"
    }),
    el("aside", {
      class: "analysis-panel right-dock",
      "aria-label": message("ui.schematicInspector", "Schematic inspector"),
      "data-schematic-analysis-panel": true,
      "data-right-dock": true
    },
      el("div", { class: "schematic-sidebar-tabs right-dock-tabs", role: "tablist", "aria-label": message("ui.inspectorViews", "Inspector views") },
        el("button", { type: "button", class: "schematic-sidebar-tab", role: "tab",
          "data-right-view": "hierarchy", "aria-selected": "false", tabindex: "-1"
        }, message("right.hierarchy", "Hierarchy")),
        el("button", {
          type: "button",
          class: "schematic-sidebar-tab is-active",
          role: "tab",
          "data-right-view": "analysis",
          "aria-selected": "true"
        }, message("right.analysis", "Analysis")),
        el("button", {
          type: "button",
          class: "schematic-sidebar-tab",
          role: "tab",
          "data-right-view": "netlist",
          "aria-selected": "false",
          tabindex: "-1"
        }, message("right.netlist", "Netlist"))
      ),
      el("section", { class: "right-dock-panel", "data-right-panel": "hierarchy", role: "tabpanel", hidden: true }),
      el("section", { class: "right-dock-panel", "data-right-panel": "analysis", role: "tabpanel" },
        el("p", { class: "analysis-note" }, message("ui.usesComponentValuesFromThePropertyEditor", "Uses component values from the Property Editor.")),
        el("div", { "data-selection-summary": true, class: "selection-summary" }, message("ui.noObjectSelected", "No object selected.")),
        el("div", { class: "net-pick-row" },
          el("label", { for: analysisIds.inputP }, message("ui.inputPositive", "Input +")),
          el("select", { id: analysisIds.inputP, "data-net-select": "inputP" }),
          el("button", { type: "button", "data-pick-net": "inputP" }, message("ui.pick", "Pick"))
        ),
        el("div", { class: "net-pick-row" },
          el("label", { for: analysisIds.inputN }, message("ui.inputNegative", "Input -")),
          el("select", { id: analysisIds.inputN, "data-net-select": "inputN" }),
          el("button", { type: "button", "data-pick-net": "inputN" }, message("ui.pick", "Pick"))
        ),
        el("div", { class: "net-pick-row" },
          el("label", { for: analysisIds.outputP }, message("ui.outputPositive", "Output +")),
          el("select", { id: analysisIds.outputP, "data-net-select": "outputP" }),
          el("button", { type: "button", "data-pick-net": "outputP" }, message("ui.pick", "Pick"))
        ),
        el("div", { class: "net-pick-row" },
          el("label", { for: analysisIds.outputN }, message("ui.outputNegative", "Output -")),
          el("select", { id: analysisIds.outputN, "data-net-select": "outputN" }),
          el("button", { type: "button", "data-pick-net": "outputN" }, message("ui.pick", "Pick"))
        ),
        el("div", { class: "analysis-actions" },
          el("button", { type: "button", "data-analysis": "compute" },
            message("ui.computeFormula", "Compute H(s), Z"),
            el("sub", {}, "IN"),
            message("ui.formulaSeparator", "(s), Z"),
            el("sub", {}, "out"),
            "(s)"
          )
        ),
        el("div", {
          class: "analysis-progress",
          "data-analysis-progress": true,
          hidden: true,
          role: "progressbar",
          "aria-label": message("ui.symbolicAnalysisProgress", "Symbolic analysis progress")
        },
          el("div", { class: "analysis-progress-bar" }),
          el("span", { "data-analysis-progress-text": true }, message("ui.solvingSymbolicMna", "Solving symbolic MNA..."))
        ),
        el("div", { "data-analysis-diagnostics": true, class: "analysis-diagnostics" }),
        el("div", { class: "analysis-results" },
          el("h3", {}, message("ui.transferFunction", "Transfer Function")),
          el("output", { "data-analysis-transfer": true }),
          el("h3", {}, message("ui.inputImpedance", "Input Impedance")),
          el("output", { "data-analysis-zin": true }),
          el("h3", {}, message("ui.outputImpedance", "Output Impedance")),
          el("output", { "data-analysis-zout": true })
        )
      ),
      el("section", { class: "right-dock-panel netlist-panel", "data-right-panel": "netlist", role: "tabpanel", hidden: true },
        el("div", { class: "netlist-toolbar" },
          el("div", { class: "netlist-format", role: "group", "aria-label": message("ui.netlistFormat", "Netlist format") },
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
          el("button", { type: "button", "data-netlist-copy": true }, message("ui.copy", "Copy")),
          el("button", { type: "button", "data-netlist-download": true }, message("ui.download", "Download"))
        ),
        el("section", { class: "netlist-pane" },
          el("div", { class: "netlist-status", "data-netlist-status": true }, message("ui.ready", "Ready")),
          el("pre", { class: "netlist-code", "data-netlist-code": true })
        ),
        el("section", { class: "netlist-pane" },
          el("div", { class: "netlist-diagnostics-head", "data-netlist-diagnostics-summary": true }, message("ui.noDiagnostics", "No diagnostics.")),
          el("div", { class: "netlist-diagnostics", "data-netlist-diagnostics-list": true })
        )
      )
    ),
    el("button", {
      type: "button",
      class: "schematic-panel-backdrop",
      "aria-label": message("ui.closeSidePanel", "Close side panel"),
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
