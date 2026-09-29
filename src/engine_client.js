// engine_client.js — 调用 Seele 引擎桥（seele_bridge.js，CLI 形态）的子进程封装。
//
// 设计纪律（与 Seele 一致）：NeshamaEngine 真源只引用不复制。本文件不持有引擎代码，
// 仅通过环境变量/路径指向真源，并在每轮 spawn 一个 node 子进程跑 seele_bridge CLI，
// 解析其单行 JSON 输出。状态落本地 JSON（SEELE_DATA），跨会话/跨压缩确定性恢复。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- 解析 seele_bridge.js 路径 ----------
export const BRIDGE_PATH = resolveBridge();
function resolveBridge() {
  if (process.env.SEELE_BRIDGE) return process.env.SEELE_BRIDGE;
  const candidates = [
    // 若将来把引擎 vendored 进本仓库 engine/
    path.resolve(__dirname, "../engine/seele_bridge.js"),
    // JOJO 本机 Seele 引擎桥（已知位置）
    "/Users/jojo/AI_Projects/Seele/engine/seele_bridge.js",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("找不到 seele_bridge.js：请设置环境变量 SEELE_BRIDGE 指向 seele_bridge.js");
}

// ---------- 解析 NeshamaEngine 真源（人格引擎，IP 归 JOJO/Neshama） ----------
export const ENGINE_PATH = resolveEngine();
function resolveEngine() {
  if (process.env.NESHAMA_ENGINE) return process.env.NESHAMA_ENGINE;
  const candidates = [
    path.resolve(__dirname, "../engine/neshama_engine.js"),
    // JOJO 本机真源（资本 Neshama 消费产品目录，独立于本 identity-layer 项目）
    "/Users/jojo/AI_Projects/Neshama/Neshama_Sim/neshama_engine.js",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // 兜底默认值（bridge 自身也有解析逻辑）
  return "/Users/jojo/AI_Projects/Neshama/Neshama_Sim/neshama_engine.js";
}

// ---------- 状态文件路径（每 agent 独立，互不污染） ----------
export function stateFileFor(agentId) {
  const base =
    process.env.STEMEM_STATE_DIR ||
    path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", ".stemem");
  const id = agentId || process.env.STEMEM_AGENT_ID || "default";
  return path.join(base, id, "seele_state.json");
}

// ---------- 调用 bridge 子进程 ----------
export function callBridge(cmd, opts = {}, agentId = null) {
  return new Promise((resolve, reject) => {
    const args = [BRIDGE_PATH, cmd];
    for (const [k, v] of Object.entries(opts)) {
      if (v === undefined || v === null) continue;
      args.push(`--${k}`, String(v));
    }
    const env = {
      ...process.env,
      NESHAMA_ENGINE: ENGINE_PATH,
      SEELE_DATA: stateFileFor(agentId),
    };
    const p = spawn(process.execPath, args, { env });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", () => {
      out = out.trim();
      if (!out) {
        reject(new Error(`seele_bridge(${cmd}) 无输出：stderr=${err}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`seele_bridge(${cmd}) 输出非 JSON：${out} | stderr=${err}`));
      }
    });
  });
}
