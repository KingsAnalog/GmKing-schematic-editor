import nerdamer from "nerdamer/all";
import { extractNetlist } from "../netlist";
import type { AnalysisPortSelection, AnalysisResult, ExtractedNetlist, NetlistComponent, SchematicDocument } from "../types";
import { resolveComponentAnalysisModel } from "./componentAnalysisRegistry";
import { activeInductorCouplings } from "../inductorCouplingModel";
import { inductorTap } from "../inductorModel";

type Matrix = string[][];
type SolveMode = "transfer" | "impedance";
type TestPort = { p: string; n: string; branchKey: string };

const ZERO = "0";
const ONE = "1";
const TEX_PARSE_LIMIT = 360;
const OUTPUT_SIMPLIFY_LIMIT = 40;

function simplify(expression: string) {
  try {
    return nerdamer(`simplify(${expression})`).toString();
  } catch {
    return expression;
  }
}

function simplifyOutput(expression: string) {
  if (expression.length > OUTPUT_SIMPLIFY_LIMIT) return expression;
  const simplified = simplify(expression);
  if (simplified.length > OUTPUT_SIMPLIFY_LIMIT) return simplified;
  const candidates = [simplified, expandTopLevelInverseDenominator(simplified)].filter((candidate): candidate is string => !!candidate);
  return candidates.sort((a, b) => expressionScore(a) - expressionScore(b))[0] ?? simplified;
}

function expandTopLevelInverseDenominator(expression: string) {
  if (expression.length > OUTPUT_SIMPLIFY_LIMIT) return null;
  const inner = topLevelInverseInner(expression);
  if (!inner) return null;
  try {
    return nerdamer(`simplify(1/(expand(${inner})))`).toString();
  } catch {
    return null;
  }
}

function topLevelInverseInner(expression: string) {
  const suffix = "^(-1)";
  const trimmed = expression.trim();
  if (!trimmed.endsWith(suffix)) return null;
  return stripWrappingParens(trimmed.slice(0, -suffix.length));
}

function stripWrappingParens(expression: string) {
  let result = expression.trim();
  while (result.startsWith("(") && result.endsWith(")") && wrapsWholeExpression(result)) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function wrapsWholeExpression(expression: string) {
  let depth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < expression.length - 1) return false;
  }
  return depth === 0;
}

