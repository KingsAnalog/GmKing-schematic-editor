import { vi } from "vitest";

// The second renderer exists only in tests. Production Abidi remains disabled.
vi.mock("../../../src/schematic/symbolTemplateModel", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../src/schematic/symbolTemplateModel")>();
  const second = { id: "abidi" as const, label: "test appearance", available: true };
  return {
    ...actual,
    SYMBOL_TEMPLATES: [actual.SYMBOL_TEMPLATES[0], second],
    resolveSymbolTemplate: (id?: unknown) => id === "abidi" ? second : actual.resolveSymbolTemplate(id)
  };
});

vi.mock("../../../src/schematic/symbolTemplateRenderers", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../src/schematic/symbolTemplateRenderers")>();
  return {
    ...actual,
    getSymbolTemplateRenderer: (id?: "razavi" | "abidi") => {
      const razavi = actual.getSymbolTemplateRenderer("razavi");
      return id === "abidi" ? (instance: Parameters<typeof razavi>[0], options: Parameters<typeof razavi>[1]) => {
        const model = razavi(instance, options);
        return {
          ...model, path: "M 33 33 L 47 43 L 57 33", symbolStrokeWidth: 3,
          switchBladePath: instance.type === "switch" && !options.preview ? "M 36 36 L 58 58" : model.switchBladePath,
          labelText: "TEST", labelLayout: { ...model.labelLayout, fontSize: 14 },
          refLabelHeadFontSize: 12
        };
      } : actual.getSymbolTemplateRenderer(id);
    }
  };
});
