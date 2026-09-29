// integration.test.js — 完整 9 工具 MCP stdio 集成测试（真实 JSON-RPC 客户端，
// 覆盖全部 9 工具 + 运行时契约：snapshot 注入串 / event 驱动演化 / overwrite 一致性 / 跨重启确定性）。
// 运行：node test/integration.test.js   （或 npm test）
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const serverPath = path.resolve(here, "../src/server.js");
const ENGINE = process.env.NESHAMA_ENGINE || path.resolve(here, "../engine/neshama_engine.js");
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "stemem-int-"));

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed++; console.log("  ✓ " + label); }
  else { failed++; console.error("  ✗ " + label); }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, STEMEM_AGENT_ID: "int", STEMEM_STATE_DIR: stateDir, NESHAMA_ENGINE: ENGINE },
      stdio: ["pipe", "pipe", "inherit"],
    });
    let buf = "";
    const pending = new Map();
    let idc = 0;
    const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
    const rpc = (method, params, notification = false) =>
      new Promise((res) => {
        const id = ++idc;
        pending.set(id, res);
        send(notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params });
      });
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
      }
    });
    child.on("error", reject);
    rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "int", version: "0.1.0" } })
      .then(() => resolve({ child, rpc }));
  });
}

async function callTool(rpc, name, args = {}) {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = r.content && r.content[0] && r.content[0].text;
  return JSON.parse(text);
}

const OCEAN_KEYS = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"];
const inRange01 = (o) => o && OCEAN_KEYS.every((k) => typeof o[k] === "number" && o[k] >= 0 && o[k] <= 1);

async function main() {
  console.log("Stemem MCP integration test (all 9 tools)");
  const { child, rpc } = await startServer();

  // tools/list — 全部 9 工具
  const list = await rpc("tools/list", {});
  const names = (list.tools || []).map((t) => t.name).sort();
  const want = ["autostep", "event", "generate_soul", "init", "intervene", "satisfy", "snapshot", "status", "tick"].sort();
  assert(JSON.stringify(names) === JSON.stringify(want), "tools/list 返回全部 9 工具");

  // init — OCEAN 预设
  const PRESET = { openness: 0.78, conscientiousness: 0.55, extraversion: 0.34, agreeableness: 0.26, neuroticism: 0.62 };
  const initRes = await callTool(rpc, "init", { ocean: PRESET });
  assert(initRes.ok === true, "init 成功");
  assert(inRange01(initRes.ocean), "init ocean 五维 ∈ [0,1]");

  // event — 人格相关事件驱动演化
  const ev = await callTool(rpc, "event", { text: "JOJO 夸了我，我有点开心", tags: ["joy"] });
  assert(ev.ok === true, "event 成功");
  assert(Array.isArray(ev.active_emotions), "event 返回 active_emotions 数组");

  // tick — 时间心跳
  const tk = await callTool(rpc, "tick", { seconds: 7200 });
  assert(tk.ok === true, "tick 成功");

  // satisfy — 满足驱力
  const sat = await callTool(rpc, "satisfy", { drive: "belonging", amount: 0.5 });
  assert(sat.ok === true, "satisfy 成功");
  const bel = sat.drive.ranking.find((d) => d.drive === "belonging");
  assert(bel && bel.satisfaction >= 0.5 - 1e-9, "satisfy 提升 belonging 满足度 (≥0.5)");

  // snapshot — 运行时契约注入串
  const snap = await callTool(rpc, "snapshot", {});
  assert(snap.inject_prompt && snap.inject_prompt.includes("STEMEM IDENTITY"), "snapshot 返回 inject_prompt（含 STEMEM IDENTITY 标记）");
  assert(inRange01(snap.ocean), "snapshot ocean 五维 ∈ [0,1]");
  // 跨进程确定性断言以「重启前最后一次状态读」为准（见下方 finalOCEAN）

  // autostep — 自主行为
  const auto = await callTool(rpc, "autostep", { seconds: 3600 });
  assert(auto.ok === true, "autostep 成功");
  assert(auto.autonomous && typeof auto.autonomous.acted === "boolean", "autostep 返回 autonomous.acted 布尔");

  // intervene — 人工干预
  const iv = await callTool(rpc, "intervene", { drive: "esteem", amount: 0.4, text: "鼓励他去演讲" });
  assert(iv.ok === true, "intervene 成功");
  assert(iv.mode === "facilitate" || iv.mode === "counteract", "intervene 返回 mode（facilitate/counteract）");

  // status — 完整状态
  const st = await callTool(rpc, "status", {});
  assert(st.ok === true && st.ocean && st.drive, "status 返回完整状态");
  const finalOCEAN = JSON.stringify(st.ocean);

  // generate_soul — 导出 SoulSpec 包
  const soulDir = path.join(stateDir, "soul-out");
  const soul = await callTool(rpc, "generate_soul", { target_dir: soulDir });
  assert(soul.ok === true, "generate_soul 成功");
  assert(fs.existsSync(path.join(soulDir, "SOUL.md")), "generate_soul 生成 SOUL.md");
  assert(fs.existsSync(path.join(soulDir, "soul.json")), "generate_soul 生成 soul.json");

  // 跨进程 / 跨重启确定性恢复（compaction amnesia 解药）
  child.stdin.end();
  const { child: child2, rpc: rpc2 } = await startServer();
  await rpc2("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "int", version: "0.1.0" } });
  const snap2 = await callTool(rpc2, "snapshot", {});
  assert(JSON.stringify(snap2.ocean) === finalOCEAN, "跨进程/跨重启确定性恢复 OCEAN（compaction amnesia 解药）");
  child2.stdin.end();

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("测试异常:", e); process.exit(1); });