function expressionScore(expression: string) {
  return expression.length + (expression.match(/\^\(-1\)/g)?.length ?? 0) * 4 + (expression.match(/\^\(-/g)?.length ?? 0) * 2;
}

function toTeX(expression: string) {
  if (expression.length > TEX_PARSE_LIMIT) return expressionToPlainTeX(expression);
  try {
    return formatSymbolSubscripts(nerdamer(expression).toTeX());
  } catch {
    return expressionToPlainTeX(expression);
  }
}

function formatSymbolSubscripts(tex: string) {
  return tex.replace(/\b([A-Za-z]+)(\d+)\b/g, (_match, name: string, digits: string) => `${name}_{${digits}}`);
}

function expressionToPlainTeX(expression: string) {
  return formatSymbolSubscripts(expression)
    .replace(/\^\((-?\d+)\)/g, "^{$1}")
    .replace(/\*/g, "\\,");
}

function rawAdd(a: string, b: string) {
  if (a === ZERO) return b;
  if (b === ZERO) return a;
  return `(${a})+(${b})`;
}

function rawSub(a: string, b: string) {
  if (b === ZERO) return a;
  if (a === b) return ZERO;
  return `(${a})-(${b})`;
}

function rawMul(a: string, b: string) {
  if (a === ZERO || b === ZERO) return ZERO;
  if (a === ONE) return b;
  if (b === ONE) return a;
  if (a === "-1") return rawNeg(b);
  if (b === "-1") return rawNeg(a);
  return `(${a})*(${b})`;
}

function rawDiv(a: string, b: string) {
  if (a === ZERO) return ZERO;
  if (a === b) return ONE;
  if (b === ONE) return a;
  return `(${a})/(${b})`;
}

function rawNeg(a: string) {
  if (a === ZERO) return ZERO;
  if (a === "-1") return ONE;
  return `-(${a})`;
}

function add(a: string, b: string) {
  if (a === ZERO) return b;
  if (b === ZERO) return a;
  return simplify(`(${a})+(${b})`);
}

function sub(a: string, b: string) {
  if (b === ZERO) return a;
  return simplify(`(${a})-(${b})`);
}

function mul(a: string, b: string) {
  if (a === ZERO || b === ZERO) return ZERO;
  if (a === ONE) return b;
  if (b === ONE) return a;
  return simplify(`(${a})*(${b})`);
}

function div(a: string, b: string) {
  if (a === ZERO) return ZERO;
  if (b === ONE) return a;
  return simplify(`(${a})/(${b})`);
}

function neg(a: string) {
  if (a === ZERO) return ZERO;
  return simplify(`-(${a})`);
}

function isZero(expression: string) {
  return simplify(expression) === ZERO;
}

class MnaSystem {
  readonly variables: string[] = [];
  readonly nodeVar = new Map<string, number>();
  readonly branchVar = new Map<string, number>();
  a: Matrix = [];
  z: string[] = [];

  constructor(nets: string[]) {
    nets.filter((net) => net !== "0").forEach((net) => this.addVariable(`V_${net}`, "node", net));
  }

  private addVariable(name: string, kind: "node" | "branch", key: string) {
    const index = this.variables.length;
    this.variables.push(name);
    if (kind === "node") this.nodeVar.set(key, index);
    if (kind === "branch") this.branchVar.set(key, index);
    this.a.forEach((row) => row.push(ZERO));
    this.a.push(Array.from({ length: this.variables.length }, () => ZERO));
    this.z.push(ZERO);
    return index;
  }

  addBranch(key: string) {
    const existing = this.branchVar.get(key);
    if (existing !== undefined) return existing;
    return this.addVariable(`I_${key}`, "branch", key);
  }

  private node(net: string) {
    return net === "0" ? null : this.nodeVar.get(net) ?? null;
  }

  addA(row: number | null, col: number | null, value: string) {
    if (row === null || col === null || isZero(value)) return;
    this.a[row][col] = add(this.a[row][col], value);
  }

  addZ(row: number | null, value: string) {
    if (row === null || isZero(value)) return;
    this.z[row] = add(this.z[row], value);
  }

  stampAdmittance(p: string, n: string, admittance: string) {
    const pIndex = this.node(p);
    const nIndex = this.node(n);
    this.addA(pIndex, pIndex, admittance);
    this.addA(nIndex, nIndex, admittance);
    this.addA(pIndex, nIndex, neg(admittance));
    this.addA(nIndex, pIndex, neg(admittance));
  }

  stampCurrentSource(p: string, n: string, current: string) {
    this.addZ(this.node(p), neg(current));
    this.addZ(this.node(n), current);
  }

  stampVoltageSource(key: string, p: string, n: string, voltage: string) {
    const branch = this.addBranch(key);
    this.addA(this.node(p), branch, ONE);
    this.addA(this.node(n), branch, "-1");
    this.addA(branch, this.node(p), ONE);
    this.addA(branch, this.node(n), "-1");
    this.addZ(branch, voltage);
    return branch;
  }

  stampVcvs(key: string, p: string, n: string, cp: string, cn: string, gain: string) {
    const branch = this.stampVoltageSource(key, p, n, ZERO);
    this.addA(branch, this.node(cp), neg(gain));
    this.addA(branch, this.node(cn), gain);
  }

  stampVccs(p: string, n: string, cp: string, cn: string, gm: string) {
    this.addA(this.node(p), this.node(cp), gm);
    this.addA(this.node(p), this.node(cn), neg(gm));
    this.addA(this.node(n), this.node(cp), neg(gm));
    this.addA(this.node(n), this.node(cn), gm);
  }

  stampCccs(p: string, n: string, controlBranchKey: string, gain: string) {
    const control = this.branchVar.get(controlBranchKey);
    if (control === undefined) return;
    this.addA(this.node(p), control, gain);
    this.addA(this.node(n), control, neg(gain));
  }

  stampCcvs(key: string, p: string, n: string, controlBranchKey: string, transresistance: string) {
    const control = this.branchVar.get(controlBranchKey);
    const branch = this.stampVoltageSource(key, p, n, ZERO);
    if (control !== undefined) {
      this.addA(branch, control, neg(transresistance));
    }
  }
}

function solveLinear(system: MnaSystem) {
  const n = system.variables.length;
  const m = system.a.map((row, rowIndex) => [...row, system.z[rowIndex]]);

  for (let pivot = 0; pivot < n; pivot += 1) {
    let pivotRow = pivot;
    while (pivotRow < n && isZero(m[pivotRow][pivot])) {
      pivotRow += 1;
    }
    if (pivotRow === n) {
      throw new Error("Symbolic MNA matrix is singular.");
    }
    if (pivotRow !== pivot) {
      [m[pivot], m[pivotRow]] = [m[pivotRow], m[pivot]];
    }

    const pivotValue = m[pivot][pivot];
    for (let col = pivot; col <= n; col += 1) {
      m[pivot][col] = div(m[pivot][col], pivotValue);
    }

    for (let row = 0; row < n; row += 1) {
      if (row === pivot) continue;
      const factor = m[row][pivot];
      if (isZero(factor)) continue;
      for (let col = pivot; col <= n; col += 1) {
        m[row][col] = sub(m[row][col], mul(factor, m[pivot][col]));
      }
    }
  }

  const solution = new Map<string, string>();
  system.variables.forEach((variable, index) => solution.set(variable, simplify(m[index][n])));
  return solution;
}

function netVoltage(solution: Map<string, string>, net: string) {
  return net === "0" ? ZERO : solution.get(`V_${net}`) ?? ZERO;
}

function voltageDifference(solution: Map<string, string>, p: string, n: string) {
  return sub(netVoltage(solution, p), netVoltage(solution, n));
}

function valueOf(component: NetlistComponent) {
  const valueKey = component.def.valueKey;
  if (!valueKey) return component.instance.ref;
  return component.instance.values[valueKey] ?? component.def.defaultValues?.[valueKey] ?? component.instance.ref;
}

function analysisModelOf(component: NetlistComponent) {
  return resolveComponentAnalysisModel(component.instance);
}

function passiveRcAdmittance(component: NetlistComponent) {
  const value = valueOf(component);
  const model = analysisModelOf(component);
  if (model === "resistor") return `1/(${value})`;
  if (model === "capacitor") return `s*(${value})`;
  return "";
}

function analysisComponents(netlist: ExtractedNetlist) {
  return netlist.components.filter((component) => analysisModelOf(component) !== "annotation");
}

function isPassiveRcNetlist(netlist: ExtractedNetlist) {
  return analysisComponents(netlist).every((component) =>
    ["ground", "resistor", "capacitor"].includes(analysisModelOf(component))
  );
}

function solvePassiveRcKnownVoltages(netlist: ExtractedNetlist, knownVoltages: Map<string, string>) {
  const unknownNets = Array.from(netlist.nets.keys()).filter((net) => !knownVoltages.has(net));
  const indexByNet = new Map(unknownNets.map((net, index) => [net, index]));
  const matrix = Array.from({ length: unknownNets.length }, () => Array.from({ length: unknownNets.length }, () => ZERO));
  const rhs = Array.from({ length: unknownNets.length }, () => ZERO);
  const addMatrix = (row: number, column: number, value: string) => {
    matrix[row][column] = rawAdd(matrix[row][column], value);
  };
  const addRhs = (row: number, value: string) => {
    rhs[row] = rawAdd(rhs[row], value);
  };

  analysisComponents(netlist).forEach((component) => {
    const admittance = passiveRcAdmittance(component);
    if (!admittance) return;
    const p = component.pins.p;
    const n = component.pins.n;
    const pIndex = indexByNet.get(p);
    const nIndex = indexByNet.get(n);
    const pKnown = knownVoltages.get(p);
    const nKnown = knownVoltages.get(n);

    if (pIndex !== undefined) {
      addMatrix(pIndex, pIndex, admittance);
      if (nIndex !== undefined) {
        addMatrix(pIndex, nIndex, rawNeg(admittance));
      } else {
        addRhs(pIndex, rawMul(admittance, nKnown ?? ZERO));
      }
    }

    if (nIndex !== undefined) {
      addMatrix(nIndex, nIndex, admittance);
      if (pIndex !== undefined) {
        addMatrix(nIndex, pIndex, rawNeg(admittance));
      } else {
        addRhs(nIndex, rawMul(admittance, pKnown ?? ZERO));
      }
    }
  });

  const solvedUnknowns = solveRawLinear(matrix, rhs);
  const solution = new Map<string, string>();
  knownVoltages.forEach((value, net) => solution.set(net, value));
  unknownNets.forEach((net, index) => solution.set(net, solvedUnknowns[index] ?? ZERO));
  return solution;
}

function solveRawLinear(matrix: Matrix, rhs: string[]) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index] ?? ZERO]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    while (pivotRow < size && augmented[pivotRow][pivot] === ZERO) pivotRow += 1;
    if (pivotRow === size) throw new Error("Passive RC admittance matrix is singular.");
    if (pivotRow !== pivot) {
      const row = augmented[pivot];
      augmented[pivot] = augmented[pivotRow];
      augmented[pivotRow] = row;
    }

    const pivotValue = augmented[pivot][pivot];
    for (let column = pivot + 1; column <= size; column += 1) {
      augmented[pivot][column] = rawDiv(augmented[pivot][column], pivotValue);
    }
    augmented[pivot][pivot] = ONE;

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      if (factor === ZERO) continue;
      for (let column = pivot + 1; column <= size; column += 1) {
        augmented[row][column] = rawSub(augmented[row][column], rawMul(factor, augmented[pivot][column]));
      }
      augmented[row][pivot] = ZERO;
    }
  }
  return augmented.map((row) => row[size] ?? ZERO);
}

