import { describe, expect, it } from "vitest";
import {
  SchematicPropertyPanelController,
  type SchematicPropertyPanelInput
} from "../../../src/schematic/propertyPanelController";
import type { ComponentType } from "../../../src/schematic/types";

class FakeClassList {
  private readonly names = new Set<string>();

  contains(name: string) {
    return this.names.has(name);
  }

  remove(name: string) {
    this.names.delete(name);
  }

  toggle(name: string, force?: boolean) {
    const enabled = force ?? !this.names.has(name);
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }
}

class FakeDocument {
  createElement(tagName: string) {
    return new FakeElement(tagName, this);
  }
}

class FakeElement {
  hidden = false;
  checked = false;
  indeterminate = false;
  disabled = false;
  textContent: string | null = null;
  value = "";
  placeholder = "";
  ariaPressed = "false";
  ariaChecked = "false";
  ariaLabel = "";
  blurCount = 0;
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument
  ) {}

  get parentElement() {
    return this.parent;
  }

  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]) {
    children.forEach((child) => this.appendChild(child));
  }

  replaceChildren(...children: FakeElement[]) {
    this.children.forEach((child) => {
      child.parent = null;
    });
    this.children.length = 0;
    children.forEach((child) => this.appendChild(child));
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatchEvent(event: FakeEvent) {
    (this.listeners.get(event.type) ?? []).forEach((listener) => listener(event));
  }

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  closest(selector: string): FakeElement | null {
    if (this.matches(selector)) return this;
    return this.parent?.closest(selector) ?? null;
  }

  blur() {
    this.blurCount += 1;
  }

  querySelector<T = FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T = FakeElement>(selector: string): T[] {
    const matches: FakeElement[] = [];
    const visit = (element: FakeElement) => {
      if (element.matches(selector)) matches.push(element);
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches as T[];
  }

  matches(selector: string): boolean {
    if (selector.includes(",")) {
      return selector.split(",").some((part): boolean => this.matches(part.trim()));
    }
    const dataKey = datasetKeyFromSelector(selector);
    return dataKey !== null && this.dataset[dataKey] !== undefined;
  }
}

class FakeEvent {
  defaultPrevented = false;
  readonly key: string;

  constructor(
    readonly type: string,
    readonly target: FakeElement,
    options: { key?: string } = {}
  ) {
    this.key = options.key ?? "";
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

type PropertyPanelFixture = ReturnType<typeof createPropertyPanelFixture>;

function datasetKeyFromSelector(selector: string) {
  const match = /^\[data-([^\]]+)\]$/.exec(selector);
  if (!match) return null;
  return match[1].replace(/-([a-z])/g, (_full, letter: string) => letter.toUpperCase());
}

function element(document: FakeDocument, dataKey: string) {
  const node = document.createElement("div");
  node.dataset[dataKey] = "";
  return node;
}

function cellInput(cellType: ComponentType) {
  return {
    cellType,
    labelVisible: true,
    color: null,
    cells: [{ type: cellType, label: cellType, disabled: false }]
  };
}

function uniform<T>(value: T) {
  return { state: "uniform", value } as const;
}

function mixed() {
  return { state: "mixed" } as const;
}

function isAggregate(value: unknown): value is { state: "uniform" | "mixed"; value?: unknown } {
  return !!value
    && typeof value === "object"
    && ((value as { state?: unknown }).state === "uniform"
      || (value as { state?: unknown }).state === "mixed");
}

function aggregate<T>(value: T | { state: "uniform"; value: T } | { state: "mixed" }) {
  return isAggregate(value) ? value : uniform(value);
}

function normalizePanelInput(input: any): SchematicPropertyPanelInput {
  const component = input.component
    ? {
        cellType: input.component.cellType === undefined
          ? undefined
          : aggregate(input.component.cellType),
        cells: input.component.cells,
        scale: input.component.scale,
        inductorLayout: input.component.inductorLayout === undefined ? undefined : aggregate(input.component.inductorLayout),
        ref: aggregate(input.component.ref),
        labelVisible: aggregate(input.component.labelVisible ?? true),
        color: aggregate(input.component.color ?? null),
        gainPolarity: input.component.gainPolarity === undefined
          ? undefined
          : aggregate(input.component.gainPolarity),
        differentialOutputsSame: input.component.differentialOutputsSame === undefined
          ? undefined
          : aggregate(input.component.differentialOutputsSame),
        value: input.component.value && typeof input.component.value === "object" && "label" in input.component.value
          ? input.component.value
          : input.component.showValue
            ? {
                label: input.component.valueLabel,
                value: aggregate(input.component.value),
                placeholder: input.component.valuePlaceholder,
                unit: input.component.valueUnit
              }
            : undefined,
        rectangle: input.component.rectangle
          ? Object.fromEntries(
              Object.entries(input.component.rectangle).map(([key, value]) => [key, aggregate(value)])
            )
          : undefined,
        timeDomain: input.component.timeDomain === undefined
          ? undefined
          : aggregate(input.component.timeDomain),
        variants: input.component.variants && !Array.isArray(input.component.variants)
          ? input.component.variants
          : input.component.variants?.length
            ? {
                label: input.component.variantLabel ?? "View",
                options: input.component.variants,
                value: aggregate(input.component.variantId)
              }
            : undefined,
        clock: input.component.clock
          ? {
              ...input.component.clock,
              value: aggregate(input.component.clock.value)
            }
          : undefined,
        dff: input.component.dff
          ? {
              clockEdge: aggregate(input.component.dff.clockEdge),
              setMode: aggregate(input.component.dff.setMode),
              setActiveLevel: aggregate(input.component.dff.setActiveLevel),
              resetMode: aggregate(input.component.dff.resetMode),
              resetActiveLevel: aggregate(input.component.dff.resetActiveLevel)
            }
          : undefined,
        filterKind: input.component.filterKind
          ? {
              options: input.component.filterKind.options,
              value: aggregate(input.component.filterKind.value)
            }
          : undefined,
        pinSettings: input.component.pinSettings?.map((pin: any) => ({
          ...pin,
          visible: aggregate(pin.visible),
          mode: pin.mode === undefined ? undefined : aggregate(pin.mode),
          symbolVisible: pin.symbolVisible === undefined ? undefined : aggregate(pin.symbolVisible),
          symbolEditable: pin.symbolEditable ?? pin.visible
        })),
        mosView: input.component.mosView
          ? {
              pins: aggregate(input.component.mosView.pins),
              gateStyle: aggregate(input.component.mosView.gateStyle),
              arrow: aggregate(input.component.mosView.arrow),
              noneAllowed: input.component.mosView.noneAllowed ?? true
            }
          : undefined,
        transistorCircle: input.component.transistorCircle === undefined
          ? undefined
          : aggregate(input.component.transistorCircle),
        mosThickGate: input.component.mosThickGate === undefined ? undefined : aggregate(input.component.mosThickGate),
        inductor: input.component.inductor
          ? {
              ...input.component.inductor,
              tap: aggregate(input.component.inductor.tap),
              dot: aggregate(input.component.inductor.dot)
            }
          : undefined
      }
    : undefined;
  const network = input.network
    ? {
        netName: input.network.netName === undefined ? undefined : aggregate(input.network.netName),
        label: input.network.label
          ? {
              ...input.network.label,
              name: aggregate(input.network.label.name)
            }
          : undefined,
        color: input.network.color === undefined
          ? undefined
          : isAggregate(input.network.color)
            ? input.network.color
            : aggregate(input.network.color.value),
        wire: input.network.wire
          ? {
              lineWidth: aggregate(input.network.wire.lineWidth),
              startMarker: aggregate(input.network.wire.startMarker),
              endMarker: aggregate(input.network.wire.endMarker),
              digitalSlash: aggregate(input.network.wire.digitalSlash),
              digitalLabel: input.network.wire.digitalSlash && input.network.wire.digitalLabel !== undefined
                ? aggregate(input.network.wire.digitalLabel)
                : undefined
            }
          : undefined
      }
    : undefined;
  const noteFormat = input.note ? aggregate(input.note.format) : undefined;
  const noteIsUniformMarkdown = noteFormat?.state === "uniform" && noteFormat.value === "markdown";
  const note = input.note && noteFormat
    ? {
        backgroundColor: aggregate(input.note.backgroundColor),
        fontSizePx: aggregate(input.note.fontSizePx),
        format: noteFormat,
        widthPx: noteIsUniformMarkdown && input.note.widthPx !== undefined
          ? aggregate(input.note.widthPx)
          : undefined
      }
    : undefined;
  return {
    ...input,
    component,
    network,
    note
  };
}

function createPropertyPanelFixture(callbacks: ConstructorParameters<typeof SchematicPropertyPanelController>[1] = {}) {
  const document = new FakeDocument();
  const root = document.createElement("section");
  const empty = root.appendChild(element(document, "propertyEmpty"));
  const netForm = root.appendChild(element(document, "propertyNetForm"));
  const netNameRow = netForm.appendChild(element(document, "propertyNetNameRow"));
  const netNameInput = netNameRow.appendChild(element(document, "propertyNetName"));
  const netLabelRow = netForm.appendChild(element(document, "propertyLabelRow"));
  const netLabelInput = netLabelRow.appendChild(element(document, "propertyNetLabel"));
  const networkColorRow = netForm.appendChild(element(document, "propertyNetworkColorRow"));
  const networkColorInput = networkColorRow.appendChild(element(document, "propertyNetworkColor"));
  networkColorInput.ariaLabel = "Wire or junction color";
  const networkColorSwatches = ["default", "#0072b2"].map((color) => {
    const swatch = element(document, "networkColorSwatch");
    swatch.dataset.networkColorSwatch = color;
    networkColorRow.appendChild(swatch);
    return swatch;
  });
  const wireLineWidthRow = netForm.appendChild(element(document, "propertyWireLineWidthRow"));
  const wireLineWidthControl = wireLineWidthRow.appendChild(element(document, "propertyWireLineWidth"));
  const wireStartMarkerRow = netForm.appendChild(element(document, "propertyWireStartMarkerRow"));
  const wireStartMarkerControl = wireStartMarkerRow.appendChild(element(document, "propertyWireStartMarker"));
  const wireEndMarkerRow = netForm.appendChild(element(document, "propertyWireEndMarkerRow"));
  const wireEndMarkerControl = wireEndMarkerRow.appendChild(element(document, "propertyWireEndMarker"));
  const wireDigitalSlashRow = netForm.appendChild(element(document, "propertyWireDigitalSlashRow"));
  const wireDigitalSlashInput = wireDigitalSlashRow.appendChild(element(document, "propertyWireDigitalSlash"));
  const wireDigitalLabelRow = netForm.appendChild(element(document, "propertyWireDigitalLabelRow"));
  const wireDigitalLabelInput = wireDigitalLabelRow.appendChild(element(document, "propertyWireDigitalLabel"));
  const netMessage = netForm.appendChild(element(document, "propertyNetMessage"));
  const componentForm = root.appendChild(element(document, "propertyComponentForm"));
  const cellRow = componentForm.appendChild(element(document, "propertyCellRow"));
  const cellSelect = cellRow.appendChild(element(document, "propertyCell"));
  const refInput = componentForm.appendChild(element(document, "propertyRef"));
  const labelVisibilityInput = componentForm.appendChild(element(document, "propertyLabelVisible"));
  const componentColorRow = componentForm.appendChild(element(document, "propertyComponentColorRow"));
  const componentColorInput = componentColorRow.appendChild(element(document, "propertyComponentColor"));
  componentColorInput.ariaLabel = "Symbol color";
  const componentColorSwatches = ["default", "#0072b2"].map((color) => {
    const swatch = element(document, "componentColorSwatch");
    swatch.dataset.componentColorSwatch = color;
    componentColorRow.appendChild(swatch);
    return swatch;
  });
  const gainPolarityRow = componentForm.appendChild(element(document, "propertyGainPolarityRow"));
  const gainPolarityControl = gainPolarityRow.appendChild(element(document, "propertyGainPolarity"));
  const gainPolarityButtons = [
    ["default", "Default"],
    ["positive", "+"],
    ["negative", "−"]
  ].map(([value, label]) => {
    const button = element(document, "propertyGainPolarityValue");
    button.dataset.propertyGainPolarityValue = value;
    button.textContent = label;
    gainPolarityControl.appendChild(button);
    return button;
  });
  const differentialOutputsRow = componentForm.appendChild(element(document, "propertyDifferentialOutputsRow"));
  const differentialOutputsInput = differentialOutputsRow.appendChild(element(document, "propertyDifferentialOutputsSame"));
  const valueRow = componentForm.appendChild(element(document, "propertyValueRow"));
  const valueLabel = valueRow.appendChild(element(document, "propertyValueLabel"));
  const valueInput = valueRow.appendChild(element(document, "propertyValue"));
  const valueUnit = valueRow.appendChild(element(document, "propertyValueUnit"));
  const inductorFields = componentForm.appendChild(element(document, "propertyInductorFields"));
  const inductorLayoutRow = componentForm.appendChild(element(document, "propertyInductorLayoutRow"));
  const inductorLayoutSelect = inductorLayoutRow.appendChild(element(document, "propertyInductorLayout"));
  const inductorTapControl = inductorFields.appendChild(element(document, "propertyInductorTap"));
  const inductorDotControl = inductorFields.appendChild(element(document, "propertyInductorDot"));
  const inductorCouplingList = inductorFields.appendChild(element(document, "propertyInductorCouplingList"));
  const inductorAddCouplingButton = inductorFields.appendChild(element(document, "propertyInductorAddCoupling"));
  const rectangleFields = componentForm.appendChild(element(document, "propertyRectangleFields"));
  const rectangleInputs = [
    "width",
    "height",
    "leftPins",
    "rightPins",
    "topPins",
    "bottomPins"
  ].map((property) => {
    const input = element(document, "propertyRectangle");
    input.dataset.propertyRectangle = property;
    rectangleFields.appendChild(input);
    return input;
  });
  const timeDomainRow = componentForm.appendChild(element(document, "propertyTimeDomainRow"));
  const timeDomainControl = timeDomainRow.appendChild(element(document, "propertyTimeDomain"));
  timeDomainControl.ariaLabel = "Function block domain";
  const timeDomainButtons = [
    ["continuous", "CT"],
    ["discrete", "DT"]
  ].map(([value, label]) => {
    const button = element(document, "propertyTimeDomainValue");
    button.dataset.propertyTimeDomainValue = value;
    button.textContent = label;
    timeDomainControl.appendChild(button);
    return button;
  });
  const variantRow = componentForm.appendChild(element(document, "propertyVariantRow"));
  const variantLabel = variantRow.appendChild(element(document, "propertyVariantLabel"));
  const variantSelect = variantRow.appendChild(element(document, "propertyVariant"));
  const variantSegmented = variantRow.appendChild(element(document, "propertyVariantSegmented"));
  const scaleRow = componentForm.appendChild(element(document, "propertyScaleRow"));
  const scaleSegmented = scaleRow.appendChild(element(document, "propertyScaleSegmented"));
  const clockRow = componentForm.appendChild(element(document, "propertyClockRow"));
  const clockSelect = clockRow.appendChild(element(document, "propertyClock"));
  const clockSegmented = clockRow.appendChild(element(document, "propertyClockSegmented"));
  const dffOptions = {
    clockEdge: [["rising", "Rising"], ["falling", "Falling"]],
    setMode: [["none", "Off"], ["synchronous", "Sync"], ["asynchronous", "Async"]],
    setActiveLevel: [["high", "High"], ["low", "Low"]],
    resetMode: [["none", "Off"], ["synchronous", "Sync"], ["asynchronous", "Async"]],
    resetActiveLevel: [["high", "High"], ["low", "Low"]]
  } as const;
  const dffRows = Object.entries(dffOptions).map(([property, options]) => {
    const row = componentForm.appendChild(element(document, "propertyDffRow"));
    row.dataset.propertyDffRow = property;
    const control = row.appendChild(element(document, "propertyDffControl"));
    control.dataset.propertyDffControl = property;
    options.forEach(([value, label]) => {
      const button = control.appendChild(element(document, "propertyDffSetting"));
      button.dataset.propertyDffSetting = property;
      button.dataset.propertyDffValue = value;
      button.textContent = label;
    });
    return row;
  });
  const filterKindRow = componentForm.appendChild(element(document, "propertyFilterKindRow"));
  const filterKindSelect = filterKindRow.appendChild(element(document, "propertyFilterKind"));
  const mosPinsRow = componentForm.appendChild(element(document, "propertyMosPinsRow"));
  const mosPinsSegmented = mosPinsRow.appendChild(element(document, "propertyMosPinsSegmented"));
  const mosGateStyleRow = componentForm.appendChild(element(document, "propertyMosGateStyleRow"));
  const mosGateStyleInput = mosGateStyleRow.appendChild(element(document, "propertyMosGateStyle"));
  const mosThickGateRow = componentForm.appendChild(element(document, "propertyMosThickGateRow"));
  const mosThickGateInput = mosThickGateRow.appendChild(element(document, "propertyMosThickGate"));
  const mosArrowRow = componentForm.appendChild(element(document, "propertyMosArrowRow"));
  const mosArrowSegmented = mosArrowRow.appendChild(element(document, "propertyMosArrowSegmented"));
  const transistorCircleRow = componentForm.appendChild(element(document, "propertyTransistorCircleRow"));
  const transistorCircleControl = transistorCircleRow.appendChild(element(document, "propertyTransistorCircle"));
  transistorCircleControl.ariaLabel = "Transistor circle";
  const transistorCircleButtons = [
    ["false", "Off"],
    ["true", "On"]
  ].map(([value, label]) => {
    const button = element(document, "propertyTransistorCircleValue");
    button.dataset.propertyTransistorCircleValue = value;
    button.textContent = label;
    transistorCircleControl.appendChild(button);
    return button;
  });
  const pinVisibilityRow = componentForm.appendChild(element(document, "propertyPinVisibilityRow"));
  const couplingForm = root.appendChild(element(document, "propertyCouplingForm"));
  const couplingPair = couplingForm.appendChild(element(document, "propertyCouplingPair"));
  const couplingExistingFields = couplingForm.appendChild(element(document, "propertyCouplingExistingFields"));
  const couplingCoefficientInput = couplingExistingFields.appendChild(element(document, "propertyCouplingCoefficient"));
  couplingExistingFields.appendChild(element(document, "propertyCouplingAuto"));
  const couplingLabelModeControl = couplingExistingFields.appendChild(element(document, "propertyCouplingLabelMode"));
  const couplingShowLabelInput = couplingExistingFields.appendChild(element(document, "propertyCouplingShowLabel"));
  const couplingShowArcInput = couplingExistingFields.appendChild(element(document, "propertyCouplingShowArc"));
  const couplingShowCoreInput = couplingExistingFields.appendChild(element(document, "propertyCouplingShowCore"));
  couplingExistingFields.appendChild(element(document, "propertyCouplingFlip"));
  const couplingColorInput = couplingExistingFields.appendChild(element(document, "propertyCouplingColor"));
  const couplingDefaultColorSwatch = couplingExistingFields.appendChild(element(document, "couplingColorSwatch"));
  couplingDefaultColorSwatch.dataset.couplingColorSwatch = "default";
  const couplingBlueColorSwatch = couplingExistingFields.appendChild(element(document, "couplingColorSwatch"));
  couplingBlueColorSwatch.dataset.couplingColorSwatch = "#005f9e";
  const couplingCreateButton = couplingForm.appendChild(element(document, "propertyCouplingCreate"));
  const noteForm = root.appendChild(element(document, "propertyNoteForm"));
  const noteFormatRow = noteForm.appendChild(element(document, "propertyNoteFormatRow"));
  const noteFormatSelect = noteFormatRow.appendChild(element(document, "propertyNoteFormat"));
  const noteFormatSegmented = noteFormatRow.appendChild(element(document, "propertyNoteFormatSegmented"));
  const noteBackgroundRow = noteForm.appendChild(element(document, "propertyNoteBackgroundRow"));
  const noteBackgroundInput = noteBackgroundRow.appendChild(element(document, "propertyNoteBackground"));
  noteBackgroundInput.ariaLabel = "Note fill color";
  const swatches = ["none", "#ffffe8", "#dcfce7", "#dbeafe"].map((color) => {
    const swatch = element(document, "noteBackgroundSwatch");
    swatch.dataset.noteBackgroundSwatch = color;
    noteBackgroundRow.appendChild(swatch);
    return swatch;
  });
  const noteFontSizeRow = noteForm.appendChild(element(document, "propertyNoteFontSizeRow"));
  const noteFontSizeInput = noteFontSizeRow.appendChild(element(document, "propertyNoteFontSize"));
  const noteWidthRow = noteForm.appendChild(element(document, "propertyNoteWidthRow"));
  const noteWidthInput = noteWidthRow.appendChild(element(document, "propertyNoteWidth"));
  const rawController = new SchematicPropertyPanelController(root as unknown as Element, callbacks);
  const controller = {
    bind: () => rawController.bind(),
    sync: (input: any) => rawController.sync(normalizePanelInput(input)),
    focusLabelToolInput: () => rawController.focusLabelToolInput()
  };

  return {
    root,
    controller,
    empty,
    netForm,
    netNameRow,
    netLabelRow,
    netLabelInput,
    netNameInput,
    networkColorRow,
    networkColorInput,
    networkColorSwatches,
    wireLineWidthRow,
    wireLineWidthControl,
    wireStartMarkerRow,
    wireStartMarkerControl,
    wireEndMarkerRow,
    wireEndMarkerControl,
    wireDigitalSlashRow,
    wireDigitalSlashInput,
    wireDigitalLabelRow,
    wireDigitalLabelInput,
    netMessage,
    componentForm,
    cellRow,
    cellSelect,
    refInput,
    labelVisibilityInput,
    componentColorRow,
    componentColorInput,
    componentColorSwatches,
    gainPolarityRow,
    gainPolarityControl,
    gainPolarityButtons,
    differentialOutputsRow,
    differentialOutputsInput,
    valueRow,
    valueLabel,
    valueInput,
    valueUnit,
    inductorFields,
    inductorLayoutRow,
    inductorLayoutSelect,
    inductorTapControl,
    inductorDotControl,
    inductorCouplingList,
    inductorAddCouplingButton,
    rectangleFields,
    rectangleInputs,
    timeDomainRow,
    timeDomainControl,
    timeDomainButtons,
    variantRow,
    variantLabel,
    variantSelect,
    variantSegmented,
    scaleRow,
    scaleSegmented,
    clockRow,
    clockSelect,
    clockSegmented,
    dffRows,
    filterKindRow,
    filterKindSelect,
    mosPinsRow,
    mosPinsSegmented,
    mosGateStyleRow,
    mosGateStyleInput,
    mosThickGateRow,
    mosThickGateInput,
    mosArrowRow,
    mosArrowSegmented,
    transistorCircleRow,
    transistorCircleControl,
    transistorCircleButtons,
    pinVisibilityRow,
    couplingForm,
    couplingPair,
    couplingExistingFields,
    couplingCoefficientInput,
    couplingLabelModeControl,
    couplingShowLabelInput,
    couplingShowArcInput,
    couplingShowCoreInput,
    couplingColorInput,
    couplingDefaultColorSwatch,
    couplingBlueColorSwatch,
    couplingCreateButton,
    noteForm,
    noteBackgroundRow,
    noteBackgroundInput,
    swatches,
    noteFontSizeRow,
    noteFontSizeInput,
    noteFormatRow,
    noteFormatSelect,
    noteFormatSegmented,
    noteWidthRow,
    noteWidthInput
  };
}

function selectedSwatchColors(fixture: PropertyPanelFixture) {
  return fixture.swatches
    .filter((swatch) => swatch.classList.contains("is-selected"))
    .map((swatch) => swatch.dataset.noteBackgroundSwatch);
}

function selectedComponentColorSwatches(fixture: PropertyPanelFixture) {
  return fixture.componentColorSwatches
    .filter((swatch) => swatch.classList.contains("is-selected"))
    .map((swatch) => swatch.dataset.componentColorSwatch);
}

function selectedNetworkColorSwatches(fixture: PropertyPanelFixture) {
  return fixture.networkColorSwatches
    .filter((swatch) => swatch.classList.contains("is-selected"))
    .map((swatch) => swatch.dataset.networkColorSwatch);
}

describe("SchematicPropertyPanelController", () => {
  it("syncs rectangle fields and dispatches live edit transactions", () => {
    const calls: unknown[][] = [];
    const fixture = createPropertyPanelFixture({
      onRectanglePropertyEditStart: (property) => calls.push(["start", property]),
      onRectanglePropertyInput: (property, value) => calls.push(["input", property, value]),
      onRectanglePropertyCommit: (property, value) => calls.push(["commit", property, value]),
      onRectanglePropertyCancel: (property) => calls.push(["cancel", property])
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("rectangle"),
        ref: "X1",
        rectangle: {
          widthGrid: 4,
          heightGrid: 2,
          leftPins: 1,
          rightPins: 1,
          topPins: 0,
          bottomPins: 0
        }
      }
    });

    expect(fixture.rectangleFields.hidden).toBe(false);
    expect(fixture.rectangleInputs.map((input) => input.value))
      .toEqual(["4", "2", "1", "1", "0", "0"]);
    const width = fixture.rectangleInputs[0];
    fixture.root.dispatchEvent(new FakeEvent("focusin", width));
    width.value = "8";
    fixture.root.dispatchEvent(new FakeEvent("input", width));
    fixture.root.dispatchEvent(new FakeEvent("focusout", width));
    const height = fixture.rectangleInputs[1];
    fixture.root.dispatchEvent(new FakeEvent("focusin", height));
    height.value = "6";
    fixture.root.dispatchEvent(new FakeEvent("input", height));
    fixture.root.dispatchEvent(new FakeEvent("keydown", height, { key: "Escape" }));

    expect(calls).toEqual([
      ["start", "width"],
      ["input", "width", "8"],
      ["commit", "width", "8"],
      ["start", "height"],
      ["input", "height", "6"],
      ["cancel", "height"]
    ]);
    expect(height.value).toBe("2");
  });

  it("shows the empty no-selection state", () => {
    const fixture = createPropertyPanelFixture();

    fixture.controller.sync({ hasSelection: false });

    expect(fixture.empty.hidden).toBe(false);
    expect(fixture.empty.textContent).toBe("No object selected.");
    expect(fixture.componentForm.hidden).toBe(true);
    expect(fixture.noteForm.hidden).toBe(true);
    expect(fixture.valueRow.hidden).toBe(true);
    expect(fixture.variantRow.hidden).toBe(true);
    expect(fixture.variantSelect.children).toEqual([]);
    expect(selectedSwatchColors(fixture)).toEqual([]);
  });

  it("shows the empty mixed-selection state without leaving stale projection DOM", () => {
    const fixture = createPropertyPanelFixture();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        ref: "R1",
        showValue: true,
        valueLabel: "Value",
        value: "1k",
        valuePlaceholder: "R...",
        variants: [{ id: "compact", label: "Compact" }],
        variantId: "compact"
      }
    });
    fixture.swatches[0].classList.toggle("is-selected", true);

    fixture.controller.sync({ hasSelection: true });

    expect(fixture.empty.hidden).toBe(false);
    expect(fixture.empty.textContent).toBe("No common editable properties.");
    expect(fixture.componentForm.hidden).toBe(true);
    expect(fixture.noteForm.hidden).toBe(true);
    expect(fixture.valueRow.hidden).toBe(true);
    expect(fixture.variantRow.hidden).toBe(true);
    expect(fixture.variantSelect.children).toEqual([]);
    expect(selectedSwatchColors(fixture)).toEqual([]);
  });

  it("does not commit mixed text fields until they receive real input", () => {
    const refs: string[] = [];
    const values: string[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentRefChange: (value) => refs.push(value),
      onComponentValueChange: (value) => values.push(value)
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("switch"),
        ref: mixed(),
        value: {
          label: "Value",
          value: mixed(),
          placeholder: "S..."
        },
        variants: {
          options: [
            { id: "open", label: "Open" },
            { id: "closed", label: "Closed" }
          ],
          value: mixed()
        }
      }
    });

    expect(fixture.refInput.value).toBe("");
    expect(fixture.refInput.placeholder).toBe("Multiple values");
    expect(fixture.refInput.dataset.propertyMixed).toBe("true");
    expect(fixture.valueInput.value).toBe("");
    expect(fixture.valueInput.placeholder).toBe("Multiple values");

    fixture.root.dispatchEvent(new FakeEvent("focusin", fixture.refInput));
    fixture.root.dispatchEvent(new FakeEvent("focusout", fixture.refInput));
    fixture.root.dispatchEvent(new FakeEvent("keydown", fixture.refInput, { key: "Enter" }));
    fixture.refInput.value = "programmatic-only";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.refInput));
    expect(refs).toEqual([]);

    fixture.refInput.value = "SAME";
    fixture.root.dispatchEvent(new FakeEvent("input", fixture.refInput));
    fixture.root.dispatchEvent(new FakeEvent("focusout", fixture.refInput));
    fixture.valueInput.value = "";
    fixture.root.dispatchEvent(new FakeEvent("input", fixture.valueInput));
    fixture.root.dispatchEvent(new FakeEvent("keydown", fixture.valueInput, { key: "Enter" }));

    expect(refs).toEqual(["SAME"]);
    expect(values).toEqual([""]);
  });

  it("renders a mixed checkbox as indeterminate and makes the first change turn it on", () => {
    const changes: boolean[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentLabelVisibilityChange: (value) => changes.push(value)
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        ref: uniform("R"),
        labelVisible: mixed()
      }
    });

    expect(fixture.labelVisibilityInput.indeterminate).toBe(true);
    expect(fixture.labelVisibilityInput.checked).toBe(false);
    expect(fixture.labelVisibilityInput.ariaChecked).toBe("mixed");

    fixture.root.dispatchEvent(new FakeEvent("change", fixture.labelVisibilityInput));

    expect(changes).toEqual([true]);
    expect(fixture.labelVisibilityInput.indeterminate).toBe(false);
    expect(fixture.labelVisibilityInput.checked).toBe(true);
    expect(fixture.labelVisibilityInput.ariaChecked).toBe("true");
  });

  it("displays mixed sizes and dispatches a numeric size independently of View", () => {
    const sizes: number[] = [];
    const fixture = createPropertyPanelFixture({ onComponentScaleChange: value => sizes.push(value) });
    fixture.controller.bind();
    fixture.controller.sync({ hasSelection: true, component: {
      ...cellInput("resistor"), ref: uniform("R"),
      scale: { options: ["0.5", "1", "2"].map(id => ({ id, label: `×${id}` })), value: mixed() }
    } });
    expect(fixture.scaleRow.hidden).toBe(false);
    expect(fixture.scaleSegmented.children.map(button => button.ariaPressed)).toEqual(["false", "false", "false"]);
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.scaleSegmented.children[0]));
    expect(sizes).toEqual([0.5]);
    fixture.controller.sync({ hasSelection: false });
    expect(fixture.scaleRow.hidden).toBe(true);
  });

  it("exposes mixed segmented, select, and color states without selecting a value", () => {
    const colors: Array<string | null> = [];
    const variants: string[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentColorChange: (value) => colors.push(value),
      onComponentVariantChange: (value) => variants.push(value)
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("switch"),
        ref: uniform("S"),
        color: mixed(),
        variants: {
          options: [
            { id: "open", label: "Open" },
            { id: "closed", label: "Closed" }
          ],
          value: mixed()
        }
      }
    });

    expect(fixture.variantSegmented.dataset.propertyMixed).toBe("true");
    expect(fixture.variantSegmented.ariaLabel).toBe("Component view: Multiple values");
    expect(fixture.variantSegmented.children.map((button) => button.ariaPressed)).toEqual([
      "false",
      "false"
    ]);
    expect(fixture.componentColorInput.value).toBe("#111111");
    expect(fixture.componentColorInput.dataset.propertyMixed).toBe("true");
    expect(fixture.componentColorInput.ariaLabel).toBe("Symbol color: Multiple values");
    expect(fixture.componentColorRow.classList.contains("is-mixed")).toBe(true);
    expect(selectedComponentColorSwatches(fixture)).toEqual([]);

    fixture.root.dispatchEvent(new FakeEvent("click", fixture.variantSegmented.children[1]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.componentColorSwatches[1]));
    expect(variants).toEqual(["closed"]);
    expect(colors).toEqual(["#0072b2"]);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        ref: uniform("R"),
        variants: {
          options: ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase() })),
          value: mixed()
        }
      }
    });
    expect(fixture.variantSelect.hidden).toBe(false);
    expect(fixture.variantSelect.value).toBe("");
    expect(fixture.variantSelect.dataset.propertyMixed).toBe("true");
    expect(fixture.variantSelect.children.at(-1)).toMatchObject({
      value: "",
      textContent: "Multiple values",
      disabled: true
    });
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.variantSelect));
    expect(variants).toEqual(["closed"]);
  });

  it("cancels note size previews on Escape without committing restored mixed values", () => {
    const calls: string[] = [];
    const fixture = createPropertyPanelFixture({
      onNoteFontSizeEditStart: () => calls.push("size-start"),
      onNoteFontSizeInput: (value) => calls.push(`size-input:${value}`),
      onNoteFontSizeCommit: (value) => calls.push(`size-commit:${value}`),
      onNoteFontSizeCancel: () => calls.push("size-cancel"),
      onNoteWidthEditStart: () => calls.push("width-start"),
      onNoteWidthInput: (value) => calls.push(`width-input:${value}`),
      onNoteWidthCommit: (value) => calls.push(`width-commit:${value}`),
      onNoteWidthCancel: () => calls.push("width-cancel")
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      note: {
        backgroundColor: mixed(),
        fontSizePx: mixed(),
        format: uniform<"markdown">("markdown"),
        widthPx: mixed()
      }
    });

    expect(fixture.noteBackgroundInput.value).toBe("#111111");
    expect(fixture.noteFontSizeInput.placeholder).toBe("Multiple values");
    expect(fixture.noteWidthInput.placeholder).toBe("Multiple values");

    fixture.root.dispatchEvent(new FakeEvent("focusin", fixture.noteFontSizeInput));
    fixture.noteFontSizeInput.value = "24";
    fixture.root.dispatchEvent(new FakeEvent("input", fixture.noteFontSizeInput));
    fixture.root.dispatchEvent(new FakeEvent("keydown", fixture.noteFontSizeInput, { key: "Escape" }));
    fixture.root.dispatchEvent(new FakeEvent("focusout", fixture.noteFontSizeInput));
    fixture.root.dispatchEvent(new FakeEvent("focusin", fixture.noteWidthInput));
    fixture.noteWidthInput.value = "420";
    fixture.root.dispatchEvent(new FakeEvent("input", fixture.noteWidthInput));
    fixture.root.dispatchEvent(new FakeEvent("keydown", fixture.noteWidthInput, { key: "Escape" }));
    fixture.root.dispatchEvent(new FakeEvent("focusout", fixture.noteWidthInput));

    expect(fixture.noteFontSizeInput.value).toBe("");
    expect(fixture.noteWidthInput.value).toBe("");
    expect(calls).toEqual([
      "size-start",
      "size-input:24",
      "size-cancel",
      "width-start",
      "width-input:420",
      "width-cancel"
    ]);
  });

  it("syncs a component with value and variant controls", () => {
    const fixture = createPropertyPanelFixture();

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("capacitor"),
        ref: "C7",
        showValue: true,
        valueLabel: "Value",
        value: "2p",
        valuePlaceholder: "C...",
        valueUnit: "F",
        variants: [
          { id: "normal", label: "Normal" },
          { id: "wide", label: "Wide" }
        ],
        variantId: "wide"
      }
    });

    expect(fixture.empty.hidden).toBe(true);
    expect(fixture.componentForm.hidden).toBe(false);
    expect(fixture.noteForm.hidden).toBe(true);
    expect(fixture.refInput.value).toBe("C7");
    expect(fixture.valueRow.hidden).toBe(false);
    expect(fixture.valueLabel.textContent).toBe("Value");
    expect(fixture.valueInput.value).toBe("2p");
    expect(fixture.valueInput.placeholder).toBe("C...");
    expect(fixture.valueUnit.hidden).toBe(false);
    expect(fixture.valueUnit.textContent).toBe("F");
    expect(fixture.variantRow.hidden).toBe(false);
    expect(fixture.variantSelect.children.map((option) => [option.value, option.textContent])).toEqual([
      ["normal", "Normal"],
      ["wide", "Wide"]
    ]);
    expect(fixture.variantSelect.value).toBe("wide");
    expect(fixture.variantSelect.hidden).toBe(true);
    expect(fixture.variantSegmented.hidden).toBe(false);
    expect(fixture.variantSegmented.children.map((button) => [
      button.dataset.propertyVariantValue,
      button.textContent,
      button.classList.contains("is-selected")
    ])).toEqual([
      ["normal", "Normal", false],
      ["wide", "Wide", true]
    ]);
  });

  it("uses the contextual Inputs label for logic-gate variants", () => {
    const fixture = createPropertyPanelFixture();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("and"),
        ref: "X1",
        variants: {
          label: "Inputs",
          options: [
            { id: "2-input", label: "2" },
            { id: "3-input", label: "3" },
            { id: "4-input", label: "4" }
          ],
          value: mixed()
        }
      }
    });

    expect(fixture.variantLabel.textContent).toBe("Inputs");
    expect(fixture.variantSegmented.ariaLabel).toBe("Component inputs: Multiple values");
    expect(fixture.variantSegmented.children.map((button) => button.ariaPressed))
      .toEqual(["false", "false", "false"]);
  });

  it("syncs and dispatches all DFF settings while hiding inactive level controls", () => {
    const changes: Array<[string, string]> = [];
    const fixture = createPropertyPanelFixture({
      onComponentDffSettingChange: (property, value) => changes.push([property, value])
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("dff"),
        ref: "X2",
        dff: {
          clockEdge: "rising",
          setMode: "synchronous",
          setActiveLevel: "low",
          resetMode: "none",
          resetActiveLevel: "high"
        }
      }
    });

    const rows = Object.fromEntries(fixture.dffRows.map((row) => [
      row.dataset.propertyDffRow,
      row
    ]));
    expect(rows.clockEdge.hidden).toBe(false);
    expect(rows.setMode.hidden).toBe(false);
    expect(rows.setActiveLevel.hidden).toBe(false);
    expect(rows.resetMode.hidden).toBe(false);
    expect(rows.resetActiveLevel.hidden).toBe(true);
    expect(rows.clockEdge.querySelectorAll("[data-property-dff-setting]")
      .map((button) => [button.dataset.propertyDffValue, button.ariaPressed])).toEqual([
      ["rising", "true"],
      ["falling", "false"]
    ]);
    expect(rows.setActiveLevel.querySelectorAll("[data-property-dff-setting]")
      .map((button) => [button.dataset.propertyDffValue, button.ariaPressed])).toEqual([
      ["high", "false"],
      ["low", "true"]
    ]);

    const falling = rows.clockEdge.querySelectorAll("[data-property-dff-setting]")[1];
    const resetAsync = rows.resetMode.querySelectorAll("[data-property-dff-setting]")[2];
    fixture.root.dispatchEvent(new FakeEvent("click", falling));
    fixture.root.dispatchEvent(new FakeEvent("click", resetAsync));
    expect(changes).toEqual([
      ["clockEdge", "falling"],
      ["resetMode", "asynchronous"]
    ]);
  });

  it("dispatches small variant sets from one-click buttons and keeps larger sets as lists", () => {
    const changes: string[] = [];
    const fixture = createPropertyPanelFixture({ onComponentVariantChange: (value) => changes.push(value) });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("switch"),
        ref: "S1",
        showValue: false,
        valueLabel: "Value",
        value: "",
        valuePlaceholder: "",
        variants: [
          { id: "open", label: "Open" },
          { id: "closed", label: "Closed" }
        ],
        variantId: "open"
      }
    });

    const closedButton = fixture.variantSegmented.querySelectorAll("[data-property-variant-value]")[1];
    fixture.root.dispatchEvent(new FakeEvent("click", closedButton));
    expect(changes).toEqual(["closed"]);
    expect(fixture.variantSelect.hidden).toBe(true);
    expect(fixture.variantSegmented.hidden).toBe(false);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        ref: "R1",
        showValue: true,
        valueLabel: "Resistance",
        value: "1k",
        valuePlaceholder: "1k",
        variants: ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase() })),
        variantId: "c"
      }
    });
    expect(fixture.variantSelect.hidden).toBe(false);
    expect(fixture.variantSegmented.hidden).toBe(true);
  });

  it("syncs cell choices and dispatches compatible cell changes", () => {
    const changes: ComponentType[] = [];
    const fixture = createPropertyPanelFixture({ onComponentCellChange: (value) => changes.push(value) });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        cellType: "resistor",
        color: null,
        cells: [
          { type: "resistor", label: "resistor", disabled: false },
          { type: "capacitor", label: "capacitor", disabled: false },
          { type: "ota", label: "ota", disabled: true }
        ],
        ref: "R1",
        labelVisible: true,
        showValue: true,
        valueLabel: "Value",
        value: "1k",
        valuePlaceholder: "R...",
        variants: []
      }
    });

    expect(fixture.cellSelect.value).toBe("resistor");
    expect(fixture.cellSelect.children.map((option) => [option.value, option.textContent, option.disabled])).toEqual([
      ["resistor", "resistor", false],
      ["capacitor", "capacitor", false],
      ["ota", "ota", true]
    ]);
    fixture.cellSelect.value = "capacitor";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.cellSelect));
    expect(changes).toEqual(["capacitor"]);
  });

  it("syncs a component without value or variant controls", () => {
    const fixture = createPropertyPanelFixture();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("capacitor"),
        ref: "C7",
        showValue: true,
        valueLabel: "Value",
        value: "2p",
        valuePlaceholder: "C...",
        variants: [{ id: "normal", label: "Normal" }],
        variantId: "normal"
      }
    });

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("gnd"),
        ref: "GND",
        showValue: false,
        valueLabel: "Value",
        value: "",
        valuePlaceholder: "",
        variants: []
      }
    });

    expect(fixture.componentForm.hidden).toBe(false);
    expect(fixture.refInput.value).toBe("GND");
    expect(fixture.valueRow.hidden).toBe(true);
    expect(fixture.valueUnit.hidden).toBe(true);
    expect(fixture.valueUnit.textContent).toBe("");
    expect(fixture.variantRow.hidden).toBe(true);
    expect(fixture.variantSelect.children).toEqual([]);
  });

  it("syncs and dispatches component custom, preset, and default colors", () => {
    const colors: Array<string | null> = [];
    const fixture = createPropertyPanelFixture({ onComponentColorChange: (value) => colors.push(value) });
    fixture.controller.bind();

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        color: null,
        ref: "R1",
        showValue: true,
        valueLabel: "Value",
        value: "1k",
        valuePlaceholder: "1k",
        variants: []
      }
    });
    expect(fixture.componentColorRow.hidden).toBe(false);
    expect(fixture.componentColorInput.value).toBe("#111111");
    expect(selectedComponentColorSwatches(fixture)).toEqual(["default"]);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        color: "#0072b2",
        ref: "R1",
        showValue: true,
        valueLabel: "Value",
        value: "1k",
        valuePlaceholder: "1k",
        variants: []
      }
    });
    expect(fixture.componentColorInput.value).toBe("#0072b2");
    expect(selectedComponentColorSwatches(fixture)).toEqual(["#0072b2"]);

    fixture.componentColorInput.value = "#123456";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.componentColorInput));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.componentColorSwatches[1]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.componentColorSwatches[0]));
    expect(colors).toEqual(["#123456", "#0072b2", null]);
  });

  it("syncs and dispatches wire and junction colors without showing the control for labels", () => {
    const colors: Array<string | null> = [];
    const fixture = createPropertyPanelFixture({ onNetworkColorChange: (value) => colors.push(value) });
    fixture.controller.bind();

    fixture.controller.sync({
      hasSelection: true,
      network: { netName: "N1", color: { value: null, target: "wire" } }
    });
    expect(fixture.netForm.hidden).toBe(false);
    expect(fixture.netNameInput.value).toBe("N1");
    expect(fixture.networkColorRow.hidden).toBe(false);
    expect(fixture.networkColorInput.value).toBe("#111111");
    expect(selectedNetworkColorSwatches(fixture)).toEqual(["default"]);

    fixture.controller.sync({
      hasSelection: true,
      network: { netName: "N2", color: { value: "#0072b2", target: "junction" } }
    });
    expect(fixture.networkColorInput.value).toBe("#0072b2");
    expect(selectedNetworkColorSwatches(fixture)).toEqual(["#0072b2"]);

    fixture.networkColorInput.value = "#123456";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.networkColorInput));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.networkColorSwatches[1]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.networkColorSwatches[0]));
    expect(colors).toEqual(["#123456", "#0072b2", null]);

    fixture.controller.sync({
      hasSelection: true,
      network: { netName: "CLK", label: { name: "CLK" } }
    });
    expect(fixture.networkColorRow.hidden).toBe(true);
  });

  it("syncs and dispatches endpoint markers, digital slash, and an optional bit label", () => {
    const starts: string[] = [];
    const ends: string[] = [];
    const widths: string[] = [];
    const slashes: boolean[] = [];
    const labels: string[] = [];
    const fixture = createPropertyPanelFixture({
      onWireStartMarkerChange: (value) => starts.push(value),
      onWireEndMarkerChange: (value) => ends.push(value),
      onWireLineWidthChange: (value) => widths.push(value),
      onWireDigitalSlashChange: (value) => slashes.push(value),
      onWireDigitalLabelChange: (value) => labels.push(value)
    });
    fixture.controller.bind();

    fixture.controller.sync({
      hasSelection: true,
      network: {
        netName: "BUS",
        color: { value: null, target: "wire" },
        wire: {
          lineWidth: "2a",
          startMarker: "arrow",
          endMarker: "circle",
          digitalSlash: true,
          digitalLabel: "12"
        }
      }
    });

    expect(fixture.wireStartMarkerRow.hidden).toBe(false);
    expect(fixture.wireEndMarkerRow.hidden).toBe(false);
    expect(fixture.wireLineWidthControl.children.map((button) => button.ariaPressed)).toEqual([
      "false",
      "true"
    ]);
    expect(fixture.wireDigitalSlashInput.checked).toBe(true);
    expect(fixture.wireDigitalLabelInput.value).toBe("12");
    expect(fixture.wireDigitalLabelInput.disabled).toBe(false);
    expect(fixture.wireStartMarkerControl.children.map((button) => button.ariaPressed)).toEqual([
      "false",
      "true",
      "false"
    ]);
    expect(fixture.wireEndMarkerControl.children.map((button) => button.ariaPressed)).toEqual([
      "false",
      "false",
      "true"
    ]);

    fixture.root.dispatchEvent(new FakeEvent("click", fixture.wireLineWidthControl.children[0]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.wireStartMarkerControl.children[2]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.wireEndMarkerControl.children[0]));
    fixture.wireDigitalSlashInput.checked = false;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.wireDigitalSlashInput));
    fixture.wireDigitalLabelInput.value = "";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.wireDigitalLabelInput));

    expect(widths).toEqual(["a"]);
    expect(starts).toEqual(["circle"]);
    expect(ends).toEqual(["default"]);
    expect(slashes).toEqual([false]);
    expect(labels).toEqual([""]);

    fixture.controller.sync({
      hasSelection: true,
      network: {
        netName: "BUS",
        wire: {
          lineWidth: "a",
          startMarker: "default",
          endMarker: "default",
          digitalSlash: false,
          digitalLabel: ""
        }
      }
    });
    expect(fixture.wireDigitalLabelRow.hidden).toBe(true);
  });

  it("syncs and dispatches per-pin visibility, role, and sign controls", () => {
    const visibilityChanges: Array<[string, boolean]> = [];
    const modeChanges: Array<[string, string]> = [];
    const symbolChanges: Array<[string, boolean]> = [];
    const fixture = createPropertyPanelFixture({
      onComponentPinVisibilityChange: (pinId, visible) => visibilityChanges.push([pinId, visible]),
      onComponentPinModeChange: (pinId, mode) => modeChanges.push([pinId, mode]),
      onComponentPinSymbolVisibilityChange: (pinId, visible) => symbolChanges.push([pinId, visible])
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("plus"),
        ref: "SUM1",
        showValue: true,
        valueLabel: "Value",
        value: "SUM1",
        valuePlaceholder: "SUM...",
        variants: [],
        pinSettings: [
          { id: "left", label: "Left", visible: true, modeEditable: true, mode: "positive", symbolVisible: true },
          { id: "top", label: "Top", visible: false, modeEditable: true, mode: "output", symbolVisible: true }
        ]
      }
    });

    expect(fixture.pinVisibilityRow.hidden).toBe(false);
    const visibilityInputs = fixture.pinVisibilityRow.querySelectorAll("[data-property-pin-visibility-id]");
    expect(visibilityInputs.map((input) => [input.dataset.propertyPinVisibilityId, input.checked])).toEqual([
      ["left", true],
      ["top", false]
    ]);
    const modeButtons = fixture.pinVisibilityRow.querySelectorAll("[data-property-pin-mode-value]");
    expect(modeButtons.filter((button) => button.classList.contains("is-selected")).map((button) => [
      button.dataset.propertyPinModeId,
      button.dataset.propertyPinModeValue
    ])).toEqual([["left", "positive"], ["top", "output"]]);
    const symbolInputs = fixture.pinVisibilityRow.querySelectorAll("[data-property-pin-symbol-visibility-id]");
    expect(symbolInputs.map((input) => [input.dataset.propertyPinSymbolVisibilityId, input.checked, input.disabled])).toEqual([
      ["left", true, false],
      ["top", true, true]
    ]);

    visibilityInputs[1].checked = true;
    fixture.root.dispatchEvent(new FakeEvent("change", visibilityInputs[1]));
    const leftNegativeButton = modeButtons.find((button) =>
      button.dataset.propertyPinModeId === "left" && button.dataset.propertyPinModeValue === "negative"
    )!;
    fixture.root.dispatchEvent(new FakeEvent("click", leftNegativeButton));
    symbolInputs[0].checked = false;
    fixture.root.dispatchEvent(new FakeEvent("change", symbolInputs[0]));
    expect(visibilityChanges).toEqual([["top", true]]);
    expect(modeChanges).toEqual([["left", "negative"]]);
    expect(symbolChanges).toEqual([["left", false]]);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("switch"),
        ref: "S1",
        showValue: false,
        valueLabel: "Value",
        value: "",
        valuePlaceholder: "",
        variants: [],
        pinSettings: [
          { id: "ctrl", label: "Ctrl", visible: false, modeEditable: false, mode: "output", symbolVisible: false }
        ]
      }
    });
    expect(fixture.pinVisibilityRow.querySelectorAll("[data-property-pin-visibility-id]")).toHaveLength(1);
    expect(fixture.pinVisibilityRow.querySelectorAll("[data-property-pin-mode-value]")).toHaveLength(0);
    expect(fixture.pinVisibilityRow.querySelectorAll("[data-property-pin-symbol-visibility-id]")).toHaveLength(0);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        ref: "R1",
        showValue: true,
        valueLabel: "Value",
        value: "1k",
        valuePlaceholder: "R...",
        variants: []
      }
    });
    expect(fixture.pinVisibilityRow.hidden).toBe(true);
    expect(fixture.pinVisibilityRow.children).toEqual([]);
  });

  it("syncs and dispatches label visibility and gain polarity", () => {
    const labelChanges: boolean[] = [];
    const polarityChanges: string[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentLabelVisibilityChange: (visible) => labelChanges.push(visible),
      onComponentGainPolarityChange: (polarity) => polarityChanges.push(polarity)
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("amp"),
        ref: "A1",
        gainPolarity: "negative",
        showValue: true,
        valueLabel: "Value",
        value: "A1",
        valuePlaceholder: "A...",
        variants: []
      }
    });

    expect(fixture.labelVisibilityInput.checked).toBe(true);
    expect(fixture.gainPolarityRow.hidden).toBe(false);
    expect(fixture.gainPolarityButtons.map((button) => [
      button.dataset.propertyGainPolarityValue,
      button.textContent,
      button.classList.contains("is-selected"),
      button.ariaPressed
    ])).toEqual([
      ["default", "Default", false, "false"],
      ["positive", "+", false, "false"],
      ["negative", "−", true, "true"]
    ]);

    fixture.labelVisibilityInput.checked = false;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.labelVisibilityInput));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.gainPolarityButtons[1]));
    expect(labelChanges).toEqual([false]);
    expect(polarityChanges).toEqual(["positive"]);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        ref: "R1",
        showValue: true,
        valueLabel: "Value",
        value: "1k",
        valuePlaceholder: "R...",
        variants: []
      }
    });
    expect(fixture.gainPolarityRow.hidden).toBe(true);
  });

  it("syncs and dispatches differential output order", () => {
    const changes: boolean[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentDifferentialOutputsChange: (same) => changes.push(same)
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("diffAmp"),
        ref: "DA1",
        differentialOutputsSame: true,
        variants: []
      }
    });

    expect(fixture.differentialOutputsRow.hidden).toBe(false);
    expect(fixture.differentialOutputsInput.checked).toBe(true);
    fixture.differentialOutputsInput.checked = false;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.differentialOutputsInput));
    expect(changes).toEqual([false]);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("resistor"),
        ref: "R1",
        variants: []
      }
    });
    expect(fixture.differentialOutputsRow.hidden).toBe(true);
  });

  it("syncs and dispatches the MOS thick-gate checkbox, including mixed selections", () => {
    const changes: boolean[] = [];
    const fixture = createPropertyPanelFixture({ onComponentMosThickGateChange: thick => changes.push(thick) });
    fixture.controller.bind();
    fixture.controller.sync({ hasSelection: true, component: { ...cellInput("nmos"), ref: "M1", variants: [], mosThickGate: false } });
    expect(fixture.mosThickGateRow.hidden).toBe(false);
    expect(fixture.mosThickGateInput.checked).toBe(false);
    fixture.mosThickGateInput.checked = true;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.mosThickGateInput));
    expect(changes).toEqual([true]);
    fixture.controller.sync({ hasSelection: true, component: { ...cellInput("nmos"), ref: "M1", variants: [], mosThickGate: mixed() } });
    expect(fixture.mosThickGateInput.indeterminate).toBe(true);
    fixture.controller.sync({ hasSelection: true, component: { ...cellInput("resistor"), ref: "R1", variants: [] } });
    expect(fixture.mosThickGateRow.hidden).toBe(true);
  });

  it("syncs independent MOS pin, gate-style, and arrow controls", () => {
    const patches: object[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentMosViewChange: (patch) => patches.push(patch)
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("nmos"),
        ref: "M1",
        showValue: true,
        valueLabel: "Value",
        value: "M1",
        valuePlaceholder: "M...",
        variants: [],
        mosView: { pins: "3pin", gateStyle: true, arrow: "none" }
      }
    });

    expect(fixture.variantRow.hidden).toBe(true);
    expect(fixture.mosPinsRow.hidden).toBe(false);
    expect(fixture.mosGateStyleRow.hidden).toBe(false);
    expect(fixture.mosArrowRow.hidden).toBe(false);
    expect(fixture.mosGateStyleInput.checked).toBe(true);
    expect(fixture.mosPinsSegmented.querySelectorAll("[data-property-mos-pins-value]")
      .filter((button) => button.classList.contains("is-selected"))
      .map((button) => button.dataset.propertyMosPinsValue)).toEqual(["3pin"]);
    expect(fixture.mosArrowSegmented.querySelectorAll("[data-property-mos-arrow-value]")
      .filter((button) => button.classList.contains("is-selected"))
      .map((button) => button.dataset.propertyMosArrowValue)).toEqual(["none"]);

    fixture.mosGateStyleInput.checked = false;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.mosGateStyleInput));

    fixture.mosGateStyleInput.checked = true;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.mosGateStyleInput));
    const bulkButton = fixture.mosArrowSegmented.querySelectorAll("[data-property-mos-arrow-value]")
      .find((button) => button.dataset.propertyMosArrowValue === "bulk")!;
    fixture.root.dispatchEvent(new FakeEvent("click", bulkButton));
    const fourPinButton = fixture.mosPinsSegmented.querySelectorAll("[data-property-mos-pins-value]")
      .find((button) => button.dataset.propertyMosPinsValue === "4pin")!;
    fixture.root.dispatchEvent(new FakeEvent("click", fourPinButton));
    expect(patches).toEqual([
      { gateStyle: false },
      { gateStyle: true },
      { arrow: "bulk" },
      { pins: "4pin" }
    ]);
  });

  it("syncs the one-click transistor circle control and mixed state", () => {
    const changes: boolean[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentTransistorCircleChange: (visible) => changes.push(visible)
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("npn"),
        ref: "Q1",
        variants: [],
        transistorCircle: false
      }
    });

    expect(fixture.transistorCircleRow.hidden).toBe(false);
    expect(fixture.transistorCircleButtons
      .filter((button) => button.classList.contains("is-selected"))
      .map((button) => button.dataset.propertyTransistorCircleValue)).toEqual(["false"]);

    const onButton = fixture.transistorCircleButtons.find(
      (button) => button.dataset.propertyTransistorCircleValue === "true"
    )!;
    fixture.root.dispatchEvent(new FakeEvent("click", onButton));
    expect(changes).toEqual([true]);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("npn"),
        ref: "Multiple values",
        variants: [],
        transistorCircle: mixed()
      }
    });
    expect(fixture.transistorCircleControl.classList.contains("is-mixed")).toBe(true);
    expect(fixture.transistorCircleButtons.some((button) => button.classList.contains("is-selected"))).toBe(false);
  });

  it("syncs note background swatches and resets the font size input", () => {
    const fixture = createPropertyPanelFixture();

    fixture.controller.sync({
      hasSelection: true,
      note: {
        backgroundColor: "#ffffe8",
        fontSizePx: 14,
        format: "markdown",
        widthPx: 320
      }
    });

    expect(fixture.noteForm.hidden).toBe(false);
    expect(fixture.componentForm.hidden).toBe(true);
    expect(fixture.noteBackgroundRow.hidden).toBe(false);
    expect(fixture.noteBackgroundInput.value).toBe("#ffffe8");
    expect(selectedSwatchColors(fixture)).toEqual(["#ffffe8"]);
    expect(fixture.noteFontSizeRow.hidden).toBe(false);
    expect(fixture.noteFontSizeInput.value).toBe("14");
    expect(fixture.noteFormatSegmented.querySelectorAll("[data-property-note-format-value]")
      .filter((button) => button.classList.contains("is-selected"))
      .map((button) => button.dataset.propertyNoteFormatValue)).toEqual(["markdown"]);
    expect(fixture.noteWidthRow.hidden).toBe(false);
    expect(fixture.noteWidthInput.value).toBe("320");

    fixture.noteFontSizeInput.value = "72";
    fixture.controller.sync({
      hasSelection: true,
      note: {
        backgroundColor: "#dcfce7",
        fontSizePx: 18,
        format: "plain",
        widthPx: 120
      }
    });

    expect(fixture.noteBackgroundInput.value).toBe("#dcfce7");
    expect(selectedSwatchColors(fixture)).toEqual(["#dcfce7"]);
    expect(fixture.noteFontSizeInput.value).toBe("18");
    expect(fixture.noteWidthRow.hidden).toBe(true);

    fixture.controller.sync({
      hasSelection: true,
      note: {
        backgroundColor: null,
        fontSizePx: 18,
        format: "plain"
      }
    });
    expect(fixture.noteBackgroundInput.value).toBe("#ffffe8");
    expect(selectedSwatchColors(fixture)).toEqual(["none"]);
  });

  it("dispatches note format and width transaction callbacks", () => {
    const calls: Array<[string, string?]> = [];
    const fixture = createPropertyPanelFixture({
      onNoteFormatChange: (value) => calls.push(["format", value]),
      onNoteWidthEditStart: () => calls.push(["width-start"]),
      onNoteWidthInput: (value) => calls.push(["width-input", value]),
      onNoteWidthCommit: (value) => calls.push(["width-commit", value])
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      note: {
        backgroundColor: null,
        fontSizePx: 18,
        format: "markdown",
        widthPx: 380
      }
    });
    fixture.noteWidthInput.value = "380";
    const plainButton = fixture.noteFormatSegmented.querySelectorAll("[data-property-note-format-value]")
      .find((button) => button.dataset.propertyNoteFormatValue === "plain")!;
    fixture.root.dispatchEvent(new FakeEvent("click", plainButton));
    fixture.root.dispatchEvent(new FakeEvent("focusin", fixture.noteWidthInput));
    fixture.root.dispatchEvent(new FakeEvent("input", fixture.noteWidthInput));
    fixture.root.dispatchEvent(new FakeEvent("focusout", fixture.noteWidthInput));
    expect(calls).toEqual([
      ["format", "plain"],
      ["width-start"],
      ["width-input", "380"],
      ["width-commit", "380"]
    ]);
  });

  it("dispatches component ref, value, and variant change callbacks", () => {
    const calls: Array<[string, string]> = [];
    const fixture = createPropertyPanelFixture({
      onComponentRefChange: (value) => calls.push(["ref", value]),
      onComponentValueChange: (value) => calls.push(["value", value]),
      onComponentVariantChange: (value) => calls.push(["variant", value])
    });
    fixture.controller.bind();
    fixture.refInput.value = "M7";
    fixture.valueInput.value = "12u/40n";
    fixture.variantSelect.value = "wide";

    fixture.root.dispatchEvent(new FakeEvent("change", fixture.refInput));
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.valueInput));
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.variantSelect));

    expect(calls).toEqual([
      ["ref", "M7"],
      ["value", "12u/40n"],
      ["variant", "wide"]
    ]);
  });

  it("syncs the dedicated Filter kind select with mixed values and dispatches one change", () => {
    const changes: string[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentFilterKindChange: (value) => changes.push(value)
    });
    fixture.controller.bind();
    const options = [
      { value: "lowpass", label: "Low-pass" },
      { value: "highpass", label: "High-pass" },
      { value: "bandpass", label: "Band-pass" },
      { value: "bandstop", label: "Band-stop" }
    ];

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("filter"),
        ref: "FLT1",
        filterKind: { options, value: "bandpass" }
      }
    });

    expect(fixture.filterKindRow.hidden).toBe(false);
    expect(fixture.filterKindSelect.children.map((option) => [option.value, option.textContent]))
      .toEqual(options.map((option) => [option.value, option.label]));
    expect(fixture.filterKindSelect.value).toBe("bandpass");
    fixture.filterKindSelect.value = "bandstop";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.filterKindSelect));
    expect(changes).toEqual(["bandstop"]);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("filter"),
        ref: mixed(),
        filterKind: { options, value: mixed() }
      }
    });
    expect(fixture.filterKindSelect.value).toBe("");
    expect(fixture.filterKindSelect.children.at(-1)).toMatchObject({
      value: "",
      textContent: "Multiple values",
      disabled: true
    });
  });

  it("syncs CT/DT Domain as a one-click segmented control", () => {
    const changes: string[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentTimeDomainChange: (value) => changes.push(value)
    });
    fixture.controller.bind();

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("integrator"),
        ref: "INT1",
        timeDomain: "discrete"
      }
    });

    expect(fixture.timeDomainRow.hidden).toBe(false);
    expect(fixture.timeDomainButtons.map((button) => button.ariaPressed))
      .toEqual(["false", "true"]);
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.timeDomainButtons[0]));
    expect(changes).toEqual(["continuous"]);

    fixture.controller.sync({
      hasSelection: true,
      component: {
        ref: mixed(),
        labelVisible: true,
        color: null,
        timeDomain: mixed()
      }
    });
    expect(fixture.timeDomainButtons.map((button) => button.ariaPressed))
      .toEqual(["false", "false"]);
    expect(fixture.timeDomainControl.classList.contains("is-mixed")).toBe(true);
    expect(fixture.timeDomainControl.ariaLabel).toBe("Function block domain: Multiple values");
  });

  it("commits component ref and value edits on focusout", () => {
    const calls: Array<[string, string]> = [];
    const fixture = createPropertyPanelFixture({
      onComponentRefChange: (value) => calls.push(["ref", value]),
      onComponentValueChange: (value) => calls.push(["value", value])
    });
    fixture.controller.bind();
    fixture.refInput.value = "CMP2";
    fixture.valueInput.value = "5";

    fixture.root.dispatchEvent(new FakeEvent("focusout", fixture.refInput));
    fixture.root.dispatchEvent(new FakeEvent("focusout", fixture.valueInput));

    expect(calls).toEqual([
      ["ref", "CMP2"],
      ["value", "5"]
    ]);
  });

  it("dispatches note background input and swatch clicks", () => {
    const backgrounds: Array<string | null> = [];
    const fixture = createPropertyPanelFixture({
      onNoteBackgroundChange: (value) => backgrounds.push(value)
    });
    fixture.controller.bind();
    fixture.noteBackgroundInput.value = "#123456";

    fixture.root.dispatchEvent(new FakeEvent("change", fixture.noteBackgroundInput));
    const noFillClick = new FakeEvent("click", fixture.swatches[0]);
    fixture.root.dispatchEvent(noFillClick);
    const colorSwatchClick = new FakeEvent("click", fixture.swatches[2]);
    fixture.root.dispatchEvent(colorSwatchClick);

    expect(noFillClick.defaultPrevented).toBe(true);
    expect(colorSwatchClick.defaultPrevented).toBe(true);
    expect(backgrounds).toEqual(["#123456", null, "#dcfce7"]);
  });

  it("dispatches note font size preview, edit start, and commit callbacks", () => {
    const calls: Array<[string, string?]> = [];
    const fixture = createPropertyPanelFixture({
      onNoteFontSizeEditStart: () => calls.push(["start"]),
      onNoteFontSizeInput: (value) => calls.push(["input", value]),
      onNoteFontSizeCommit: (value) => calls.push(["commit", value])
    });
    fixture.controller.bind();
    fixture.noteFontSizeInput.value = "18";

    fixture.root.dispatchEvent(new FakeEvent("focusin", fixture.noteFontSizeInput));
    fixture.root.dispatchEvent(new FakeEvent("input", fixture.noteFontSizeInput));
    fixture.noteFontSizeInput.value = "20";
    fixture.root.dispatchEvent(new FakeEvent("focusout", fixture.noteFontSizeInput));

    expect(calls).toEqual([
      ["start"],
      ["input", "18"],
      ["commit", "20"]
    ]);
  });

  it("prevents Enter default and blurs editable text fields, committing font size only when applicable", () => {
    const commits: string[] = [];
    const componentCommits: Array<[string, string]> = [];
    const fixture = createPropertyPanelFixture({
      onComponentRefChange: (value) => componentCommits.push(["ref", value]),
      onComponentValueChange: (value) => componentCommits.push(["value", value]),
      onNoteFontSizeCommit: (value) => commits.push(value)
    });
    fixture.controller.bind();
    fixture.refInput.value = "CMP7";
    fixture.valueInput.value = "5";
    fixture.noteFontSizeInput.value = "22";

    const refEnter = new FakeEvent("keydown", fixture.refInput, { key: "Enter" });
    const valueEnter = new FakeEvent("keydown", fixture.valueInput, { key: "Enter" });
    const fontSizeEnter = new FakeEvent("keydown", fixture.noteFontSizeInput, { key: "Enter" });
    fixture.root.dispatchEvent(refEnter);
    fixture.root.dispatchEvent(valueEnter);
    fixture.root.dispatchEvent(fontSizeEnter);

    expect(refEnter.defaultPrevented).toBe(true);
    expect(valueEnter.defaultPrevented).toBe(true);
    expect(fontSizeEnter.defaultPrevented).toBe(true);
    expect(fixture.refInput.blurCount).toBe(1);
    expect(fixture.valueInput.blurCount).toBe(1);
    expect(fixture.noteFontSizeInput.blurCount).toBe(1);
    expect(componentCommits).toEqual([
      ["ref", "CMP7"],
      ["value", "5"]
    ]);
    expect(commits).toEqual(["22"]);
  });

  it("ignores unrelated targets", () => {
    const calls: string[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentRefChange: (value) => calls.push(`ref:${value}`),
      onComponentValueChange: (value) => calls.push(`value:${value}`),
      onComponentVariantChange: (value) => calls.push(`variant:${value}`),
      onNoteBackgroundChange: (value) => calls.push(`background:${value}`),
      onNoteFontSizeEditStart: () => calls.push("start"),
      onNoteFontSizeInput: (value) => calls.push(`input:${value}`),
      onNoteFontSizeCommit: (value) => calls.push(`commit:${value}`)
    });
    const unrelated = fixture.root.appendChild(new FakeElement("button", fixture.root.ownerDocument));
    const outsideRef = element(fixture.root.ownerDocument, "propertyRef");
    outsideRef.value = "OUT";
    fixture.controller.bind();

    ["change", "input", "focusin", "focusout", "click"].forEach((type) => {
      fixture.root.dispatchEvent(new FakeEvent(type, unrelated));
    });
    const unrelatedEnter = new FakeEvent("keydown", unrelated, { key: "Enter" });
    const outsideChange = new FakeEvent("change", outsideRef);
    fixture.root.dispatchEvent(unrelatedEnter);
    fixture.root.dispatchEvent(outsideChange);

    expect(unrelatedEnter.defaultPrevented).toBe(false);
    expect(unrelated.blurCount).toBe(0);
    expect(calls).toEqual([]);
  });

  it("binds listeners only once", () => {
    const refs: string[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentRefChange: (value) => refs.push(value)
    });
    fixture.controller.bind();
    fixture.controller.bind();
    fixture.refInput.value = "R9";

    fixture.root.dispatchEvent(new FakeEvent("change", fixture.refInput));

    expect(refs).toEqual(["R9"]);
  });

  it("syncs and dispatches ADC Clock independently from View", () => {
    const clocks: string[] = [];
    const views: string[] = [];
    const fixture = createPropertyPanelFixture({
      onComponentClockChange: (value) => clocks.push(value),
      onComponentVariantChange: (value) => views.push(value)
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("adc"),
        ref: "ADC1",
        variants: [
          { id: "plain", label: "Plain" },
          { id: "quantizer", label: "Quantizer" }
        ],
        variantId: "quantizer",
        clock: {
          label: "Clock",
          options: [
            { id: "none", label: "No" },
            { id: "rising", label: "Rising" },
            { id: "falling", label: "Falling" }
          ],
          value: "falling"
        }
      }
    });

    expect(fixture.variantRow.hidden).toBe(false);
    expect(fixture.clockRow.hidden).toBe(false);
    expect(fixture.variantSegmented.children.map((button) => button.ariaPressed))
      .toEqual(["false", "true"]);
    expect(fixture.clockSegmented.children.map((button) => button.ariaPressed))
      .toEqual(["false", "false", "true"]);

    fixture.root.dispatchEvent(new FakeEvent("click", fixture.variantSegmented.children[0]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.clockSegmented.children[0]));
    expect(views).toEqual(["plain"]);
    expect(clocks).toEqual(["none"]);
  });

  it("syncs inductor layout, tap, dot, and canvas coupling controls", () => {
    const calls: unknown[][] = [];
    const fixture = createPropertyPanelFixture({
      onComponentInductorTapChange: (tap) => calls.push(["tap", tap]),
      onComponentInductorDotChange: (terminal) => calls.push(["dot", terminal]),
      onComponentInductorLayoutChange: (layout) => calls.push(["layout", layout]),
      onInductorCouplingSelect: (couplingId) => calls.push(["select", couplingId]),
      onInductorCouplingAdd: () => calls.push(["add"])
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("inductor"),
        ref: "L1",
        inductorLayout: "double",
        inductor: {
          tap: "top",
          dot: "p",
          couplings: [{ id: "K12", partnerId: "L2-id", partnerRef: "L2" }],
          canAddCoupling: true,
          pickingCoupling: true
        }
      }
    });

    expect(fixture.inductorFields.hidden).toBe(false);
    expect(fixture.inductorLayoutRow.hidden).toBe(false);
    expect(fixture.inductorLayoutSelect.value).toBe("double");
    expect(fixture.inductorLayoutSelect.children.map(option => option.textContent)).toEqual(["single turn", "double turn"]);
    expect(fixture.inductorTapControl.children.map(button => button.textContent)).toEqual(["None", "Top", "Bot"]);
    expect(fixture.inductorTapControl.children.map((button) => button.ariaPressed))
      .toEqual(["false", "true", "false"]);
    expect(fixture.inductorDotControl.children.map((button) => button.ariaPressed))
      .toEqual(["false", "true", "false"]);
    expect(fixture.inductorCouplingList.children[0].children[1].textContent).toBe("L2");
    expect(fixture.inductorAddCouplingButton.disabled).toBe(false);
    expect(fixture.inductorAddCouplingButton.ariaPressed).toBe("true");
    expect(fixture.inductorAddCouplingButton.classList.contains("is-active")).toBe(true);

    fixture.root.dispatchEvent(new FakeEvent("click", fixture.inductorTapControl.children[2]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.inductorDotControl.children[2]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.inductorCouplingList.children[0].children[2]));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.inductorAddCouplingButton));
    fixture.inductorLayoutSelect.value = "single";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.inductorLayoutSelect));
    expect(calls).toEqual([
      ["tap", "bottom"],
      ["dot", "n"],
      ["select", "K12"],
      ["add"],
      ["layout", "single"]
    ]);
    fixture.controller.sync({ hasSelection: false });
    expect(fixture.inductorLayoutRow.hidden).toBe(true);
  });

  it("shows mixed layout turns without exposing single-inductor settings or hiding pair controls", () => {
    const changes: string[] = [];
    const fixture = createPropertyPanelFixture({ onComponentInductorLayoutChange: value => changes.push(value) });
    fixture.controller.bind();
    fixture.controller.sync({ hasSelection: true, component: {
      ...cellInput("inductor"), ref: mixed(), inductorLayout: mixed()
    }, inductorCoupling: { id: null, exists: false, firstRef: "L1", secondRef: "L2" } });
    expect(fixture.inductorLayoutRow.hidden).toBe(false);
    expect(fixture.inductorFields.hidden).toBe(true);
    expect(fixture.inductorLayoutSelect.value).toBe("");
    expect(fixture.inductorLayoutSelect.children.at(-1)).toMatchObject({ textContent: "Multiple values", disabled: true });
    expect(fixture.couplingForm.hidden).toBe(false);
    expect(fixture.couplingCreateButton.hidden).toBe(false);
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.inductorLayoutSelect));
    expect(changes).toEqual([]);
    fixture.inductorLayoutSelect.value = "single";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.inductorLayoutSelect));
    expect(changes).toEqual(["single"]);
    fixture.controller.sync({ hasSelection: true, component: {
      ...cellInput("inductor"), ref: mixed(), inductorLayout: "single"
    } });
    expect(fixture.inductorLayoutSelect.value).toBe("single");
    expect(fixture.inductorLayoutSelect.children).toHaveLength(2);
    expect(fixture.couplingForm.hidden).toBe(true);
  });

  it("syncs and dispatches coupling relation properties and pair creation", () => {
    const calls: unknown[][] = [];
    const fixture = createPropertyPanelFixture({
      onInductorCouplingCreate: () => calls.push(["create"]),
      onInductorCouplingCoefficientChange: (id, value) => calls.push(["coefficient", id, value]),
      onInductorCouplingAutoName: (id) => calls.push(["auto", id]),
      onInductorCouplingLabelModeChange: (id, mode) => calls.push(["label", id, mode]),
      onInductorCouplingShowLabelChange: (id, visible) => calls.push(["show-label", id, visible]),
      onInductorCouplingShowArcChange: (id, visible) => calls.push(["arc", id, visible]),
      onInductorCouplingShowCoreChange: (id, visible) => calls.push(["core", id, visible]),
      onInductorCouplingFlip: (id) => calls.push(["flip", id]),
      onInductorCouplingColorChange: (id, color) => calls.push(["color", id, color])
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      inductorCoupling: {
        id: "K12",
        exists: true,
        firstRef: "L1",
        secondRef: "L2",
        coefficient: "k12",
        coefficientAuto: true,
        labelMode: "coefficient",
        showLabel: true,
        ratioAvailable: true,
        showArc: true,
        showCore: false,
        arcFlipped: false,
        color: { state: "uniform", value: null }
      }
    });

    expect(fixture.couplingForm.hidden).toBe(false);
    expect(fixture.couplingPair.textContent).toBe("L1 - L2");
    expect(fixture.couplingExistingFields.hidden).toBe(false);
    expect(fixture.couplingCreateButton.hidden).toBe(true);
    expect(fixture.couplingCoefficientInput.value).toBe("k12");
    expect(fixture.couplingLabelModeControl.children.map((button) => button.ariaPressed))
      .toEqual(["true", "false"]);
    expect(fixture.couplingShowLabelInput.checked).toBe(true);
    expect(fixture.couplingShowArcInput.checked).toBe(true);
    expect(fixture.couplingShowCoreInput.checked).toBe(false);
    expect(fixture.couplingDefaultColorSwatch.ariaPressed).toBe("true");

    fixture.couplingCoefficientInput.value = "kCustom";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.couplingCoefficientInput));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.root.querySelector("[data-property-coupling-auto]")!));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.couplingLabelModeControl.children[1]));
    fixture.couplingShowLabelInput.checked = false;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.couplingShowLabelInput));
    fixture.couplingShowArcInput.checked = false;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.couplingShowArcInput));
    fixture.couplingShowCoreInput.checked = true;
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.couplingShowCoreInput));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.root.querySelector("[data-property-coupling-flip]")!));
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.couplingBlueColorSwatch));

    fixture.controller.sync({
      hasSelection: true,
      inductorCoupling: {
        id: null,
        exists: false,
        firstRef: "L3",
        secondRef: "L4"
      }
    });
    expect(fixture.couplingPair.textContent).toBe("L3 - L4");
    expect(fixture.couplingExistingFields.hidden).toBe(true);
    expect(fixture.couplingCreateButton.hidden).toBe(false);
    fixture.root.dispatchEvent(new FakeEvent("click", fixture.couplingCreateButton));

    expect(calls).toEqual([
      ["coefficient", "K12", "kCustom"],
      ["auto", "K12"],
      ["label", "K12", "ratio"],
      ["show-label", "K12", false],
      ["arc", "K12", false],
      ["core", "K12", true],
      ["flip", "K12"],
      ["color", "K12", "#005f9e"],
      ["create"]
    ]);
  });

  it("keeps generic component properties visible beside a two-inductor coupling", () => {
    const fixture = createPropertyPanelFixture();
    fixture.controller.sync({
      hasSelection: true,
      component: {
        ...cellInput("inductor"),
        ref: mixed(),
        color: uniform(null)
      },
      inductorCoupling: {
        id: "K12",
        exists: true,
        firstRef: "L1",
        secondRef: "L2",
        coefficient: "k12",
        showArc: true,
        showCore: false
      }
    });

    expect(fixture.componentForm.hidden).toBe(false);
    expect(fixture.componentColorRow.hidden).toBe(false);
    expect(fixture.couplingForm.hidden).toBe(false);
  });

  it("restores the projected coupling coefficient when a cleared edit is committed", () => {
    const calls: unknown[][] = [];
    const fixture = createPropertyPanelFixture({
      onInductorCouplingCoefficientChange: (id, value) => calls.push([id, value])
    });
    fixture.controller.bind();
    fixture.controller.sync({
      hasSelection: true,
      inductorCoupling: { showLabel: true,
        id: "K12",
        exists: true,
        firstRef: "L1",
        secondRef: "L2",
        coefficient: "k12",
        coefficientAuto: true,
        labelMode: "coefficient",
        ratioAvailable: true,
        showArc: true,
        showCore: false,
        arcFlipped: false
      }
    });

    fixture.couplingCoefficientInput.value = "";
    fixture.root.dispatchEvent(new FakeEvent("change", fixture.couplingCoefficientInput));

    expect(fixture.couplingCoefficientInput.value).toBe("k12");
    expect(calls).toEqual([]);
  });
});
