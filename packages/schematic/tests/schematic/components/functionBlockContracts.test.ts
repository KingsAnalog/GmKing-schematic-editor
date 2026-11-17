import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { analyzeSchematic } from "../../../src/schematic/analysis/analysis";
import { resolveComponentAnalysisModel } from "../../../src/schematic/analysis/componentAnalysisRegistry";
import {
  COMPONENT_CATALOG,
  getComponentDef,
  getComponentVariants,
  resolveComponentDef
} from "../../../src/schematic/catalog";
import { componentLabelVisible } from "../../../src/schematic/componentPropertyModel";
import { buildCopySource, instantiateCopyAt } from "../../../src/schematic/copyModel";
import {
  DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN,
  DEFAULT_FUNCTION_BLOCK_VIEW,
  DELAY_VIEW_OPTIONS,
  DIFFERENTIATOR_VIEW_OPTIONS,
  FILTER_KIND_OPTIONS,
  FILTER_KIND_VALUE_KEY,
  FILTER_VIEW_OPTIONS,
  FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS,
  FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY,
  INTEGRATOR_VIEW_OPTIONS,
  resolveFunctionBlockModel,
  type FunctionBlockType
} from "../../../src/schematic/functionBlockModel";
import {
  parseSchematicDocumentFile,
  serializeSchematicDocumentFile,
  SchematicDocumentFileError
} from "../../../src/schematic/schematicDocumentFile";
import { buildSchematicSelectionNetlist } from "../../../src/schematic/selection/selectionNetlist";
import type { ComponentInstance } from "../../../src/schematic/types";
import { COMPONENT_CLOCK_VALUE_KEY } from "../../../src/schematic/clockModel";
import { emptyDoc, fixtureComponent } from "../support/fixtures";

const FUNCTION_BLOCK_TYPES: readonly FunctionBlockType[] = [
  "integrator",
  "differentiator",
  "delay",
  "filter"
];

const EXPECTED_PREFIX: Readonly<Record<FunctionBlockType, string>> = {
  integrator: "INT",
  differentiator: "DIF",
  delay: "DLY",
  filter: "FLT"
};

const EXPECTED_VARIANTS = {
  integrator: INTEGRATOR_VIEW_OPTIONS.map(({ id }) => id),
  differentiator: DIFFERENTIATOR_VIEW_OPTIONS.map(({ id }) => id),
  delay: DELAY_VIEW_OPTIONS.map(({ id }) => id),
  filter: FILTER_VIEW_OPTIONS.map(({ id }) => id)
} as const;