function passiveRcVoltage(solution: Map<string, string>, net: string) {
  return solution.get(net) ?? ZERO;
}

function passiveRcVoltageDifference(solution: Map<string, string>, p: string, n: string) {
  return rawSub(passiveRcVoltage(solution, p), passiveRcVoltage(solution, n));
}

function passiveRcPortCurrent(netlist: ExtractedNetlist, solution: Map<string, string>, positiveNet: string) {
  let current = ZERO;
  analysisComponents(netlist).forEach((component) => {
    const admittance = passiveRcAdmittance(component);
    if (!admittance) return;
    const p = component.pins.p;
    const n = component.pins.n;
    if (p === positiveNet) {
      current = rawAdd(current, rawMul(admittance, `(${passiveRcVoltage(solution, p)})-(${passiveRcVoltage(solution, n)})`));
    } else if (n === positiveNet) {
      current = rawAdd(current, rawMul(admittance, `(${passiveRcVoltage(solution, n)})-(${passiveRcVoltage(solution, p)})`));
    }
  });
  return current;
}

function analyzePassiveRc(netlist: ExtractedNetlist, selection: AnalysisPortSelection): AnalysisResult | null {
  if (!isPassiveRcNetlist(netlist)) return null;

  const transferKnown = new Map<string, string>([
    [selection.inputP, ONE],
    [selection.inputN, ZERO]
  ]);
  const transferSolution = solvePassiveRcKnownVoltages(netlist, transferKnown);
  const transferExpression = simplifyOutput(passiveRcVoltageDifference(transferSolution, selection.outputP, selection.outputN));

  const inputKnown = new Map<string, string>([
    [selection.inputP, ONE],
    [selection.inputN, ZERO]
  ]);
  const inputSolution = solvePassiveRcKnownVoltages(netlist, inputKnown);
  const inputCurrent = passiveRcPortCurrent(netlist, inputSolution, selection.inputP);
  const inputImpedanceExpression = simplifyOutput(`1/(${inputCurrent})`);

  let outputImpedanceExpression = ZERO;
  if (!hasIdealVoltageBranchAtPort(netlist.components, selection.outputP, selection.outputN)) {
    const outputKnown = new Map<string, string>([
      [selection.inputP, ZERO],
      [selection.inputN, ZERO],
      [selection.outputP, ONE],
      [selection.outputN, ZERO]
    ]);
    const outputSolution = solvePassiveRcKnownVoltages(netlist, outputKnown);
    const outputCurrent = passiveRcPortCurrent(netlist, outputSolution, selection.outputP);
    outputImpedanceExpression = simplifyOutput(`1/(${outputCurrent})`);
  }

  return {
    ok: true,
    diagnostics: [],
    transferExpression,
    transferTex: toTeX(transferExpression),
    inputImpedanceExpression,
    inputImpedanceTex: toTeX(inputImpedanceExpression),
    outputImpedanceExpression,
    outputImpedanceTex: toTeX(outputImpedanceExpression),
    equations: []
  };
}

