import { markupUi, type UiBuilder } from "./schematicUiElements";
import { t } from "./schematicI18n";
import { DFF_SETTING_OPTIONS, type DffSettingProperty } from "./dffModel";
import { FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS } from "./functionBlockModel";
import { DEFAULT_COMPONENT_COLOR } from "./componentPropertyModel";
import { MAX_NOTE_FONT_SIZE_PX, MIN_NOTE_FONT_SIZE_PX } from "./notes/noteSizing";
import { NOTE_WIDTH_INPUT_MAX, NOTE_WIDTH_INPUT_MIN } from "./notes/noteProperties";
import { PAPER_COLOR_PRESETS, NOTE_BACKGROUND_COLOR_PRESETS } from "../shared/color";
import { SYMBOL_TEMPLATES } from "./symbolTemplateModel";
import { SCHEMATIC_LAYERS, type SchematicLayerId } from "./layers";

const SCHEMATIC_COLOR_PRESETS = PAPER_COLOR_PRESETS.filter((preset) => preset.color !== DEFAULT_COMPONENT_COLOR);

export const SCHEMATIC_SYMBOL_COLOR_PRESETS = SCHEMATIC_COLOR_PRESETS;
export const SCHEMATIC_NETWORK_COLOR_PRESETS = SCHEMATIC_COLOR_PRESETS;

export function renderSchematicEditorSidebarProjection() {
  return buildSchematicEditorSidebar(markupUi.el).html;
}

export function buildSchematicEditorSidebar<T extends object>(
  el: UiBuilder<T>["el"],
  namespace = "schematic-sidebar"
) {
  const libraryPanelId = `${namespace}-library`;
  const propertiesPanelId = `${namespace}-properties`;
  const layersPanelId = `${namespace}-layers`;
  return el("aside", { class: "schematic-palette", "aria-label": "Schematic controls", "data-schematic-palette": true },
    el("section", { class: "symbol-template-panel", "aria-label": "Schematic symbol template" },
      el("label", { class: "symbol-template-control" },
        el("span", {}, "Symbol template"),
        el("select", { "data-symbol-template": true, "aria-label": "Symbol template", title: "Symbol template for this schematic" },
          ...SYMBOL_TEMPLATES.map(template =>
            el("option", { value: template.id, disabled: !template.available },
              `${template.label}${template.available ? "" : " (not ready)"}`
            )
          )
        )
      ),
      el("div", { class: "property-error", "data-symbol-template-error": true, role: "status", hidden: true })
    ),
    el("div", { class: "schematic-sidebar-tabs", role: "tablist", "aria-label": "Schematic sidebar" },
      el("button", {
        type: "button",
        class: "schematic-sidebar-tab is-active",
        role: "tab",
        "data-sidebar-tab": "library",
        "aria-selected": "true",
        "aria-controls": libraryPanelId
      }, t("sidebar.library", "Library")),
      el("button", {
        type: "button",
        class: "schematic-sidebar-tab",
        role: "tab",
        "data-sidebar-tab": "properties",
        "aria-selected": "false",
        "aria-controls": propertiesPanelId,
        tabindex: "-1"
      }, t("sidebar.properties", "Properties")),
      el("button", {
        type: "button",
        class: "schematic-sidebar-tab",
        role: "tab",
        "data-sidebar-tab": "layers",
        "aria-selected": "false",
        "aria-controls": layersPanelId,
        tabindex: "-1"
      }, t("sidebar.layers", "Layers"))
    ),
    el("section", {
      id: libraryPanelId,
      class: "schematic-sidebar-panel",
      "data-sidebar-panel": "library",
      role: "tabpanel",
      "aria-label": t("sidebar.library", "Library")
    },
      el("div", { class: "palette-title" },
        el("div", { class: "palette-title-copy" },
          el("strong", {}, t("sidebar.cells", "Cells")),
          el("span", {}, "i opens the browser; Esc cancels")
        )
      ),
      el("label", { class: "library-picker" },
        el("span", {}, t("sidebar.libraryLabel", "Library")),
        el("select", {
          class: "library-select",
          "data-library-select": true,
          "aria-label": t("sidebar.libraryLabel", "Library")
        })
      ),
      el("div", { class: "library-cell-list", "data-library-cells": true }),
      el("div", { class: "palette-grid", "data-palette-items": true, hidden: true })
    ),
    el("section", {
      id: propertiesPanelId,
      class: "schematic-sidebar-panel",
      "data-sidebar-panel": "properties",
      role: "tabpanel",
      "aria-label": t("sidebar.properties", "Properties"),
      hidden: true
    },
      el("section", { class: "property-editor", "aria-label": "Property Editor", "data-schematic-property-editor": true },
        el("h2", {}, "Property Editor"),
        el("div", { class: "property-empty", "data-property-empty": true }, "No object selected."),
        netProperties(el),
        labelToolProperties(el),
        componentProperties(el),
        couplingProperties(el),
        noteProperties(el)
      )
    ),
    el("section", {
      id: layersPanelId,
      class: "schematic-sidebar-panel",
      "data-sidebar-panel": "layers",
      role: "tabpanel",
      "aria-label": t("sidebar.layers", "Layers"),
      hidden: true
    },
      el("div", { class: "palette-title" },
        el("div", { class: "palette-title-copy" },
          el("strong", {}, t("sidebar.layers", "Layers")),
          el("span", {}, "Visibility only; netlist is unchanged.")
        )
      ),
      el("div", { class: "layer-list", "data-layer-list": true },
        ...SCHEMATIC_LAYERS.map(layer => layerToggle(el, layer.id, layer.label))
      )
    )
  );
}

