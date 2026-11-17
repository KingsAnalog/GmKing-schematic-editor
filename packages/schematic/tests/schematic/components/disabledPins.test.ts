import { fixtureDocument, authorFixture } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG, getComponentVariants, resolveComponentDef, resolveComponentPinOptions } from "../../../src/schematic/catalog";
import { componentPinPoint, buildConnectivity } from "../../../src/schematic/connectivity";
import { componentPinPoints } from "../../../src/schematic/document/documentGeometryModel";
import { contentFromDocument, createEmptySchematicDocument, documentFromContent } from "../../../src/schematic/document/documentModel";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import { normalizeDocumentWires } from "../../../src/schematic/document/documentWires";
import { setComponentPinVisibility } from "../../../src/schematic/pinConfigurationModel";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { parseSchematicContent, serializeSchematicContent } from "../../../src/schematic/schematicDocumentCodec";
import { beginSelectionMoveTransaction, applySelectionMoveTransaction } from "../../../src/schematic/selection/selectionMoveTransaction";
import { beginWireSegmentMove, projectWireSegmentMove, syncWireSegmentMoveTopology } from "../../../src/schematic/wire/wireSegmentMoveModel";
import type { ComponentType, WireRouteMode } from "../../../src/schematic/types";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

const optionalPins = Object.values(COMPONENT_CATALOG).filter(def => def.editablePinVisibility).flatMap(def =>
  (def.editablePinVisibilityIds ?? def.pins.map(pin => pin.id)).map(pinId => [def.type, pinId] as const)
);

function fixture(type: ComponentType, pinId: string, options: {
  variantId?: string;
  rotation?: number;
  mirrored?: boolean;
  interior?: boolean;
  routeMode?: WireRouteMode;
} = {}) {
  const component = fixtureComponent(type, "X1", 200, 200, options.rotation);
  if (options.variantId) component.variantId = options.variantId;
  component.mirrored = options.mirrored ?? false;
  setComponentPinVisibility(component, pinId, true);
  const point = componentPinPoint(component, pinId);
  const horizontal = Math.abs(point.x - component.x) > Math.abs(point.y - component.y);
  const tangent = horizontal ? { x: 0, y: 20 } : { x: 20, y: 0 };
  const outside = horizontal
    ? { x: point.x + Math.sign(point.x - component.x) * 80, y: point.y }
    : { x: point.x, y: point.y + Math.sign(point.y - component.y) * 80 };
  const points = options.interior ? [
    { x: point.x - tangent.x, y: point.y - tangent.y },
    { x: point.x + tangent.x, y: point.y + tangent.y }
  ] : [point, outside];
  const wire = fixtureWire("wire", points);
  wire.routeMode = options.routeMode ?? "orthogonal";
  const document = createEmptySchematicDocument();
  document.components.push(component);
    authorFixture(document);
  document.wires.push(wire);
    authorFixture(document);
  const selection = { selectedIds: [component.id], selectedNoteIds: [] };
  return { component, document, selection, point, tangent };
}

