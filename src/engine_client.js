// SPDX-License-Identifier: MIT
// engine_client.js — 调用 Seele 引擎桥（seele_bridge.js，CLI 形态）的子进程封装。
//
// NeshamaEngine 已 vendored 进 engine/（IP 见 NOTICE，非引用不复制）。本文件通过
// 环境变量/路径指向 vendored 副本，默认无需配置；并在每轮 spawn 一个 node 子进程
// 跑 seele_bridge CLI，解析其单行 JSON 输出。状态落本地 JSON（SEELE_DATA），
// 跨会话/跨压缩确定性恢复。
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
    // 已 vendored 进本仓库 engine/
    path.resolve(__dirname, "../engine/seele_bridge.js"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("找不到 seele_bridge.js：请设置环境变量 SEELE_BRIDGE 指向 seele_bridge.js（本仓库已 vendored 进 engine/，正常情况下无需设置）");
}

// ---------- 解析 NeshamaEngine 真源（已 vendored 进 engine/，IP 归 JOJO/Neshama） ----------
export const ENGINE_PATH = resolveEngine();
function resolveEngine() {
  if (process.env.NESHAMA_ENGINE) return process.env.NESHAMA_ENGINE;
  const candidates = [
    path.resolve(__dirname, "../engine/neshama_engine.js"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // 正常情况下 vendored 副本存在，不会走到这里；缺失时提示配置而非回退到本机绝对路径
  throw new Error("找不到 NeshamaEngine：请设置环境变量 NESHAMA_ENGINE 指向 neshama_engine.js（本仓库已 vendored 进 engine/，正常情况下无需设置）");
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
