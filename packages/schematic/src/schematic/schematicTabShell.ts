import { renderSchematicToolbar } from "./schematicToolbarWeb";
import { renderSchematicEditorSidebarProjection } from "./schematicEditorUiProjection";
export {
  SCHEMATIC_NETWORK_COLOR_PRESETS,
  SCHEMATIC_SYMBOL_COLOR_PRESETS
} from "./schematicEditorUiProjection";
import type { SchematicEditorMountElements } from "./editorHandle";

export type { SchematicEditorMountElements } from "./editorHandle";

let nextShellNamespace = 1;

export function renderSchematicTabShell(): string {
  const namespace = `schematic-shell-${nextShellNamespace++}`;
  const importInputId = `${namespace}-document-import-input`;
  const analysisIds = {
    inputP: `${namespace}-analysis-input-p`,
    inputN: `${namespace}-analysis-input-n`,
    outputP: `${namespace}-analysis-output-p`,
    outputN: `${namespace}-analysis-output-n`
  };
  return `
    <main class="schematic-shell schematic-editor-root" data-schematic-shell>
      ${renderSchematicEditorSidebarProjection()}
      <div class="schematic-panel-resizer" role="separator" aria-label="Resize or reveal controls panel" aria-orientation="vertical" aria-valuemin="0" tabindex="0" title="Drag to resize or collapse controls" data-schematic-panel-resizer="left"></div>
      <section class="schematic-workspace" aria-label="Schematic drawing area">
        <div class="schematic-document-tabs" aria-label="Open schematics" data-schematic-document-tabs>
          <div class="schematic-document-tab-list" role="tablist" aria-label="Schematic documents" data-schematic-document-tab-list></div>
          <button type="button" class="schematic-document-tab-new" data-schematic-document-new aria-label="New schematic" title="New schematic">+</button>
          <button type="button" class="schematic-document-tab-action" data-schematic-document-import aria-label="Import schematic" title="Import schematic" aria-controls="${importInputId}">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 3v12"></path>
              <path d="m7 10 5 5 5-5"></path>
              <path d="M5 21h14"></path>
            </svg>
          </button>
          <button type="button" class="schematic-document-tab-action" data-schematic-document-paste aria-label="Paste schematic JSON from clipboard" title="Paste schematic JSON from clipboard">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 5h6"></path>
              <path d="M9 3h6v4H9z"></path>
              <path d="M7 5H5v16h14V5h-2"></path>
              <path d="M12 10v7"></path>
              <path d="m9 14 3 3 3-3"></path>
            </svg>
          </button>
          <button type="button" class="schematic-document-tab-action" data-schematic-document-export aria-label="Export schematic" title="Export schematic">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 21V9"></path>
              <path d="m7 14 5-5 5 5"></path>
              <path d="M5 3h14"></path>
            </svg>
          </button>
          <input id="${importInputId}" type="file" accept=".json,application/json" data-schematic-document-import-input hidden />
          <div class="schematic-close-snackbar" data-schematic-close-snackbar role="status" aria-live="polite" aria-atomic="true" hidden>
            <span data-schematic-close-message></span>
            <button type="button" data-schematic-close-undo>Undo</button>
          </div>
          <div class="schematic-storage-error-notice" data-schematic-storage-error role="alert" aria-atomic="true" hidden>
            <span data-schematic-storage-error-message></span>
            <button type="button" data-schematic-storage-retry>Retry save</button>
            <button type="button" class="schematic-storage-error-dismiss" data-schematic-storage-error-dismiss aria-label="Dismiss storage error" title="Dismiss"></button>
          </div>
        </div>
        <div class="schematic-toolbar">${renderSchematicToolbar(namespace)}</div>
        <div class="schematic-paper" tabindex="0" aria-label="Schematic canvas" data-schematic-paper></div>
        <div class="schematic-status" aria-live="polite" data-schematic-status>Select a tool or press i to add an instance.</div>
      </section>
      <div class="schematic-panel-resizer" role="separator" aria-label="Resize or reveal analysis panel" aria-orientation="vertical" aria-valuemin="0" tabindex="0" title="Drag to resize or collapse analysis" data-schematic-panel-resizer="right"></div>
      <aside class="analysis-panel" aria-label="Symbolic analysis" data-schematic-analysis-panel>
        <div class="analysis-panel-heading">
          <h2>Symbolic Analysis</h2>
        </div>
        <p class="analysis-note">Uses component values from the Property Editor.</p>
        <div data-selection-summary class="selection-summary">No object selected.</div>
        <div class="net-pick-row">
          <label for="${analysisIds.inputP}">Input +</label>
          <select id="${analysisIds.inputP}" data-net-select="inputP"></select>
          <button type="button" data-pick-net="inputP">Pick</button>
        </div>
        <div class="net-pick-row">
          <label for="${analysisIds.inputN}">Input -</label>
          <select id="${analysisIds.inputN}" data-net-select="inputN"></select>
          <button type="button" data-pick-net="inputN">Pick</button>
        </div>
        <div class="net-pick-row">
          <label for="${analysisIds.outputP}">Output +</label>
          <select id="${analysisIds.outputP}" data-net-select="outputP"></select>
          <button type="button" data-pick-net="outputP">Pick</button>
        </div>
        <div class="net-pick-row">
          <label for="${analysisIds.outputN}">Output -</label>
          <select id="${analysisIds.outputN}" data-net-select="outputN"></select>
          <button type="button" data-pick-net="outputN">Pick</button>
        </div>
        <div class="analysis-actions">
          <button type="button" data-analysis="compute">Compute H(s), Zin(s), Zout(s)</button>
        </div>
        <div class="analysis-progress" data-analysis-progress hidden role="progressbar" aria-label="Symbolic analysis progress">
          <div class="analysis-progress-bar"></div>
          <span data-analysis-progress-text>Solving symbolic MNA...</span>
        </div>
        <div data-analysis-diagnostics class="analysis-diagnostics"></div>
        <div class="analysis-results">
          <h3>Transfer Function</h3>
          <output data-analysis-transfer></output>
          <h3>Input Impedance</h3>
          <output data-analysis-zin></output>
          <h3>Output Impedance</h3>
          <output data-analysis-zout></output>
        </div>
      </aside>
      <button type="button" class="schematic-panel-backdrop" aria-label="Close side panel" data-schematic-panel-backdrop hidden></button>
    </main>
  `;
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
