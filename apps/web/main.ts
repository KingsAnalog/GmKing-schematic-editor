import { mountSchematicTab, initSchematicEditor, registerMathJaxLoader } from "@edahelper/schematic/web";
import "@edahelper/schematic/styles/web.css";
import "./style.css";
import { createWebMathJaxLoader } from "./mathjax";

registerMathJaxLoader(window, createWebMathJaxLoader(window));
const root = document.getElementById("app")!;
mountSchematicTab(root);
const editor = initSchematicEditor(root);
if (import.meta.hot) import.meta.hot.dispose(() => { void editor?.destroy(); });
