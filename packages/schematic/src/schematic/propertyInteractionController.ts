import type { ComponentType, ComponentVariantId, GainPolarity, OperatorPinMode } from "./types";
import type { ComponentClock } from "./clockModel";
import type { DffSettingProperty, DffSettings } from "./dffModel";
import type { FilterKind, FunctionBlockTimeDomain } from "./functionBlockModel";
import type { MosViewSettings } from "./mosViewModel";
import type { WireDecorationPatch } from "./wire/wireDecoration";
import { executeSchematicPropertyBatchCommand, type SchematicPropertyBatchCommand, type SchematicPropertyBatchCommandResult, type SchematicPropertyBatchSelection } from "./propertyBatchCommands";
import { SchematicPropertyEditSession, type SchematicPropertyEditCommitResult, type SchematicPropertyEditFrameScheduler, type SchematicPropertyEditKind } from "./propertyEditSession";
import type { SchematicDocument } from "./types";
import type { SelectionMoveBehavior } from "./selection/selectionMoveTransaction";
import type { RectangleProperty } from "./rectangleComponentModel";
import type { SchematicPropertyPanelControllerCallbacks } from "./propertyPanelController";

/** Owns property commands, preview/cancel and the single commit at edit completion. */
export class SchematicPropertyInteractionController {
  private readonly edit: SchematicPropertyEditSession;
  constructor(private readonly options: {
    document: SchematicDocument;
    selection(): SchematicPropertyBatchSelection;
    moveBehavior(): SelectionMoveBehavior;
    render(outcome: SchematicPropertyBatchCommandResult): void;
    restorePreview(): void;
    renderPanel(): void;
    rebuildCounters(): void;
    commit(): void;
    status(message: string): void;
    scheduler: SchematicPropertyEditFrameScheduler;
  }) {
    this.edit = new SchematicPropertyEditSession(options.document, (selection, command) => {
      const result = executeSchematicPropertyBatchCommand(options.document, selection, command);
      if (result.changed) options.render(result);
      return result;
    }, options.restorePreview, options.scheduler);
  }

  run(command: SchematicPropertyBatchCommand) {
    this.flush();
    const result = executeSchematicPropertyBatchCommand(this.options.document, this.options.selection(), command);
    if (result.kind === "rejected") this.options.status(result.status);
    if (result.changed) {
      if (result.rebuildCounters) this.options.rebuildCounters();
      this.options.render(result);
      this.options.commit();
      this.options.status(result.status);
    }
    return result;
  }

  begin(kind: SchematicPropertyEditKind) {
    if (this.edit.activeKind !== kind) this.flush();
    const started = this.edit.begin(kind, this.options.selection());
    if (!started) this.options.status("Select one or more editable schematic objects.");
    return started;
  }

  preview(kind: SchematicPropertyEditKind, command: SchematicPropertyBatchCommand) {
    if (this.edit.activeKind !== kind && !this.begin(kind)) return;
    this.edit.input(kind, command);
  }

  commit(kind: SchematicPropertyEditKind, command: SchematicPropertyBatchCommand) {
    if (this.edit.activeKind !== kind && !this.begin(kind)) return;
    this.finish(this.edit.commit(kind, command));
  }

  cancel(kind: SchematicPropertyEditKind) {
    if (this.edit.cancel(kind).restored) this.options.status("Property edit cancelled.");
  }

  flush() { this.finish(this.edit.commitPending()); }
  dispose() { this.edit.dispose(); }

  private finish(result: SchematicPropertyEditCommitResult) {
    if (result.kind === "inactive") return;
    if (result.changed) {
      if (result.rebuildCounters) this.options.rebuildCounters();
      this.options.commit();
    }
    if (!result.changed || result.kind === "invalid") this.options.renderPanel();
    if (result.status) this.options.status(result.status);
  }

  private setSelectedComponentCell(type: ComponentType) {
    this.run({ kind: "component-cell", type });
  }

  private setSelectedComponentColor(color: string | null) {
    this.run({ kind: "component-color", color });
  }

  private setSelectedNetworkColor(color: string | null) {
    this.run({ kind: "ink-color", color });
  }

  private setSelectedWireDecoration(patch: WireDecorationPatch) {
    this.run({ kind: "wire-decoration", patch });
  }

  private setSelectedComponentRef(ref: string) {
    this.run({ kind: "component-ref", ref });
  }

  private setSelectedComponentLabelVisibility(visible: boolean) {
    this.run({ kind: "component-label-visibility", visible });
  }

  private setSelectedComponentValueVisibility(visible: boolean) {
    this.run({ kind: "component-value-visibility", visible });
  }

  private setSelectedComponentGainPolarity(polarity: GainPolarity) {
    this.run({ kind: "component-gain-polarity", polarity });
  }

  private setSelectedComponentDifferentialOutputs(same: boolean) {
    this.run({ kind: "component-differential-outputs", same });
  }

  private setSelectedComponentValue(value: string) {
    this.run({ kind: "component-value", value });
  }

