// smoke.test.js — 零依赖冒烟测试：启动 server，走完 initialize → tools/list → 工具调用。
// 运行：node test/smoke.test.js  （或 npm test）
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const __filename = new URL(import.meta.url).pathname;
const serverPath = path.resolve(path.dirname(__filename), "../src/server.js");
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "stemem-smoke-"));
const ENGINE = process.env.NESHAMA_ENGINE || path.resolve(path.dirname(__filename), "../engine/neshama_engine.js");

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed++; console.log("  ✓ " + label); }
  else { failed++; console.error("  ✗ " + label); }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        STEMEM_AGENT_ID: "smoke",
        STEMEM_STATE_DIR: stateDir,
        NESHAMA_ENGINE: ENGINE,
      },
      stdio: ["pipe", "pipe", "inherit"],
    });
    let buf = "";
    let idc = 0;
    const pending = new Map();
    function send(msg) { child.stdin.write(JSON.stringify(msg) + "\n"); }
    function rpc(method, params, notification = false) {
      return new Promise((res) => {
        const id = ++idc;
        pending.set(id, res);
        send(notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params });
      });
    }
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.id != null && pending.has(m.id)) {
          const r = m.result ?? m.error;
          pending.get(m.id)(r);
          pending.delete(m.id);
        }
      }
    });
    child.on("error", reject);
    rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0.1.0" },
    }).then(() => resolve({ child, rpc }));
  });
}

async function main() {
  console.log("Stemem MCP server smoke test");
  const { child, rpc } = await startServer();

  const initRes = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0.1.0" } });
  assert(initRes && initRes.capabilities && initRes.capabilities.tools, "initialize 返回 tools 能力");

  const listRes = await rpc("tools/list", {});
  assert(Array.isArray(listRes.tools) && listRes.tools.length === 9, `tools/list 返回 9 个工具（实得 ${listRes.tools?.length}）`);
  const got = (listRes.tools || []).map((t) => t.name).sort().join(",");
  const want = ["autostep", "event", "generate_soul", "init", "intervene", "satisfy", "snapshot", "status", "tick"].sort().join(",");
  assert(got === want, `工具集正确：${got}`);

  const initTool = await rpc("tools/call", { name: "init", arguments: {} });
  assert(initTool.content && JSON.parse(initTool.content[0].text).ok === true, "init 工具调用成功");

  const eventTool = await rpc("tools/call", { name: "event", arguments: { text: "JOJO 对我说了句话，我有点开心", tags: ["joy"] } });
  const ev = JSON.parse(eventTool.content[0].text);
  assert(ev.ok === true, "event 工具调用成功");

  const tickTool = await rpc("tools/call", { name: "tick", arguments: { seconds: 3600 } });
  assert(JSON.parse(tickTool.content[0].text).ok !== false, "tick 工具调用成功");

  const snapTool = await rpc("tools/call", { name: "snapshot", arguments: {} });
  const snap = JSON.parse(snapTool.content[0].text);
  assert(snap.inject_prompt && snap.inject_prompt.includes("STEMEM IDENTITY"), "snapshot 返回 inject_prompt（运行时契约注入串）");

  const soulTool = await rpc("tools/call", { name: "generate_soul", arguments: { target_dir: stateDir } });
  const soul = JSON.parse(soulTool.content[0].text);
  assert(soul.ok === true && fs.existsSync(path.join(stateDir, "SOUL.md")), "generate_soul 生成 SOUL.md");

  // 确定性恢复：重开 server（同 agent/state），snapshot 应恢复同一人格态
  child.stdin.end();
  const { child: child2, rpc: rpc2 } = await startServer();
  await rpc2("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0.1.0" } });
  const snap2Tool = await rpc2("tools/call", { name: "snapshot", arguments: {} });
  const snap2 = JSON.parse(snap2Tool.content[0].text);
  assert(
    JSON.stringify(snap2.ocean) === JSON.stringify(snap.ocean),
    "跨进程/跨重启确定性恢复人格态（compaction amnesia 解药）"
  );
  child2.stdin.end();

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("测试异常:", e); process.exit(1); });