function layerToggle<T extends object>(
  el: UiBuilder<T>["el"],
  layer: SchematicLayerId,
  label: string
) {
  return el("label", { class: "layer-row" },
    el("input", {
      type: "checkbox",
      "data-layer-toggle": layer,
      "aria-label": label
    }),
    el("span", {}, label)
  );
}

function netProperties<T extends object>(el: UiBuilder<T>["el"]) {
  return el("div", { class: "property-form", "data-property-net-form": true, hidden: true },
    el("label", { class: "property-row", "data-property-label-row": true, hidden: true },
      el("span", {}, "Label"),
      el("input", { type: "text", spellcheck: "false", autocomplete: "off", "data-property-net-label": true })
    ),
    el("label", { class: "property-row", "data-property-net-name-row": true },
      el("span", {}, "Net Name"),
      el("input", { type: "text", readonly: true, "data-property-net-name": true })
    ),
    el("div", { class: "property-row", "data-property-network-color-row": true, hidden: true },
      el("span", {}, "Color"),
      propertyColorControl(el, "network")
    ),
    el("div", { class: "property-row", "data-property-wire-line-width-row": true, hidden: true },
      el("span", {}, "Width"),
      el("div", { class: "property-segmented", role: "group", "aria-label": "Wire line width", "data-property-wire-line-width": true })
    ),
    el("div", { class: "property-row", "data-property-wire-start-marker-row": true, hidden: true },
      el("span", {}, "Start"),
      el("div", {
        class: "property-segmented",
        role: "group",
        "aria-label": "Wire start marker",
        "data-property-wire-start-marker": true
      })
    ),
    el("div", { class: "property-row", "data-property-wire-end-marker-row": true, hidden: true },
      el("span", {}, "End"),
      el("div", { class: "property-segmented", role: "group", "aria-label": "Wire end marker", "data-property-wire-end-marker": true })
    ),
    el("label", { class: "property-row", "data-property-wire-digital-slash-row": true, hidden: true },
      el("span", {}, "Digital"),
      el("input", {
        class: "property-toggle",
        type: "checkbox",
        "aria-label": "Show digital wire slash",
        "data-property-wire-digital-slash": true
      })
    ),
    el("label", { class: "property-row", "data-property-wire-digital-label-row": true, hidden: true },
      el("span", {}, "Bits"),
      el("input", {
        type: "text",
        spellcheck: "false",
        autocomplete: "off",
        "aria-label": "Digital wire bit label",
        "data-property-wire-digital-label": true
      })
    ),
    el("div", { class: "property-error", "data-property-net-message": true, hidden: true })
  );
}

function labelToolProperties<T extends object>(el: UiBuilder<T>["el"]) {
  return el("div", { class: "property-form", "data-property-label-tool-form": true, hidden: true },
    el("label", { class: "property-row" },
      el("span", {}, "Label"),
      el("input", { type: "text", spellcheck: "false", autocomplete: "off", "data-property-label-tool-input": true })
    ),
    el("div", { class: "property-error", "data-property-label-tool-error": true, hidden: true })
  );
}