describe("disabled pins leave the effective component definition", () => {
  it.each(optionalPins)("keeps %s.%s configurable and persistent without exposing a terminal", (type, pinId) => {
    const { component, document, selection, point } = fixture(type, pinId);
    const initial = contentFromDocument(document);
    const history = createSchematicContentHistoryAdapter(initial);
    const disable = executeSchematicPropertyBatchCommand(document, selection,
      { kind: "component-pin-visibility", pinId, visible: false });
    expect(disable).toMatchObject({ changed: true, historyIntent: "push" });
    history.push(contentFromDocument(document));
    expect(resolveComponentDef(component).pins.some(pin => pin.id === pinId)).toBe(false);
    expect(resolveComponentPinOptions(component).some(pin => pin.id === pinId)).toBe(true);
    expect(componentPinPoints(component).has(pinId)).toBe(false);
    expect(() => componentPinPoint(component, pinId)).toThrow("Unknown pin");
    expect(makeComponentCell(component).getPort(pinId)).toBeUndefined();
    expect(renderComponentSvg(component)).not.toContain(`data-pin-id="${pinId}"`);
    const panel = buildSchematicPropertyPanelInput({
      document, hasSelection: true,
      targets: fixtureDocument({ components: [component], wires: [], notes: [], netLabels: [], junctionPoints: [] })
    });
    expect(panel.component?.pinSettings?.find(pin => pin.id === pinId)?.visible).toEqual({ state: "uniform", value: false });
    const restored = documentFromContent(parseSchematicContent(serializeSchematicContent(contentFromDocument(document))));
    expect(resolveComponentDef(restored.components[0]).pins.some(pin => pin.id === pinId)).toBe(false);
    const enable = executeSchematicPropertyBatchCommand(restored, selection,
      { kind: "component-pin-visibility", pinId, visible: true });
    expect(enable).toMatchObject({ changed: true, historyIntent: "push" });
    expect(componentPinPoint(restored.components[0], pinId)).toEqual(point);
    expect(history.undo()).toEqual(initial);
    expect(resolveComponentDef(history.redo()!.components[0]).pins.some(pin => pin.id === pinId)).toBe(false);
  });

  it.each(optionalPins)("never stretches wires from disabled %s.%s across views and orientations", (type, pinId) => {
    const variants: (string | undefined)[] = getComponentVariants(type).map(variant => variant.id);
    if (variants.length === 0) variants.push(undefined);
    for (const variantId of variants) for (const rotation of [0, 90, 180, 270]) for (const mirrored of [false, true]) {
      for (const interior of [false, true]) for (const routeMode of ["orthogonal", "freeAngle"] as const) {
        for (const visible of [false, true]) {
          const { component, document } = fixture(type, pinId, { variantId, rotation, mirrored, interior, routeMode });
          setComponentPinVisibility(component, pinId, visible);
          const before = structuredClone(document.wires);
          const transaction = beginSelectionMoveTransaction({ document, activeComponentId: component.id, selectedIds: new Set([component.id]) })!;
          component.x += 40;
          component.y += 20;
          applySelectionMoveTransaction({ document, transaction, moveBehavior: "stretch" });
          if (visible) expect(document.wires).not.toEqual(before);
          else expect(document.wires).toEqual(before);
        }
      }
    }
  });

  it.each(optionalPins)("does not join crossing wires at disabled %s.%s during normalization or reload", (type, pinId) => {
    for (const visible of [false, true]) {
      const { component, document, point } = fixture(type, pinId);
      setComponentPinVisibility(component, pinId, visible);
      document.wires = [
        fixtureWire("horizontal", [{ x: point.x - 20, y: point.y }, { x: point.x + 20, y: point.y }]),
        fixtureWire("vertical", [{ x: point.x, y: point.y - 20 }, { x: point.x, y: point.y + 20 }])
      ];
    authorFixture(document);
      document.wires = normalizeDocumentWires(document);
    authorFixture(document);
      const restored = documentFromContent(parseSchematicContent(serializeSchematicContent(contentFromDocument(document))));
      const connectivity = buildConnectivity(restored);
      expect(new Set(restored.wires.map(wire => connectivity.rootOfWire(wire.id))).size).toBe(visible ? 1 : 2);
    }
  });

  it.each(optionalPins)("does not anchor a dragged wire to disabled %s.%s", (type, pinId) => {
    for (const visible of [false, true]) {
      const { component, document, point, tangent } = fixture(type, pinId);
      setComponentPinVisibility(component, pinId, visible);
      const transaction = beginWireSegmentMove(document, "wire", point)!;
      const paths = projectWireSegmentMove(transaction, { x: point.x + tangent.x * 2, y: point.y + tangent.y * 2 });
      document.wires[0].points = paths.get("wire")!;
      syncWireSegmentMoveTopology(document, transaction, paths);
      expect(document.wires.length).toBe(visible ? 2 : 1);
    }
  });

  it("does not create a wire to a stationary disabled pin when another component moves away", () => {
    const { component, document, point } = fixture("plus", "top");
    setComponentPinVisibility(component, "top", false);
    const resistor = fixtureComponent("resistor", "R1", point.x + 40, point.y);
    document.components.push(resistor);
    authorFixture(document);
    document.wires = [];
    authorFixture(document);
    expect(componentPinPoint(resistor, "p")).toEqual(point);
    const transaction = beginSelectionMoveTransaction({ document, activeComponentId: resistor.id, selectedIds: new Set([resistor.id]) })!;
    resistor.x += 40;
    applySelectionMoveTransaction({ document, transaction, moveBehavior: "stretch" });
    expect(document.wires).toEqual([]);
  });

  it("retains role settings for disabled pins and supports batch re-enabling mixed states", () => {
    const first = fixtureComponent("plus", "SUM1", 100, 100);
    first.values["pinMode:top"] = "negative";
    first.values["pinSymbolVisible:top"] = "false";
    const second = fixtureComponent("plus", "SUM2", 300, 100);
    setComponentPinVisibility(second, "top", true);
    const document = createEmptySchematicDocument();
    document.components.push(first, second);
    authorFixture(document);
    const restored = documentFromContent(parseSchematicContent(serializeSchematicContent(contentFromDocument(document))));
    const result = executeSchematicPropertyBatchCommand(restored, { selectedIds: [first.id, second.id], selectedNoteIds: [] },
      { kind: "component-pin-visibility", pinId: "top", visible: true });
    expect(result).toMatchObject({ changed: true, historyIntent: "push" });
    expect(restored.components.every(component => resolveComponentDef(component).pins.some(pin => pin.id === "top"))).toBe(true);
    expect(restored.components[0].values).toMatchObject({ "pinMode:top": "negative", "pinSymbolVisible:top": "false" });
  });
});
