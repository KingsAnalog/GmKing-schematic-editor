import { renderSchematicTab, initSchematicEditor } from "@edahelper/schematic/web";
import "@edahelper/schematic/styles/web.css";
import "./style.css";
const root = document.getElementById("app")!;
root.innerHTML = renderSchematicTab();
const editor = initSchematicEditor(root);
if (import.meta.hot) import.meta.hot.dispose(() => { void editor?.destroy(); });