function addSenseBranches(system: MnaSystem, components: NetlistComponent[]) {
  components.forEach((component) => {
    const model = analysisModelOf(component);
    if (model !== "cccs" && model !== "ccvs") return;
    system.stampVoltageSource(`${component.instance.ref}_sense`, component.pins.sp, component.pins.sn, ZERO);
  });
}

function samePort(aP: string, aN: string, bP: string, bN: string) {
  return (aP === bP && aN === bN) || (aP === bN && aN === bP);
}

function stampComponent(
  system: MnaSystem,
  component: NetlistComponent,
  options: { inputP: string; inputN: string; mode: SolveMode; testPort?: TestPort }
) {
  const value = valueOf(component);
  const model = analysisModelOf(component);
  if (model === "resistor") system.stampAdmittance(component.pins.p, component.pins.n, `1/(${value})`);
  if (model === "capacitor") system.stampAdmittance(component.pins.p, component.pins.n, `s*(${value})`);
  if (model === "inductor") system.stampAdmittance(component.pins.p, component.pins.n, `1/(s*(${value}))`);
  if (model === "impedance") system.stampAdmittance(component.pins.p, component.pins.n, `1/(${value})`);
  if (model === "currentSource") {
    const current = options.mode === "impedance" ? ZERO : value;
    system.stampCurrentSource(component.pins.p, component.pins.n, current);
  }
  if (model === "voltageSource") {
    const sourceMatchesInput = samePort(component.pins.p, component.pins.n, options.inputP, options.inputN);
    const sourceMatchesTest = options.testPort ? samePort(component.pins.p, component.pins.n, options.testPort.p, options.testPort.n) : false;
    if (options.mode === "impedance" && sourceMatchesTest) {
      return;
    }
    const voltage = options.mode === "transfer" && sourceMatchesInput ? "Vin" : ZERO;
    system.stampVoltageSource(component.instance.ref, component.pins.p, component.pins.n, voltage);
  }
  if (model === "vcvs") system.stampVcvs(component.instance.ref, component.pins.p, component.pins.n, component.pins.cp, component.pins.cn, value);
  if (model === "vccs") system.stampVccs(component.pins.p, component.pins.n, component.pins.cp, component.pins.cn, value);
  if (model === "cccs") system.stampCccs(component.pins.p, component.pins.n, `${component.instance.ref}_sense`, value);
  if (model === "ccvs") system.stampCcvs(component.instance.ref, component.pins.p, component.pins.n, `${component.instance.ref}_sense`, value);
  if (model === "opAmp") system.stampVcvs(component.instance.ref, component.pins.out, "0", component.pins.inp, component.pins.inn, value);
  if (model === "ota") system.stampVccs(component.pins.out, "0", component.pins.inp, component.pins.inn, value);
  if (model === "diffAmp") system.stampVcvs(component.instance.ref, component.pins.outp, component.pins.outn, component.pins.inp, component.pins.inn, value);
  if (model === "diffOta") system.stampVccs(component.pins.outp, component.pins.outn, component.pins.inp, component.pins.inn, value);
  if (model === "idealGm") system.stampVccs(component.pins.out, component.pins.ref, component.pins.inp, component.pins.inn, value);
}

