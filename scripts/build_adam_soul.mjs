#!/usr/bin/env node
// build_adam_soul.mjs — 通过真实 Stemem MCP server 走 JSON-RPC，
// 用 Adam 基线 OCEAN 初始化人格态，再 generate_soul 导出 Adam persona 的 SoulSpec v0.4 包。
//
// 用途（P2）：产出可进 ClawSouls 注册表的 Adam 人格包（clawsouls/adam/）。
// 副作用：在 .tmp_state/adam/seele_state.json 留下 Adam 人格态（跨会话可复跑）。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "src", "server.js");
const NODE = process.execPath;
const TARGET = path.join(ROOT, "clawsouls", "adam");
const STATE_DIR = path.join(ROOT, ".tmp_state");

// Adam 基线 OCEAN（来源：adam-persona-core → ADAM_OCEAN）
const ADAM_OCEAN = {
  openness: 0.78,
  conscientiousness: 0.55,
  extraversion: 0.34,
  agreeableness: 0.26,
  neuroticism: 0.62,
};

const env = {
  ...process.env,
  STEMEM_AGENT_ID: "adam",
  STEMEM_STATE_DIR: STATE_DIR,
};

const p = spawn(NODE, [SERVER], { env });
let buf = "";
let id = 0;
const pending = new Map();
p.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) {
      const r = pending.get(msg.id);
      pending.delete(msg.id);
      r(msg);
    }
  }
});

function rpc(method, params) {
  return new Promise((res) => {
    const myid = ++id;
    pending.set(myid, res);
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myid, method, params: params || {} }) + "\n");
  });
}
function call(name, args) {
  return rpc("tools/call", { name, arguments: args || {} });
}
function textOf(msg) {
  return msg?.result?.content?.[0]?.text || JSON.stringify(msg).slice(0, 300);
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

(async () => {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "build_adam_soul", version: "0.1.0" },
  });

  const initMsg = await call("init", { ocean: ADAM_OCEAN });
  const init = parse(textOf(initMsg));
  console.error("[init] OCEAN =", JSON.stringify(init.ocean || init.personality || init));

  const snapMsg = await call("snapshot");
  const snap = parse(textOf(snapMsg));
  console.error("[snapshot] dominant =", snap.top_emotion?.name, "/ drive =", snap.drive?.dominant);

  const genMsg = await call("generate_soul", { target_dir: TARGET });
  const gen = parse(textOf(genMsg));
  console.error("[generate_soul]", JSON.stringify(gen));

  p.stdin.end();
  setTimeout(() => p.kill(), 300);

  if (!gen.ok) {
    console.error("FAILED to generate Adam soul package");
    process.exit(1);
  }
  console.error("\n✅ Adam SoulSpec 包已生成：");
  for (const f of [gen.soul_json, gen.soul_md, gen.identity_md]) {
    console.error("   " + f + "  (" + (fs.existsSync(f) ? fs.statSync(f).size + "B" : "MISSING") + ")");
  }
})();