function componentProperties<T extends object>(el: UiBuilder<T>["el"]) {
  return el("div", { class: "property-form", "data-property-component-form": true, hidden: true },
    el("label", { class: "property-row", "data-property-cell-row": true },
      el("span", {}, "Cell"),
      el("select", { "data-property-cell": true })
    ),
    el("label", { class: "property-row" },
      el("span", {}, "Name"),
      el("input", { type: "text", spellcheck: "false", autocomplete: "off", "data-property-ref": true })
    ),
    el("label", { class: "property-row" },
      el("span", {}, "Show label"),
      el("input", { class: "property-toggle", type: "checkbox", "aria-label": "Show label", "data-property-label-visible": true })
    ),
    el("label", { class: "property-row", "data-property-value-visibility-row": true, hidden: true },
      el("span", {}, "Show value"),
      el("input", { class: "property-toggle", type: "checkbox", "aria-label": "Show value", "data-property-value-visible": true })
    ),
    el("div", { class: "property-row", "data-property-component-color-row": true },
      el("span", {}, "Color"),
      propertyColorControl(el, "component")
    ),
    el("div", { class: "property-row", "data-property-gain-polarity-row": true, hidden: true },
      el("span", {}, "Polarity"),
      el("div", { class: "property-segmented", role: "group", "aria-label": "Gain polarity", "data-property-gain-polarity": true },
        el("button", { type: "button", "aria-pressed": "false", "data-property-gain-polarity-value": "default" },
          "Default"
        ),
        el("button", {
          type: "button",
          "aria-label": "Non-inverting",
          title: "Non-inverting",
          "aria-pressed": "false",
          "data-property-gain-polarity-value": "positive"
        }, "+"),
        el("button", {
          type: "button",
          "aria-label": "Inverting",
          title: "Inverting",
          "aria-pressed": "false",
          "data-property-gain-polarity-value": "negative"
        }, "−")
      )
    ),
    el("label", { class: "property-row", "data-property-differential-outputs-row": true, hidden: true },
      el("span", {}, "Same I/O polarity"),
      el("input", {
        class: "property-toggle",
        type: "checkbox",
        "aria-label": "Use the same top and bottom polarity order for differential inputs and outputs",
        "data-property-differential-outputs-same": true
      })
    ),
    el("label", { class: "property-row", "data-property-value-row": true, hidden: true },
      el("span", { "data-property-value-label": true }, "Value"),
      el("span", { class: "property-value-control" },
        el("input", { type: "text", spellcheck: "false", autocomplete: "off", "data-property-value": true }),
        el("span", { class: "property-value-unit", "data-property-value-unit": true, hidden: true })
      )
    ),
    el("div", { class: "property-inductor-fields", "data-property-inductor-fields": true, hidden: true },
      el("div", { class: "property-row" },
        el("span", {}, "Center tap"),
        el("div", {
          class: "property-segmented",
          role: "group",
          "aria-label": "Inductor center tap side",
          "data-property-inductor-tap": true
        },
          el("button", { type: "button", "aria-pressed": "false", "data-property-inductor-tap-value": "none" }, "None"),
          el("button", { type: "button", "aria-pressed": "false", "data-property-inductor-tap-value": "top" }, "Top"),
          el("button", { type: "button", "aria-pressed": "false", "data-property-inductor-tap-value": "bottom" },
            "Bot"
          )
        )
      ),
      el("div", { class: "property-row" },
        el("span", {}, "Dot"),
        el("div", {
          class: "property-segmented",
          role: "group",
          "aria-label": "Inductor dotted terminal",
          "data-property-inductor-dot": true
        },
          el("button", { type: "button", "aria-pressed": "false", "data-property-inductor-dot-value": "none" }, "None"),
          el("button", { type: "button", "aria-pressed": "false", "data-property-inductor-dot-value": "p" }, "P"),
          el("button", { type: "button", "aria-pressed": "false", "data-property-inductor-dot-value": "n" }, "N")
        )
      ),
      el("div", { class: "property-coupling-list", "data-property-inductor-coupling-list": true }),
      el("div", { class: "property-row property-row-action" },
        el("span", {}, "Couple"),
        el("span", { class: "property-inline-action" },
          el("button", { type: "button", "aria-pressed": "false", "data-property-inductor-add-coupling": true }, "Add")
        )
      )
    ),
    el("div", { class: "property-triangle-fields", "data-property-triangle-fields": true, hidden: true }, ...["ab", "bc", "ca"].map(edge =>
      el("label", { class: "property-row" },
        el("span", {}, `${edge.toUpperCase()} pins`),
        el("input", { type: "number", min: "0", max: "1024", step: "1", "data-property-triangle-pins": edge })
      )
    )),
    el("div", { class: "property-rectangle-fields", "data-property-rectangle-fields": true, hidden: true },
      el("label", { class: "property-row" },
        el("span", {}, "Width (grid)"),
        el("input", { type: "number", min: "2", max: "4096", step: "1", "data-property-rectangle": "width" })
      ),
      el("label", { class: "property-row" },
        el("span", {}, "Height (grid)"),
        el("input", { type: "number", min: "2", max: "4096", step: "1", "data-property-rectangle": "height" })
      ),
      el("label", { class: "property-row" },
        el("span", {}, "Left pins"),
        el("input", { type: "number", min: "0", max: "1024", step: "1", "data-property-rectangle": "leftPins" })
      ),
      el("label", { class: "property-row" },
        el("span", {}, "Right pins"),
        el("input", { type: "number", min: "0", max: "1024", step: "1", "data-property-rectangle": "rightPins" })
      ),
      el("label", { class: "property-row" },
        el("span", {}, "Top pins"),
        el("input", { type: "number", min: "0", max: "1024", step: "1", "data-property-rectangle": "topPins" })
      ),
      el("label", { class: "property-row" },
        el("span", {}, "Bottom pins"),
        el("input", { type: "number", min: "0", max: "1024", step: "1", "data-property-rectangle": "bottomPins" })
      )
    ),
    el("div", { class: "property-row", "data-property-time-domain-row": true, hidden: true },
      el("span", {}, "Domain"),
      el("div", { class: "property-segmented", role: "group", "aria-label": "Function block domain", "data-property-time-domain": true },
        ...FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS.map(option =>
          el("button", { type: "button", "aria-pressed": "false", "data-property-time-domain-value": option.value },
            option.label
          )
        )
      )
    ),
    el("div", { class: "property-row", "data-property-scale-row": true, hidden: true },
      el("span", {}, "Size"),
      el("div", { class: "property-segmented", role: "group", "aria-label": "Component size", "data-property-scale-segmented": true })
    ),
    el("div", { class: "property-row", "data-property-variant-row": true, hidden: true },
      el("span", { "data-property-variant-label": true }, "View"),
      el("div", { class: "property-choice-control" },
        el("select", { "data-property-variant": true }),
        el("div", {
          class: "property-segmented",
          role: "group",
          "aria-label": "Component view",
          "data-property-variant-segmented": true,
          hidden: true
        })
      )
    ),
    el("label", { class: "property-row", "data-property-inductor-layout-row": true, hidden: true },
      el("span", {}, "Layout"),
      el("select", { "aria-label": "Inductor layout", "data-property-inductor-layout": true })
    ),
    el("div", { class: "property-vsource-fields", "data-property-vsource-fields": true, hidden: true }),
    el("div", { class: "property-row", "data-property-clock-row": true, hidden: true },
      el("span", {}, "Clock"),
      el("div", { class: "property-choice-control" },
        el("select", { "data-property-clock": true }),
        el("div", {
          class: "property-segmented",
          role: "group",
          "aria-label": "Component clock",
          "data-property-clock-segmented": true,
          hidden: true
        })
      )
    ),
    ...dffControls(el),
    el("label", { class: "property-row", "data-property-filter-kind-row": true, hidden: true },
      el("span", {}, "Filter"),
      el("select", { "aria-label": "Filter kind", "data-property-filter-kind": true })
    ),
    el("div", { class: "property-row", "data-property-mos-pins-row": true, hidden: true },
      el("span", {}, "Pins"),
      el("div", { class: "property-choice-control" },
        el("div", {
          class: "property-segmented",
          role: "group",
          "aria-label": "MOS pin count",
          "data-property-mos-pins-segmented": true
        })
      )
    ),
    el("div", { class: "property-mos-params", "data-property-mos-params": true, hidden: true },
      mosParamRow(el, "w", "W", "1u"),
      mosParamRow(el, "l", "L", "0.15u"),
      mosParamRow(el, "m", "M", "1"),
      mosParamRow(el, "nf", "NF", "1")
    ),
    el("label", { class: "property-row", "data-property-mos-gate-style-row": true, hidden: true },
      el("span", {}, "Gate style"),
      el("input", { class: "property-toggle", type: "checkbox", "aria-label": "Gate style", "data-property-mos-gate-style": true })
    ),
    el("label", { class: "property-row", "data-property-mos-thick-gate-row": true, hidden: true },
      el("span", {}, "Thick gate"),
      el("input", { class: "property-toggle", type: "checkbox", "aria-label": "Thick gate", "data-property-mos-thick-gate": true })
    ),
    el("div", { class: "property-row", "data-property-mos-arrow-row": true, hidden: true },
      el("span", {}, "Arrow"),
      el("div", { class: "property-choice-control" },
        el("div", { class: "property-segmented", role: "group", "aria-label": "MOS arrow", "data-property-mos-arrow-segmented": true })
      )
    ),
    el("div", { class: "property-row", "data-property-transistor-circle-row": true, hidden: true },
      el("span", {}, "Circle"),
      el("div", {
        class: "property-segmented",
        role: "group",
        "aria-label": "Transistor circle",
        "data-property-transistor-circle": true
      },
        el("button", { type: "button", "aria-pressed": "false", "data-property-transistor-circle-value": "false" },
          "Off"
        ),
        el("button", { type: "button", "aria-pressed": "false", "data-property-transistor-circle-value": "true" },
          "On"
        )
      )
    ),
    el("div", { class: "property-pin-list", "data-property-pin-visibility-row": true, hidden: true })
  );
}

