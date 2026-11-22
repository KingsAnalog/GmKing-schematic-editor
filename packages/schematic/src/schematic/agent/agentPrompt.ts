export const AGENT_ENDPOINT = "http://127.0.0.1:43765/agent";

interface PairingDetails {
  site: string;
  projectId: string;
  sheetId: string;
  code: string;
}

export function createAgentPrompt(details: PairingDetails, language: "en" | "zh") {
  const context = JSON.stringify({ apiVersion: "1.0", ...details }, null, 2);
  const pair = JSON.stringify({ method: "pair", code: details.code });
  return language === "zh" ? [
    "请通过本机 Schematic Agent 连接器协助我编辑电路。",
    `仅向 ${AGENT_ENDPOINT} 发送 JSON POST 请求。先发送 ${pair}，取得本次会话的 token。配对码两分钟内仅可使用一次。`,
    '发送 {"method":"snapshot","token":"<token>"}；每次修改前重新读取 revision，按照快照中的引脚坐标和网络规划。',
    '提交 {"method":"transact","token":"<token>","transaction":{"apiVersion":"1.0","requestId":"<unique-id>","baseRevision":0,"operations":[]}}。用读取的修订号替换 0；每次只提交一个事务。可先加 "dryRun":true 查看差异，用新的 requestId 正式提交。',
    "支持 add-component、add-wire、add-net-label、set-values、add-sheet、add-sheet-instance、set-port、remove-port。快照返回动作字段说明。",
    "遇到 REVISION_CONFLICT 时重新读取并调整计划。只使用这些接口，避免接触浏览器存储、其他文件或外部服务。结束时发送 disconnect。",
    "", context
  ].join("\n") : [
    "Help me edit this schematic through the local Schematic Agent connector.",
    `Send JSON POST requests only to ${AGENT_ENDPOINT}. Start with ${pair} and keep the returned session token in memory. The pairing code is single-use and expires in two minutes.`,
    'Read {"method":"snapshot","token":"<token>"} before every write. Plan from the latest revision, pin coordinates and named networks.',
    'Send {"method":"transact","token":"<token>","transaction":{"apiVersion":"1.0","requestId":"<unique-id>","baseRevision":0,"operations":[]}}. Replace 0 with the latest revision and submit one transaction per request. Use "dryRun":true to preview and a new requestId to apply.',
    "The snapshot describes the action fields for add-component, add-wire, add-net-label, set-values, add-sheet, add-sheet-instance, set-port and remove-port.",
    "If the page returns REVISION_CONFLICT, read the latest snapshot and replan. Use only these APIs. Keep circuit data away from browser storage, other files and external services. Send disconnect when finished.",
    "", context
  ].join("\n");
}