  private setSelectedComponentVariant(variantId: ComponentVariantId) {
    this.run({
      kind: "component-variant",
      variantId,
      moveBehavior: this.options.moveBehavior()
    });
  }

  private setSelectedComponentClock(clock: ComponentClock) {
    this.run({ kind: "component-clock", clock });
  }

  private setSelectedComponentDffSetting(
    property: DffSettingProperty,
    value: DffSettings[DffSettingProperty]
  ) {
    this.run({ kind: "component-dff-setting", property, value });
  }

  private setSelectedComponentTimeDomain(timeDomain: FunctionBlockTimeDomain) {
    this.run({ kind: "component-time-domain", timeDomain });
  }

  private setSelectedComponentFilterKind(filterKind: FilterKind) {
    this.run({ kind: "component-filter-kind", filterKind });
  }

  private setSelectedComponentMosView(patch: Partial<MosViewSettings>) {
    this.run({
      kind: "component-mos-view",
      patch,
      moveBehavior: this.options.moveBehavior()
    });
  }

  private setSelectedComponentTransistorCircle(visible: boolean) {
    this.run({ kind: "component-transistor-circle", visible });
  }

  private setSelectedComponentPinVisibility(pinId: string, visible: boolean) {
    this.run({ kind: "component-pin-visibility", pinId, visible });
  }

  private setSelectedComponentPinMode(pinId: string, mode: OperatorPinMode) {
    this.run({ kind: "component-pin-mode", pinId, mode });
  }

  private setSelectedComponentPinSymbolVisibility(pinId: string, visible: boolean) {
    this.run({
      kind: "component-pin-symbol-visibility",
      pinId,
      visible
    });
  }

  private setSelectedNoteBackground(value: string | null) {
    this.run({ kind: "note-background", color: value });
  }

  private setSelectedNetLabelName(value: string) {
    this.run({ kind: "net-label-name", name: value });
  }