function mosParamRow<T extends object>(
  el: UiBuilder<T>["el"],
  param: "w" | "l" | "m" | "nf",
  label: string,
  placeholder: string
) {
  return el("label", { class: "property-row", "data-property-mos-param-row": true },
    el("span", {}, label),
    el("input", {
      type: "text",
      spellcheck: "false",
      autocomplete: "off",
      placeholder,
      "data-property-mos-param": param,
      "aria-label": `MOS ${label}`
    })
  );
}

function couplingProperties<T extends object>(el: UiBuilder<T>["el"]) {
  return el("div", { class: "property-form", "data-property-coupling-form": true, hidden: true },
    el("div", { class: "property-static-row" },
      el("span", {}, "Pair"),
      el("strong", { "data-property-coupling-pair": true })
    ),
    el("div", { "data-property-coupling-existing-fields": true, hidden: true },
      el("label", { class: "property-row" },
        el("span", {}, "Parameter"),
        el("span", { class: "property-inline-action" },
          el("input", { type: "text", spellcheck: "false", autocomplete: "off", "data-property-coupling-coefficient": true }),
          el("button", { type: "button", "data-property-coupling-auto": true }, "Auto")
        )
      ),
      el("label", { class: "property-row" },
        el("span", {}, "Show label"),
        el("input", { class: "property-toggle", type: "checkbox", "data-property-coupling-show-label": true })
      ),
      el("div", { class: "property-row" },
        el("span", {}, "Label"),
        el("div", {
          class: "property-segmented",
          role: "group",
          "aria-label": "Coupling label",
          "data-property-coupling-label-mode": true
        })
      ),
      el("div", { class: "property-row" },
        el("span", {}, "Arc"),
        el("span", { class: "property-inline-toggle-action" },
          el("input", {
            class: "property-toggle",
            type: "checkbox",
            "aria-label": "Show coupling arc",
            "data-property-coupling-show-arc": true
          }),
          el("button", { type: "button", "data-property-coupling-flip": true }, "Flip arc")
        )
      ),
      el("label", { class: "property-row" },
        el("span", {}, "Core"),
        el("input", { class: "property-toggle", type: "checkbox", "data-property-coupling-show-core": true })
      ),
      el("div", { class: "property-row" },
        el("span", {}, "Color"),
        propertyColorControl(el, "coupling")
      )
    ),
    el("button", { type: "button", class: "property-primary-command", "data-property-coupling-create": true, hidden: true },
      "Create coupling"
    )
  );
}