describe("function block catalog and data contracts", () => {
  it("registers function blocks with hidden labels and gain fields for calculus blocks", () => {
    expect(Object.keys(COMPONENT_CATALOG)).toEqual(expect.arrayContaining([...FUNCTION_BLOCK_TYPES]));

    FUNCTION_BLOCK_TYPES.forEach((type) => {
      const def = getComponentDef(type);
      const instance = fixtureComponent(type, `${EXPECTED_PREFIX[type]}1`, 0, 0);
      expect(def, type).toMatchObject({
        type,
        terminalClass: "twoTerminal",
        valuePrefix: EXPECTED_PREFIX[type],
        defaultLabelVisible: false,
        defaultVariantId: DEFAULT_FUNCTION_BLOCK_VIEW[type],
        symbol: "function-block"
      });
      expect(resolveComponentAnalysisModel(instance), type).toBe("blackBox");
      const hasGain = type === "integrator" || type === "differentiator";
      expect(def.valueKey, type).toBe(hasGain ? "gain" : type === "delay" ? "delay" : undefined);
      expect(def.valueLabel, type).toBe(hasGain ? "Gain" : type === "delay" ? "Value" : undefined);
      expect(def.valueUnit, type).toBeUndefined();
      expect(componentLabelVisible(instance), type).toBe(false);
      expect(def.pins.map(({ id, role }) => ({ id, role })), type).toEqual([
        { id: "in", role: "in" },
        { id: "out", role: "out" }
      ]);
      expect(resolveFunctionBlockModel(instance), type).toMatchObject({
        timeDomain: DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN,
        variantId: DEFAULT_FUNCTION_BLOCK_VIEW[type]
      });
    });
    expect(resolveFunctionBlockModel(fixtureComponent("delay", "DLY1", 0, 0)))
      .toMatchObject({ variantId: "transfer", timeDomain: "continuous" });
  });

  it("publishes every view and resolves every CT/DT catalog geometry from the shared model", () => {
    FUNCTION_BLOCK_TYPES.forEach((type) => {
      expect(getComponentVariants(type).map(({ id }) => id), type).toEqual(EXPECTED_VARIANTS[type]);
      EXPECTED_VARIANTS[type].forEach((variantId) => {
        FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS.forEach(({ value: timeDomain }) => {
          const instance = fixtureComponent(type, `${EXPECTED_PREFIX[type]}1`, 0, 0);
          instance.variantId = variantId;
          instance.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY] = timeDomain;
          const model = resolveFunctionBlockModel(instance)!;
          const def = resolveComponentDef(instance);
          expect(model.timeDomain, `${type}:${variantId}:${timeDomain}`).toBe(timeDomain);
          expect(def.variantId, `${type}:${variantId}:${timeDomain}`).toBe(variantId);
          expect(def.size, `${type}:${variantId}:${timeDomain}`).toEqual(model.size);
          expect(def.pins, `${type}:${variantId}:${timeDomain}`).toEqual(model.pins);
          expect(def.pins.map((pin) => pin.id), `${type}:${variantId}:${timeDomain}`)
            .toEqual(["in", "out"]);
        });
      });
    });
  });

  it("resolves optional clocks independently from every function-block View", () => {
    FUNCTION_BLOCK_TYPES.forEach((type) => {
      const instance = fixtureComponent(type, `${EXPECTED_PREFIX[type]}1`, 0, 0);
      instance.values[COMPONENT_CLOCK_VALUE_KEY] = "falling";
      const model = resolveFunctionBlockModel(instance)!;
      const def = resolveComponentDef(instance);
      expect(model.clock, type).toBe("falling");
      expect(def.terminalClass, type).toBe("threeTerminal");
      expect(def.pins.map((pin) => pin.id), type).toEqual(["in", "out", "clk"]);
    });
  });

  it("resolves all filter kind, view, and time-domain combinations", () => {
    FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS.forEach(({ value: timeDomain }) => {
      FILTER_KIND_OPTIONS.forEach(({ value: filterKind }) => {
        FILTER_VIEW_OPTIONS.forEach(({ id: variantId }) => {
          const instance = fixtureComponent("filter", "FLT1", 0, 0);
          instance.variantId = variantId;
          instance.values[FILTER_KIND_VALUE_KEY] = filterKind;
          instance.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY] = timeDomain;
          const model = resolveFunctionBlockModel(instance)!;
          const def = resolveComponentDef(instance);
          expect(model, `${filterKind}:${variantId}:${timeDomain}`)
            .toMatchObject({ filterKind, variantId, timeDomain });
          expect(def.size, `${filterKind}:${variantId}:${timeDomain}`).toEqual(model.size);
          expect(def.pins, `${filterKind}:${variantId}:${timeDomain}`).toEqual(model.pins);
        });
      });
    });
  });

  it("blocks symbolic analysis for each missing function-block model", () => {
    FUNCTION_BLOCK_TYPES.forEach((type) => {
      const ref = `${EXPECTED_PREFIX[type]}1`;
      const component = fixtureComponent(type, ref, 0, 0);
      const result = analyzeSchematic(
        { ...emptyDoc(), components: [component] },
        { inputP: "", inputN: "", outputP: "", outputN: "" }
      );
      expect(result.ok, type).toBe(false);
      expect(result.diagnostics, type).toContain(
        `${ref} is a black box without a symbolic analysis model.`
      );
    });
  });

  it("exports selection netlists with in then out pin order", () => {
    FUNCTION_BLOCK_TYPES.forEach((type) => {
      const ref = `${EXPECTED_PREFIX[type]}1`;
      const component = fixtureComponent(type, ref, 0, 0);
      const exported = buildSchematicSelectionNetlist(
        { ...emptyDoc(), components: [component] },
        [component.id]
      );
      expect(exported?.componentCount, type).toBe(1);
      expect(exported?.text, type).toContain(
        `    ${ref} (${ref}_IN ${ref}_OUT) ${getComponentDef(type).hotLabel}`
      );
    });
  });

  it("preserves views, time domains, and filter kind through copy and file round trips", () => {
    const components = [
      configuredComponent("integrator", "INT1", "transfer", 0, {
        [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete"
      }),
      configuredComponent("differentiator", "DIF1", "transfer", 120, {
        [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete"
      }),
      configuredComponent("delay", "DLY1", "transfer", 240, {
        [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "continuous"
      }),
      configuredComponent("filter", "FLT1", "waves", 360, {
        [FILTER_KIND_VALUE_KEY]: "bandstop",
        [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete"
      })
    ];
    const source = buildCopySource(fixtureDocument({
      components,
      wires: [],
      netLabels: [],
      notes: [],
      junctionPoints: [],
      junctionKeys: new Set(),

      junctionAppearances: []
    }));
    let nextId = 0;
    const copied = instantiateCopyAt(
      { source, anchor: { x: 0, y: 0 } },
      { x: 0, y: 200 },
      {
        preview: false,
        nextComponentRef: (type) => `${EXPECTED_PREFIX[type as FunctionBlockType]}2`,
        createId: () => `copy-${++nextId}`
      }
    ).components;

    expect(copied.map(({ type, ref, variantId }) => ({ type, ref, variantId }))).toEqual([
      { type: "integrator", ref: "INT2", variantId: "transfer" },
      { type: "differentiator", ref: "DIF2", variantId: "transfer" },
      { type: "delay", ref: "DLY2", variantId: "transfer" },
      { type: "filter", ref: "FLT2", variantId: "waves" }
    ]);
    expect(copied.map(({ values }) => values)).toEqual([
      { [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete" },
      { [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete" },
      { [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "continuous" },
      {
        [FILTER_KIND_VALUE_KEY]: "bandstop",
        [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete"
      }
    ]);

    const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(fixtureDocument({
      ...emptyDoc(),
      components: copied
    })));
    expect(restored.components).toEqual(copied);
    restored.components.forEach((component) => {
      expect(resolveComponentDef(component).pins.map((pin) => pin.id)).toEqual(["in", "out"]);
    });
  });

  it("rejects invalid persisted filter kinds", () => {
    const filter = fixtureComponent("filter", "FLT1", 0, 0);
    filter.values[FILTER_KIND_VALUE_KEY] = "invalid";

    expect(() => serializeSchematicDocumentFile(fixtureDocument({ components: [filter] })))
      .toThrow(SchematicDocumentFileError);

    delete filter.values[FILTER_KIND_VALUE_KEY];
    const encoded = JSON.parse(serializeSchematicDocumentFile(fixtureDocument({
      ...emptyDoc(),
      components: [filter]
    }))) as { schematic: { components: Array<{ values: Record<string, string> }> } };
    encoded.schematic.components[0].values[FILTER_KIND_VALUE_KEY] = "invalid";
    expect(() => parseSchematicDocumentFile(JSON.stringify(encoded)))
      .toThrow(SchematicDocumentFileError);
  });

  it("rejects invalid persisted function-block time domains", () => {
    const integrator = fixtureComponent("integrator", "INT1", 0, 0);
    integrator.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY] = "invalid";

    expect(() => serializeSchematicDocumentFile(fixtureDocument({ components: [integrator] })))
      .toThrow(SchematicDocumentFileError);

    delete integrator.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY];
    const encoded = JSON.parse(serializeSchematicDocumentFile(fixtureDocument({
      ...emptyDoc(),
      components: [integrator]
    }))) as { schematic: { components: Array<{ values: Record<string, string> }> } };
    encoded.schematic.components[0].values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY] = "invalid";
    expect(() => parseSchematicDocumentFile(JSON.stringify(encoded)))
      .toThrow(SchematicDocumentFileError);
  });
});

function configuredComponent(
  type: FunctionBlockType,
  ref: string,
  variantId: string,
  x: number,
  values: Record<string, string> = {}
): ComponentInstance {
  return {
    ...fixtureComponent(type, ref, x, 0),
    variantId,
    values
  };
}