  callbacks(special: SchematicPropertyPanelControllerCallbacks): SchematicPropertyPanelControllerCallbacks {
    return {
      ...special,
      onComponentInductorLayoutChange: (layout) => this.run({ kind: "component-inductor-layout", layout }),
      onComponentCellChange: (value) => this.setSelectedComponentCell(value),
      onComponentColorChange: (value) => this.setSelectedComponentColor(value),
      onComponentColorEditStart: () => this.begin("component-color"),
      onComponentColorInput: (value) => this.preview(
        "component-color",
        { kind: "component-color", color: value }
      ),
      onComponentColorCommit: (value) => this.commit(
        "component-color",
        { kind: "component-color", color: value }
      ),
      onComponentColorCancel: () => this.cancel("component-color"),
      onNetworkColorChange: (value) => this.setSelectedNetworkColor(value),
      onNetworkColorEditStart: () => this.begin("network-color"),
      onNetworkColorInput: (value) => this.preview(
        "network-color",
        { kind: "ink-color", color: value }
      ),
      onNetworkColorCommit: (value) => this.commit(
        "network-color",
        { kind: "ink-color", color: value }
      ),
      onNetworkColorCancel: () => this.cancel("network-color"),
      onWireLineWidthChange: (value) => this.setSelectedWireDecoration({ lineWidth: value }),
      onWireStartMarkerChange: (value) => this.setSelectedWireDecoration({ startMarker: value }),
      onWireEndMarkerChange: (value) => this.setSelectedWireDecoration({ endMarker: value }),
      onWireDigitalSlashChange: (visible) => this.setSelectedWireDecoration({ digitalSlash: visible }),
      onWireDigitalLabelChange: (value) => this.setSelectedWireDecoration({ digitalLabel: value }),
      onWireDigitalLabelEditStart: () => this.begin("wire-digital-label"),
      onWireDigitalLabelInput: (value) => this.preview(
        "wire-digital-label",
        { kind: "wire-decoration", patch: { digitalLabel: value } }
      ),
      onWireDigitalLabelCommit: (value) => this.commit(
        "wire-digital-label",
        { kind: "wire-decoration", patch: { digitalLabel: value } }
      ),
      onWireDigitalLabelCancel: () => this.cancel("wire-digital-label"),
      onComponentRefChange: (value) => this.setSelectedComponentRef(value),
      onComponentRefEditStart: () => this.begin("component-ref"),
      onComponentRefInput: (value) => this.preview(
        "component-ref",
        { kind: "component-ref", ref: value }
      ),
      onComponentRefCommit: (value) => this.commit(
        "component-ref",
        { kind: "component-ref", ref: value }
      ),
      onComponentRefCancel: () => this.cancel("component-ref"),
      onComponentLabelVisibilityChange: (visible) => this.setSelectedComponentLabelVisibility(visible),
      onComponentValueVisibilityChange: (visible) => this.setSelectedComponentValueVisibility(visible),
      onComponentGainPolarityChange: (polarity) => this.setSelectedComponentGainPolarity(polarity),
      onComponentDifferentialOutputsChange: (same) => this.setSelectedComponentDifferentialOutputs(same),
      onVoltageSourceFieldChange: (key, value) => this.run({ kind: "voltage-source-field", key, value }),
      onVoltageSourceFieldEditStart: key => this.begin(`source-field:${key}`),
      onVoltageSourceFieldCommit: (key, value) => this.commit(
        `source-field:${key}`, { kind: "voltage-source-field", key, value }
      ),
      onVoltageSourceFieldCancel: key => this.cancel(`source-field:${key}`),
      onComponentValueChange: (value) => this.setSelectedComponentValue(value),
      onComponentValueEditStart: () => this.begin("component-value"),
      onComponentValueInput: (value) => this.preview(
        "component-value",
        { kind: "component-value", value }
      ),
      onComponentValueCommit: (value) => this.commit(
        "component-value",
        { kind: "component-value", value }
      ),
      onComponentValueCancel: () => this.cancel("component-value"),
      onRectanglePropertyEditStart: (property) =>
        this.begin(rectanglePropertyEditKind(property)),
      onTrianglePinsEditStart: edge => this.begin(`triangle-pins:${edge}`),
      onTrianglePinsInput: (edge, value) => this.preview(`triangle-pins:${edge}`, { kind: "triangle-pins", edge, value }),
      onTrianglePinsCommit: (edge, value) => this.commit(`triangle-pins:${edge}`, { kind: "triangle-pins", edge, value }),
      onTrianglePinsCancel: edge => this.cancel(`triangle-pins:${edge}`),
      onRectanglePropertyInput: (property, value) => this.preview(
        rectanglePropertyEditKind(property),
        rectanglePropertyCommand(property, value)
      ),
      onRectanglePropertyCommit: (property, value) => this.commit(
        rectanglePropertyEditKind(property),
        rectanglePropertyCommand(property, value)
      ),
      onRectanglePropertyCancel: (property) =>
        this.cancel(rectanglePropertyEditKind(property)),
      onComponentVariantChange: (value) => this.setSelectedComponentVariant(value),
      onComponentScaleChange: scale => this.run({ kind: "component-scale", scale }),
      onComponentClockChange: (value) => this.setSelectedComponentClock(value),
      onComponentDffSettingChange: (property, value) =>
        this.setSelectedComponentDffSetting(property, value),
      onComponentTimeDomainChange: (value) => this.setSelectedComponentTimeDomain(value),
      onComponentFilterKindChange: (value) => this.setSelectedComponentFilterKind(value),
      onComponentMosViewChange: (patch) => this.setSelectedComponentMosView(patch),
      onComponentTransistorCircleChange: (visible) => this.setSelectedComponentTransistorCircle(visible),
      onComponentMosThickGateChange: (thick) => this.run({ kind: "component-mos-thick-gate", thick }),
      onComponentPinVisibilityChange: (pinId, visible) => this.setSelectedComponentPinVisibility(pinId, visible),
      onComponentPinModeChange: (pinId, mode) => this.setSelectedComponentPinMode(pinId, mode),
      onComponentPinSymbolVisibilityChange: (pinId, visible) => this.setSelectedComponentPinSymbolVisibility(pinId, visible),
      onNoteBackgroundChange: (value) => this.setSelectedNoteBackground(value),
      onNoteTextColorChange: color => this.run({ kind: "note-text-color", color }),
      onNoteTextColorEditStart: () => this.begin("note-text-color"),
      onNoteTextColorInput: color => this.preview("note-text-color", { kind: "note-text-color", color }),
      onNoteTextColorCommit: color => this.commit("note-text-color", { kind: "note-text-color", color }),
      onNoteTextColorCancel: () => this.cancel("note-text-color"),
      onNoteBackgroundEditStart: () => this.begin("note-background"),
      onNoteBackgroundInput: (value) => this.preview(
        "note-background",
        { kind: "note-background", color: value }
      ),
      onNoteBackgroundCommit: (value) => this.commit(
        "note-background",
        { kind: "note-background", color: value }
      ),
      onNoteBackgroundCancel: () => this.cancel("note-background"),
      onNetLabelChange: (value) => this.setSelectedNetLabelName(value),
      onNetLabelEditStart: () => this.begin("net-label"),
      onNetLabelInput: (value) => this.preview(
        "net-label",
        { kind: "net-label-name", name: value }
      ),
      onNetLabelCommit: (value) => this.commit(
        "net-label",
        { kind: "net-label-name", name: value }
      ),
      onNetLabelCancel: () => this.cancel("net-label")
    };
  }
}

const RECTANGLE_EDIT_KINDS = {
  width: "rectangle-width",
  height: "rectangle-height",
  leftPins: "rectangle-left-pins",
  rightPins: "rectangle-right-pins",
  topPins: "rectangle-top-pins",
  bottomPins: "rectangle-bottom-pins"
} as const satisfies Record<RectangleProperty, SchematicPropertyEditKind>;

function rectanglePropertyEditKind(property: RectangleProperty) {
  return RECTANGLE_EDIT_KINDS[property];
}

function rectanglePropertyCommand(property: RectangleProperty, value: string): SchematicPropertyBatchCommand {
  return { kind: rectanglePropertyEditKind(property), value };
}
