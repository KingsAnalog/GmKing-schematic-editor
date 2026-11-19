import { mountSchematicTab, initSchematicEditor } from "@edahelper/schematic/web";
import "@edahelper/schematic/styles/web.css";
import "./style.css";
const root = document.getElementById("app")!;
mountSchematicTab(root);
const editor = initSchematicEditor(root);
if (import.meta.hot) import.meta.hot.dispose(() => { void editor?.destroy(); });