function noteProperties<T extends object>(el: UiBuilder<T>["el"]) {
  return el("div", { class: "property-form", "data-property-note-form": true, hidden: true },
    el("div", { class: "property-row", "data-property-note-format-row": true, hidden: true },
      el("span", {}, "Format"),
      el("div", { class: "property-choice-control" },
        el("select", { "data-property-note-format": true, hidden: true },
          el("option", { value: "plain" }, "Plain"),
          el("option", { value: "markdown" }, "Markdown")
        ),
        el("div", {
          class: "property-segmented",
          role: "group",
          "aria-label": "Note format",
          "data-property-note-format-segmented": true
        })
      )
    ),
    el("div", { class: "property-row", "data-property-note-text-color-row": true, hidden: true },
      el("span", {}, "Text color"),
      el("div", { class: "property-color-control" },
        el("div", { class: "property-color-swatches", "data-property-note-text-color-swatches": true }, ...PAPER_COLOR_PRESETS.map(preset =>
          el("button", {
            type: "button",
            "data-note-text-color-swatch": preset.color,
            style: `--swatch-color: ${preset.color}`,
            "aria-label": `Set note text color ${preset.name}`,
            title: preset.name,
            "aria-pressed": "false"
          })
        )),
        el("input", {
          type: "color",
          "aria-label": "Custom note text color",
          title: "Custom text color",
          "data-property-note-text-color": true
        })
      )
    ),
    el("div", { class: "property-row", "data-property-note-background-row": true, hidden: true },
      el("span", {}, "Fill"),
      el("div", { class: "property-color-control" },
        el("div", { class: "property-color-swatches", "data-property-note-background-swatches": true },
          el("button", {
            type: "button",
            class: "property-no-fill-swatch",
            "data-note-background-swatch": "none",
            "aria-label": "No fill",
            title: "No fill",
            "aria-pressed": "false"
          }),
          ...NOTE_BACKGROUND_COLOR_PRESETS.map(({ color, name }) =>
            el("button", {
              type: "button",
              "data-note-background-swatch": color,
              style: `--swatch-color: ${color}`,
              "aria-label": `Set note fill ${name}`,
              title: name
            })
          )
        ),
        el("input", {
          type: "color",
          "aria-label": "Custom note fill color",
          title: "Custom color",
          "data-property-note-background": true
        })
      )
    ),
    el("label", { class: "property-row", "data-property-note-font-size-row": true, hidden: true },
      el("span", {}, "Size"),
      el("span", { class: "property-unit-control" },
        el("input", {
          type: "number",
          min: MIN_NOTE_FONT_SIZE_PX,
          max: MAX_NOTE_FONT_SIZE_PX,
          step: "1",
          "data-property-note-font-size": true
        }),
        el("span", {}, "px")
      )
    ),
    el("label", { class: "property-row", "data-property-note-width-row": true, hidden: true },
      el("span", {}, "Width"),
      el("span", { class: "property-unit-control" },
        el("input", {
          type: "number",
          min: NOTE_WIDTH_INPUT_MIN,
          max: NOTE_WIDTH_INPUT_MAX,
          step: "20",
          "data-property-note-width": true
        }),
        el("span", {}, "px")
      )
    )
  );
}

