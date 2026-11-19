type SchematicLanguage = "zh" | "en";

const ZH: Record<string, string> = {
  "sidebar.library": "器件库",
  "sidebar.properties": "属性",
  "sidebar.libraryLabel": "库",
  "sidebar.cells": "器件",
  "sidebar.all": "全部",
  "sidebar.empty": "该库中没有器件。",
  "browser.title": "添加器件",
  "browser.library": "库",
  "browser.cell": "器件",
  "browser.symbol": "符号",
  "browser.searchLibrary": "搜索库",
  "browser.searchCell": "搜索器件",
  "browser.empty": "没有匹配的器件",
  "browser.place": "放置",
  "browser.hint": "Enter 放置 · Esc 关闭",
  "browser.template": "模板",
  "browser.count": "{count} 个器件",
  "browser.countOne": "1 个器件",
  "right.analysis": "分析",
  "right.netlist": "网表",
  "right.diagnostics": "诊断",
  "right.analysisTitle": "符号分析",
  "right.netlistPlaceholder": "网表视图将在 R2 提供。",
  "right.diagnosticsPlaceholder": "诊断视图将在 R2 提供。",
  "log.title": "日志",
  "log.empty": "暂无记录。",
  "log.clear": "清空",
  "log.copy": "复制",
  "log.filter": "过滤",
  "log.search": "搜索日志",
  "log.all": "全部",
  "log.info": "信息",
  "log.warn": "警告",
  "log.error": "错误",
  "status.log": "日志",
  "toolbar.library": "器件库",
  "toolbar.analysis": "分析",
  "toolbar.netlist": "网表",
  "toolbar.check": "检查",
  "toolbar.log": "日志",
  "library.all": "全部",
  "library.sources": "源",
  "library.passives": "无源",
  "library.transistors": "晶体管",
  "library.amplifiers": "放大器",
  "library.digital": "数字",
  "library.blocks": "功能块",
  "library.shapes": "图形",
  "library.templates": "模板"
};

/** Hosts that expose a language switch (for example the site) publish AT_LANG. */
export function schematicLanguage(): SchematicLanguage {
  const current = (globalThis as { AT_LANG?: { current?: () => unknown } }).AT_LANG?.current?.();
  return current === "zh" ? "zh" : "en";
}

export function t(key: string, fallback: string): string {
  if (schematicLanguage() !== "zh") return fallback;
  return ZH[key] ?? fallback;
}