function buildSystem(netlist: ExtractedNetlist, selection: AnalysisPortSelection, mode: SolveMode, testPort?: TestPort) {
  const nets = Array.from(netlist.nets.keys());
  const components = analysisComponents(netlist);
  const system = new MnaSystem(nets);
  addSenseBranches(system, components);
  components.forEach((component) => stampComponent(system, component, { inputP: selection.inputP, inputN: selection.inputN, mode, testPort }));
  if (mode === "transfer") {
    const hasInputSource = components.some((component) => {
      if (analysisModelOf(component) !== "voltageSource") return false;
      return samePort(component.pins.p, component.pins.n, selection.inputP, selection.inputN);
    });
    if (!hasInputSource) {
      system.stampVoltageSource("Vin_test", selection.inputP, selection.inputN, "Vin");
    }
  } else if (testPort) {
    system.stampVoltageSource(testPort.branchKey, testPort.p, testPort.n, "Vtest");
  }
  return system;
}

function hasIdealVoltageBranchAtPort(components: NetlistComponent[], p: string, n: string) {
  return components.some((component) => {
    const model = analysisModelOf(component);
    if (model === "voltageSource" || model === "vcvs" || model === "ccvs") {
      return samePort(component.pins.p, component.pins.n, p, n);
    }
    if (model === "opAmp") {
      return samePort(component.pins.out, "0", p, n);
    }
    if (model === "diffAmp") {
      return samePort(component.pins.outp, component.pins.outn, p, n);
    }
    return false;
  });
}

