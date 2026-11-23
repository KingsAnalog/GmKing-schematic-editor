declare module "nerdamer/all" { const nerdamer: any; export default nerdamer; }
declare module "*.svg?raw" { const svg: string; export default svg; }
interface Window {
  MathJax?: {
    startup?: { promise?: Promise<unknown> };
    typesetPromise?: (elements?: Element[]) => Promise<unknown>;
    typesetClear?: (elements?: Element[]) => void;
    tex2svg?: (tex: string, options: { display: boolean }) => HTMLElement;
    tex2svgPromise?: (tex: string, options: { display: boolean }) => Promise<HTMLElement>;
  };
}