function dffControls<T extends object>(el: UiBuilder<T>["el"]) {
  const settings: [DffSettingProperty, string, string][] = [
    ["clockEdge", "Clock", "DFF clock edge"],
    ["setMode", "Set", "DFF set mode"],
    ["setActiveLevel", "Set active", "DFF set active level"],
    ["resetMode", "Reset", "DFF reset mode"],
    ["resetActiveLevel", "Reset active", "DFF reset active level"]
  ];
  return settings.map(([property, label, group]) =>
    el("div", { class: "property-row", "data-property-dff-row": property, hidden: true },
      el("span", {}, label),
      el("div", { class: "property-segmented", role: "group", "aria-label": group, "data-property-dff-control": property },
        ...DFF_SETTING_OPTIONS[property].map(option => el("button", {
          type: "button", "aria-pressed": "false", "data-property-dff-setting": property, "data-property-dff-value": option.value
        }, option.label))
      )
    )
  );
}

function propertyColorControl<T extends object>(el: UiBuilder<T>["el"], target: "network" | "component" | "coupling") {
  const name = target === "component" ? "symbol" : target;
  const swatch = `data-${target}-color-swatch`;
  return el("div", { class: "property-color-control" },
    el("div", { class: "property-color-swatches", [`data-property-${target}-color-swatches`]: true },
      el("button", {
        type: "button", class: "property-default-color-swatch", [swatch]: "default", style: `--swatch-color: ${DEFAULT_COMPONENT_COLOR}`,
        "aria-label": `Use black (default) ${name} color`, title: "Black (default)", "aria-pressed": "false"
      }),
      ...SCHEMATIC_COLOR_PRESETS.map(preset => el("button", {
        type: "button", [swatch]: preset.color, style: `--swatch-color: ${preset.color}`,
        "aria-label": `Set ${name} color ${preset.name}`, title: preset.name, "aria-pressed": "false"
      }))
    ),
    el("input", {
      type: "color", "aria-label": `Custom ${target === "network" ? "wire or junction" : name} color`, title: "Custom color",
      [`data-property-${target}-color`]: true
    })
  );
}
