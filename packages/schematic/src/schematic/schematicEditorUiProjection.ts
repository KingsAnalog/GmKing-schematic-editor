import { DFF_SETTING_OPTIONS, type DffSettingProperty } from "./dffModel";
import { FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS } from "./functionBlockModel";
import { DEFAULT_COMPONENT_COLOR } from "./componentPropertyModel";
import { MAX_NOTE_FONT_SIZE_PX, MIN_NOTE_FONT_SIZE_PX } from "./notes/noteSizing";
import { NOTE_WIDTH_INPUT_MAX, NOTE_WIDTH_INPUT_MIN } from "./notes/noteProperties";
import { PAPER_COLOR_PRESETS, NOTE_BACKGROUND_COLOR_PRESETS } from "../shared/color";
import { SYMBOL_TEMPLATES } from "./symbolTemplateModel";


const SCHEMATIC_COLOR_PRESETS = PAPER_COLOR_PRESETS.filter((preset) => preset.color !== DEFAULT_COMPONENT_COLOR);

export const SCHEMATIC_SYMBOL_COLOR_PRESETS = SCHEMATIC_COLOR_PRESETS;
export const SCHEMATIC_NETWORK_COLOR_PRESETS = SCHEMATIC_COLOR_PRESETS;

/** Shared palette and Property Editor projection used by every interactive host. */
export function renderSchematicEditorSidebarProjection() {
  return `
        <aside class="schematic-palette" aria-label="Schematic controls" data-schematic-palette>
          <section class="symbol-template-panel" aria-label="Schematic symbol template">
            <label class="symbol-template-control">
              <span>Symbol template</span>
              <select data-symbol-template aria-label="Symbol template" title="Symbol template for this schematic">
                ${SYMBOL_TEMPLATES.map(template => `<option value="${template.id}"${template.available ? "" : " disabled"}>${template.label}${template.available ? "" : " (not ready)"}</option>`).join("")}
              </select>
            </label>
            <div class="property-error" data-symbol-template-error role="status" hidden></div>
          </section>
          <section class="palette-panel" aria-label="Add instance palette">
            <div class="palette-title">
              <div class="palette-title-copy">
                <strong>Add Instance</strong>
                <span>i opens, Esc cancels</span>
              </div>
            </div>
            <div class="palette-grid" data-palette-items></div>
          </section>
          <section class="property-editor" aria-label="Property Editor" data-schematic-property-editor>
            <h2>Property Editor</h2>
            <div class="property-empty" data-property-empty>No object selected.</div>
            <div class="property-form" data-property-net-form hidden>
              <label class="property-row" data-property-label-row hidden>
                <span>Label</span>
                <input type="text" spellcheck="false" autocomplete="off" data-property-net-label />
              </label>
              <label class="property-row" data-property-net-name-row>
                <span>Net Name</span>
                <input type="text" readonly data-property-net-name />
              </label>
              <div class="property-row" data-property-network-color-row hidden>
                <span>Color</span>
                <div class="property-color-control">
                  <div class="property-color-swatches" data-property-network-color-swatches>
                    <button type="button" class="property-default-color-swatch" data-network-color-swatch="default" style="--swatch-color: ${DEFAULT_COMPONENT_COLOR}" aria-label="Use black (default) network color" title="Black (default)" aria-pressed="false"></button>
                    ${SCHEMATIC_NETWORK_COLOR_PRESETS.map((preset) => `<button type="button" data-network-color-swatch="${preset.color}" style="--swatch-color: ${preset.color}" aria-label="Set network color ${preset.name}" title="${preset.name}" aria-pressed="false"></button>`).join("")}
                  </div>
                  <input type="color" aria-label="Custom wire or junction color" title="Custom color" data-property-network-color />
                </div>
              </div>
              <div class="property-row" data-property-wire-line-width-row hidden>
                <span>Width</span>
                <div class="property-segmented" role="group" aria-label="Wire line width" data-property-wire-line-width></div>
              </div>
              <div class="property-row" data-property-wire-start-marker-row hidden>
                <span>Start</span>
                <div class="property-segmented" role="group" aria-label="Wire start marker" data-property-wire-start-marker></div>
              </div>
              <div class="property-row" data-property-wire-end-marker-row hidden>
                <span>End</span>
                <div class="property-segmented" role="group" aria-label="Wire end marker" data-property-wire-end-marker></div>
              </div>
              <label class="property-row" data-property-wire-digital-slash-row hidden>
                <span>Digital</span>
                <input class="property-toggle" type="checkbox" aria-label="Show digital wire slash" data-property-wire-digital-slash />
              </label>
              <label class="property-row" data-property-wire-digital-label-row hidden>
                <span>Bits</span>
                <input type="text" spellcheck="false" autocomplete="off" aria-label="Digital wire bit label" data-property-wire-digital-label />
              </label>
              <div class="property-error" data-property-net-message hidden></div>
            </div>
            <div class="property-form" data-property-label-tool-form hidden>
              <label class="property-row">
                <span>Label</span>
                <input type="text" spellcheck="false" autocomplete="off" data-property-label-tool-input />
              </label>
              <div class="property-error" data-property-label-tool-error hidden></div>
            </div>
            <div class="property-form" data-property-component-form hidden>
              <label class="property-row" data-property-cell-row>
                <span>Cell</span>
                <select data-property-cell></select>
              </label>
              <label class="property-row">
                <span>Name</span>
                <input type="text" spellcheck="false" autocomplete="off" data-property-ref />
              </label>
              <label class="property-row">
                <span>Show label</span>
                <input class="property-toggle" type="checkbox" aria-label="Show label" data-property-label-visible />
              </label>
              <label class="property-row" data-property-value-visibility-row hidden>
                <span>Show value</span>
                <input class="property-toggle" type="checkbox" aria-label="Show value" data-property-value-visible />
              </label>
              <div class="property-row" data-property-component-color-row>
                <span>Color</span>
                <div class="property-color-control">
                  <div class="property-color-swatches" data-property-component-color-swatches>
                    <button type="button" class="property-default-color-swatch" data-component-color-swatch="default" style="--swatch-color: ${DEFAULT_COMPONENT_COLOR}" aria-label="Use black (default) symbol color" title="Black (default)" aria-pressed="false"></button>
                    ${SCHEMATIC_SYMBOL_COLOR_PRESETS.map((preset) => `<button type="button" data-component-color-swatch="${preset.color}" style="--swatch-color: ${preset.color}" aria-label="Set symbol color ${preset.name}" title="${preset.name}" aria-pressed="false"></button>`).join("")}
                  </div>
                  <input type="color" aria-label="Custom symbol color" title="Custom color" data-property-component-color />
                </div>
              </div>
              <div class="property-row" data-property-gain-polarity-row hidden>
                <span>Polarity</span>
                <div class="property-segmented" role="group" aria-label="Gain polarity" data-property-gain-polarity>
                  <button type="button" aria-pressed="false" data-property-gain-polarity-value="default">Default</button>
                  <button type="button" aria-label="Non-inverting" title="Non-inverting" aria-pressed="false" data-property-gain-polarity-value="positive">+</button>
                  <button type="button" aria-label="Inverting" title="Inverting" aria-pressed="false" data-property-gain-polarity-value="negative">−</button>
                </div>
              </div>
              <label class="property-row" data-property-differential-outputs-row hidden>
                <span>Same I/O polarity</span>
                <input class="property-toggle" type="checkbox" aria-label="Use the same top and bottom polarity order for differential inputs and outputs" data-property-differential-outputs-same />
              </label>
              <label class="property-row" data-property-value-row hidden>
                <span data-property-value-label>Value</span>
                <span class="property-value-control">
                  <input type="text" spellcheck="false" autocomplete="off" data-property-value />
                  <span class="property-value-unit" data-property-value-unit hidden></span>
                </span>
              </label>
              <div class="property-inductor-fields" data-property-inductor-fields hidden>
                <div class="property-row">
                  <span>Center tap</span>
                  <div class="property-segmented" role="group" aria-label="Inductor center tap side" data-property-inductor-tap>
                    <button type="button" aria-pressed="false" data-property-inductor-tap-value="none">None</button>
                    <button type="button" aria-pressed="false" data-property-inductor-tap-value="top">Top</button>
                    <button type="button" aria-pressed="false" data-property-inductor-tap-value="bottom">Bot</button>
                  </div>
                </div>
                <div class="property-row">
                  <span>Dot</span>
                  <div class="property-segmented" role="group" aria-label="Inductor dotted terminal" data-property-inductor-dot>
                    <button type="button" aria-pressed="false" data-property-inductor-dot-value="none">None</button>
                    <button type="button" aria-pressed="false" data-property-inductor-dot-value="p">P</button>
                    <button type="button" aria-pressed="false" data-property-inductor-dot-value="n">N</button>
                  </div>
                </div>
                <div class="property-coupling-list" data-property-inductor-coupling-list></div>
                <div class="property-row property-row-action">
                  <span>Couple</span>
                  <span class="property-inline-action">
                    <button type="button" aria-pressed="false" data-property-inductor-add-coupling>Add</button>
                  </span>
                </div>
              </div>
              <div class="property-triangle-fields" data-property-triangle-fields hidden>
                ${["ab", "bc", "ca"].map(edge => `<label class="property-row"><span>${edge.toUpperCase()} pins</span><input type="number" min="0" max="1024" step="1" data-property-triangle-pins="${edge}" /></label>`).join("")}
              </div>
              <div class="property-rectangle-fields" data-property-rectangle-fields hidden>
                <label class="property-row">
                  <span>Width (grid)</span>
                  <input type="number" min="2" max="4096" step="1" data-property-rectangle="width" />
                </label>
                <label class="property-row">
                  <span>Height (grid)</span>
                  <input type="number" min="2" max="4096" step="1" data-property-rectangle="height" />
                </label>
                <label class="property-row">
                  <span>Left pins</span>
                  <input type="number" min="0" max="1024" step="1" data-property-rectangle="leftPins" />
                </label>
                <label class="property-row">
                  <span>Right pins</span>
                  <input type="number" min="0" max="1024" step="1" data-property-rectangle="rightPins" />
                </label>
                <label class="property-row">
                  <span>Top pins</span>
                  <input type="number" min="0" max="1024" step="1" data-property-rectangle="topPins" />
                </label>
                <label class="property-row">
                  <span>Bottom pins</span>
                  <input type="number" min="0" max="1024" step="1" data-property-rectangle="bottomPins" />
                </label>
              </div>
              <div class="property-row" data-property-time-domain-row hidden>
                <span>Domain</span>
                <div class="property-segmented" role="group" aria-label="Function block domain" data-property-time-domain>
                  ${FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS.map(option => `<button type="button" aria-pressed="false" data-property-time-domain-value="${option.value}">${option.label}</button>`).join("")}
                </div>
              </div>
              <div class="property-row" data-property-scale-row hidden>
                <span>Size</span>
                <div class="property-segmented" role="group" aria-label="Component size" data-property-scale-segmented></div>
              </div>
              <div class="property-row" data-property-variant-row hidden>
                <span data-property-variant-label>View</span>
                <div class="property-choice-control">
                  <select data-property-variant></select>
                  <div class="property-segmented" role="group" aria-label="Component view" data-property-variant-segmented hidden></div>
                </div>
              </div>
              <label class="property-row" data-property-inductor-layout-row hidden>
                <span>Layout</span>
                <select aria-label="Inductor layout" data-property-inductor-layout></select>
              </label>
              <div class="property-vsource-fields" data-property-vsource-fields hidden></div>
              <div class="property-row" data-property-clock-row hidden>
                <span>Clock</span>
                <div class="property-choice-control">
                  <select data-property-clock></select>
                  <div class="property-segmented" role="group" aria-label="Component clock" data-property-clock-segmented hidden></div>
                </div>
              </div>
              <div class="property-row" data-property-dff-row="clockEdge" hidden>
                <span>Clock</span>
                <div class="property-segmented" role="group" aria-label="DFF clock edge" data-property-dff-control="clockEdge">
                  ${dffSettingButtons("clockEdge")}
                </div>
              </div>
              <div class="property-row" data-property-dff-row="setMode" hidden>
                <span>Set</span>
                <div class="property-segmented" role="group" aria-label="DFF set mode" data-property-dff-control="setMode">
                  ${dffSettingButtons("setMode")}
                </div>
              </div>
              <div class="property-row" data-property-dff-row="setActiveLevel" hidden>
                <span>Set active</span>
                <div class="property-segmented" role="group" aria-label="DFF set active level" data-property-dff-control="setActiveLevel">
                  ${dffSettingButtons("setActiveLevel")}
                </div>
              </div>
              <div class="property-row" data-property-dff-row="resetMode" hidden>
                <span>Reset</span>
                <div class="property-segmented" role="group" aria-label="DFF reset mode" data-property-dff-control="resetMode">
                  ${dffSettingButtons("resetMode")}
                </div>
              </div>
              <div class="property-row" data-property-dff-row="resetActiveLevel" hidden>
                <span>Reset active</span>
                <div class="property-segmented" role="group" aria-label="DFF reset active level" data-property-dff-control="resetActiveLevel">
                  ${dffSettingButtons("resetActiveLevel")}
                </div>
              </div>
              <label class="property-row" data-property-filter-kind-row hidden>
                <span>Filter</span>
                <select aria-label="Filter kind" data-property-filter-kind></select>
              </label>
              <div class="property-row" data-property-mos-pins-row hidden>
                <span>Pins</span>
                <div class="property-choice-control">
                  <div class="property-segmented" role="group" aria-label="MOS pin count" data-property-mos-pins-segmented></div>
                </div>
              </div>
              <label class="property-row" data-property-mos-gate-style-row hidden>
                <span>Gate style</span>
                <input class="property-toggle" type="checkbox" aria-label="Gate style" data-property-mos-gate-style />
              </label>
              <label class="property-row" data-property-mos-thick-gate-row hidden>
                <span>Thick gate</span>
                <input class="property-toggle" type="checkbox" aria-label="Thick gate" data-property-mos-thick-gate />
              </label>
              <div class="property-row" data-property-mos-arrow-row hidden>
                <span>Arrow</span>
                <div class="property-choice-control">
                  <div class="property-segmented" role="group" aria-label="MOS arrow" data-property-mos-arrow-segmented></div>
                </div>
              </div>
              <div class="property-row" data-property-transistor-circle-row hidden>
                <span>Circle</span>
                <div class="property-segmented" role="group" aria-label="Transistor circle" data-property-transistor-circle>
                  <button type="button" aria-pressed="false" data-property-transistor-circle-value="false">Off</button>
                  <button type="button" aria-pressed="false" data-property-transistor-circle-value="true">On</button>
                </div>
              </div>
              <div class="property-pin-list" data-property-pin-visibility-row hidden></div>
            </div>
            <div class="property-form" data-property-coupling-form hidden>
              <div class="property-static-row">
                <span>Pair</span>
                <strong data-property-coupling-pair></strong>
              </div>
              <div data-property-coupling-existing-fields hidden>
                <label class="property-row">
                  <span>Parameter</span>
                  <span class="property-inline-action">
                    <input type="text" spellcheck="false" autocomplete="off" data-property-coupling-coefficient />
                    <button type="button" data-property-coupling-auto>Auto</button>
                  </span>
                </label>
                <label class="property-row">
                  <span>Show label</span>
                  <input class="property-toggle" type="checkbox" data-property-coupling-show-label />
                </label>
                <div class="property-row">
                  <span>Label</span>
                  <div class="property-segmented" role="group" aria-label="Coupling label" data-property-coupling-label-mode></div>
                </div>
                <div class="property-row">
                  <span>Arc</span>
                  <span class="property-inline-toggle-action">
                    <input class="property-toggle" type="checkbox" aria-label="Show coupling arc" data-property-coupling-show-arc />
                    <button type="button" data-property-coupling-flip>Flip arc</button>
                  </span>
                </div>
                <label class="property-row">
                  <span>Core</span>
                  <input class="property-toggle" type="checkbox" data-property-coupling-show-core />
                </label>
                <div class="property-row">
                  <span>Color</span>
                  <div class="property-color-control">
                    <div class="property-color-swatches" data-property-coupling-color-swatches>
                      <button type="button" class="property-default-color-swatch" data-coupling-color-swatch="default" style="--swatch-color: ${DEFAULT_COMPONENT_COLOR}" aria-label="Use black (default) coupling color" title="Black (default)" aria-pressed="false"></button>
                      ${SCHEMATIC_SYMBOL_COLOR_PRESETS.map((preset) => `<button type="button" data-coupling-color-swatch="${preset.color}" style="--swatch-color: ${preset.color}" aria-label="Set coupling color ${preset.name}" title="${preset.name}" aria-pressed="false"></button>`).join("")}
                    </div>
                    <input type="color" aria-label="Custom coupling color" title="Custom color" data-property-coupling-color />
                  </div>
                </div>
              </div>
              <button type="button" class="property-primary-command" data-property-coupling-create hidden>Create coupling</button>
            </div>
            <div class="property-form" data-property-note-form hidden>
              <div class="property-row" data-property-note-format-row hidden>
                <span>Format</span>
                <div class="property-choice-control">
                  <select data-property-note-format hidden>
                    <option value="plain">Plain</option>
                    <option value="markdown">Markdown</option>
                  </select>
                  <div class="property-segmented" role="group" aria-label="Note format" data-property-note-format-segmented></div>
                </div>
              </div>
              <div class="property-row" data-property-note-text-color-row hidden>
                <span>Text color</span>
                <div class="property-color-control">
                  <div class="property-color-swatches" data-property-note-text-color-swatches>
                    ${PAPER_COLOR_PRESETS.map(preset => `<button type="button" data-note-text-color-swatch="${preset.color}" style="--swatch-color: ${preset.color}" aria-label="Set note text color ${preset.name}" title="${preset.name}" aria-pressed="false"></button>`).join("")}
                  </div>
                  <input type="color" aria-label="Custom note text color" title="Custom text color" data-property-note-text-color />
                </div>
              </div>
              <div class="property-row" data-property-note-background-row hidden>
                <span>Fill</span>
                <div class="property-color-control">
                  <div class="property-color-swatches" data-property-note-background-swatches>
                    <button type="button" class="property-no-fill-swatch" data-note-background-swatch="none" aria-label="No fill" title="No fill" aria-pressed="false"></button>
                    ${NOTE_BACKGROUND_COLOR_PRESETS.map(({ color, name }) => `<button type="button" data-note-background-swatch="${color}" style="--swatch-color: ${color}" aria-label="Set note fill ${name}" title="${name}"></button>`).join("")}
                  </div>
                  <input type="color" aria-label="Custom note fill color" title="Custom color" data-property-note-background />
                </div>
              </div>
              <label class="property-row" data-property-note-font-size-row hidden>
                <span>Size</span>
                <span class="property-unit-control">
                  <input type="number" min="${MIN_NOTE_FONT_SIZE_PX}" max="${MAX_NOTE_FONT_SIZE_PX}" step="1" data-property-note-font-size />
                  <span>px</span>
                </span>
              </label>
              <label class="property-row" data-property-note-width-row hidden>
                <span>Width</span>
                <span class="property-unit-control">
                  <input type="number" min="${NOTE_WIDTH_INPUT_MIN}" max="${NOTE_WIDTH_INPUT_MAX}" step="20" data-property-note-width />
                  <span>px</span>
                </span>
              </label>
            </div>
          </section>
        </aside>
  `;
}

function dffSettingButtons(property: DffSettingProperty) {
  return DFF_SETTING_OPTIONS[property].map(option => `<button type="button" aria-pressed="false" data-property-dff-setting="${property}" data-property-dff-value="${option.value}">${option.label}</button>`).join("");
}
