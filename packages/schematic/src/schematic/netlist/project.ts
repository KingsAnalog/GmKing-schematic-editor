import { documentFromContent } from "../document/documentModel";
import { projectSheetOrder, type SchematicProject } from "../schematicProject";
import { buildStructuralNetlist } from "./build";
import type { NetlistDesign } from "./model";

export function buildProjectNetlist(project: SchematicProject): NetlistDesign {
  const sheets = projectSheetOrder(project).map(sheet => {
    const design = buildStructuralNetlist(documentFromContent(sheet.content), { hierarchy: true });
    return { ...design, name: sheet.name, diagnostics: design.diagnostics.map(item => ({ ...item, sheetId: sheet.id })) };
  });
  return { name: project.name, sheets, globalNets: [...project.globalNets],
    ports: sheets.find(sheet => sheet.name === project.sheets.find(item => item.id === project.topSheetId)?.name)?.ports ?? [],
    parameters: [], instances: sheets.flatMap(sheet => sheet.instances), diagnostics: sheets.flatMap(sheet => sheet.diagnostics) };
}