function validate(
  netlist: ExtractedNetlist,
  selection: AnalysisPortSelection,
  document: SchematicDocument
) {
  const diagnostics = [...netlist.diagnostics];
  const components = analysisComponents(netlist);
  const nets = new Set(netlist.nets.keys());
  if (!nets.has("0")) diagnostics.push("No reference ground. Add a ground symbol or a net label named 0.");
  ["inputP", "inputN", "outputP", "outputN"].forEach((key) => {
    const value = selection[key as keyof AnalysisPortSelection];
    if (!value || !nets.has(value)) diagnostics.push(`Missing or invalid ${key} net selection.`);
  });
  if (components.some((component) => analysisModelOf(component) === "mosfet")) {
    diagnostics.push("MOSFET small-signal s-domain analysis is reserved for a later version.");
  }
  if (components.some((component) => analysisModelOf(component) === "bjt")) {
    diagnostics.push("BJT small-signal s-domain analysis is not yet supported.");
  }
  if (components.some((component) =>
    component.instance.type === "inductor" && inductorTap(component.instance) !== "none"
  )) {
    diagnostics.push("Center-tapped inductor symbolic s-domain analysis is not yet supported.");
  }
  if (activeInductorCouplings(document).length > 0) {
    diagnostics.push("Coupled-inductor symbolic s-domain analysis is not yet supported.");
  }
  components
    .filter((component) => analysisModelOf(component) === "blackBox")
    .forEach((component) => {
      diagnostics.push(`${component.instance.ref} is a black box without a symbolic analysis model.`);
    });
  components.forEach((component) => {
    const model = analysisModelOf(component);
    if ((model === "cccs" || model === "ccvs") && (!component.pins.sp || !component.pins.sn)) {
      diagnostics.push(`${component.instance.ref} needs explicit sense pins for current-controlled analysis.`);
    }
  });
  return diagnostics;
}

export function analyzeSchematic(document: SchematicDocument, selection: AnalysisPortSelection): AnalysisResult {
  const netlist = extractNetlist(document);
  const diagnostics = validate(netlist, selection, document);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  try {
    const passiveRcResult = analyzePassiveRc(netlist, selection);
    if (passiveRcResult) return passiveRcResult;

    const transferSystem = buildSystem(netlist, selection, "transfer");
    const transferSolution = solveLinear(transferSystem);
    const vout = voltageDifference(transferSolution, selection.outputP, selection.outputN);
    const transferExpression = simplifyOutput(`(${vout})/Vin`);

    const zinSystem = buildSystem(netlist, selection, "impedance", { p: selection.inputP, n: selection.inputN, branchKey: "Zin_test" });
    const zinSolution = solveLinear(zinSystem);
    const testCurrent = zinSolution.get("I_Zin_test") ?? ZERO;
    const inputImpedanceExpression = simplifyOutput(`Vtest/(-(${testCurrent}))`);

    let outputImpedanceExpression = ZERO;
    if (!hasIdealVoltageBranchAtPort(netlist.components, selection.outputP, selection.outputN)) {
      const zoutSystem = buildSystem(netlist, selection, "impedance", { p: selection.outputP, n: selection.outputN, branchKey: "Zout_test" });
      const zoutSolution = solveLinear(zoutSystem);
      const outputTestCurrent = zoutSolution.get("I_Zout_test") ?? ZERO;
      outputImpedanceExpression = simplifyOutput(`Vtest/(-(${outputTestCurrent}))`);
    }

    return {
      ok: true,
      diagnostics: [],
      transferExpression,
      transferTex: toTeX(transferExpression),
      inputImpedanceExpression,
      inputImpedanceTex: toTeX(inputImpedanceExpression),
      outputImpedanceExpression,
      outputImpedanceTex: toTeX(outputImpedanceExpression),
      equations: transferSystem.variables
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [error instanceof Error ? error.message : "Symbolic analysis failed."]
    };
  }
}
