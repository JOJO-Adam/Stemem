// SPDX-License-Identifier: MIT
// host-harness.mjs — 宿主集成参考实现（ESM）。
//
// 这是「用户装上 Stemem 能否感知到」的临门一脚：MCP 连通只给了 9 个工具，
// 但没有任何东西每轮自动把人格态注回去 —— 宿主不调 snapshot，人格层就休眠。
//
// 分工（与 src/snapshot-cli.js 的重叠已统一）：
//   - src/snapshot-cli.js ＝ 一次性 CLI，专为宿主 hook（如 Claude Code UserPromptSubmit）设计，
//     单进程拉起即出 inject_prompt，不维持长连接。
//   - 本 harness ＝ 给需要「长连接 + 跨轮 event/tick」的活体 agent loop 用：spawn 起一个常驻
//     MCP server、preTurn() 调 snapshot 工具、postTurn() 回写 event。它拿到的 snapshot 与 CLI
//     完全一致 —— 因为 server 的 snapshot 工具与 CLI 共用 src/snapshot.js 的 buildSnapshot 单一真源。
//   两者不再各自拼装 snapshot 对象，不会漂移。
//
// 用法：
//   preTurn()  → 调 snapshot，返回可直接拼进 system prompt 的 inject_prompt
//   postTurn() → 把这一轮对话回写成一个 event，驱动人格演化
// 宿主只需在自己的 agent loop 里：systemPrompt = stememInject + baseSystemPrompt。
//
// 用法见 examples/harness-demo.mjs。
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "server.js");

export class StememHarness {
  constructor({ agentId = "host", stateDir, ocean, lang } = {}) {
    this.agentId = agentId;
    this.stateDir = stateDir;
    this.ocean = ocean;
    this.lang = lang || process.env.STEMEM_TONE_LANG || "en";
    this.proc = null;
    this._id = 0;
    this._pending = new Map();
    this._buf = "";
  }

  start() {
    const env = {
      ...process.env,
      STEMEM_AGENT_ID: this.agentId,
      ...(this.stateDir ? { STEMEM_STATE_DIR: this.stateDir } : {}),
    };
    const p = spawn(process.execPath, [SERVER], { env });
    this.proc = p;
    p.stdout.on("data", (d) => this._onData(d));
    p.stderr.on("data", (d) => process.stderr.write(`[stemem-server] ${d}`));
    return this;
  }

  _onData(d) {
    this._buf += d;
    let i;
    while ((i = this._buf.indexOf("\n")) >= 0) {
      const line = this._buf.slice(0, i).trim();
      this._buf = this._buf.slice(i + 1);
      if (!line) continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.id != null && this._pending.has(m.id)) {
        const r = this._pending.get(m.id);
        this._pending.delete(m.id);
        r(m);
      }
    }
  }

  _rpc(method, params) {
    return new Promise((res) => {
      const id = ++this._id;
      this._pending.set(id, res);
      this.proc.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params: params || {} }) + "\n"
      );
    });
  }

  _call(name, args) {
    return this._rpc("tools/call", { name, arguments: args || {} });
  }

  _text(m) {
    return m?.result?.content?.[0]?.text || "";
  }

  _json(t) {
    try {
      return JSON.parse(t);
    } catch {
      return {};
    }
  }

  async init() {
    await this._rpc("initialize", {}).catch(() => {});
    if (this.ocean) {
      return this._json(this._text(await this._call("init", { ocean: this.ocean })));
    }
    return null;
  }

  // 每个 agent 轮次开始前调用：返回可注入 system prompt 的人格块 + 完整状态。
  async preTurn() {
    const s = this._json(this._text(await this._call("snapshot", { lang: this.lang })));
    return { injectPrompt: s.inject_prompt || "", state: s };
  }

  // 每个 agent 轮次结束后调用：把这一轮的对话回写成 event，驱动人格演化。
  async postTurn({ userText = "", agentText = "", tags = ["turn"], driveDeltas = {} } = {}) {
    const text = `用户: ${userText}\nAgent: ${agentText}`;
    return this._json(
      this._text(await this._call("event", { text, tags, drive_deltas: driveDeltas }))
    );
  }

  async stop() {
    if (!this.proc) return;
    await new Promise((res) => {
      this.proc.stdin.end();
      setTimeout(() => {
        try {
          this.proc.kill();
        } catch {
          /* noop */
        }
        res();
      }, 300);
    });
    this.proc = null;
  }
}
