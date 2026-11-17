declare module "nerdamer/all" { const nerdamer: any; export default nerdamer; }
declare module "*.svg?raw" { const svg: string; export default svg; }
interface Window { MathJax?: { startup?: { promise?: Promise<unknown> }; typesetPromise?: (elements?: Element[]) => Promise<unknown>; typesetClear?: (elements?: Element[]) => void; }; }
