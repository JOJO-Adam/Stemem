#!/bin/bash
# SPDX-License-Identifier: MIT
# build-mcpb.sh — 打包 Stemem 为 MCPB bundle（.mcpb = zip + manifest.json）。
# 产物用于 Smithery「Local (MCPB Bundle)」通道及 Claude Desktop 等支持 MCPB 的宿主。
# 注意：Smithery 发布要求 manifest 带 tools 数组（serverCard），否则 API 400 "No values to set"。
# 用法：bash scripts/build-mcpb.sh   （在仓库根执行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
STAGE="$(mktemp -d /tmp/stemem-mcpb.XXXXXX)"
OUT="${1:-$ROOT/dist/stemem-$VERSION.mcpb}"

# ---------- 1. staging：运行时最小集（零依赖，无 node_modules） ----------
mkdir -p "$STAGE"
cp -R "$ROOT/src" "$ROOT/engine" "$STAGE/"
cp "$ROOT/package.json" "$ROOT/README.md" "$ROOT/LICENSE" "$ROOT/NOTICE" "$STAGE/"
cp "$ROOT/assets/icon.png" "$STAGE/icon.png"

# ---------- 2. 冒烟 + 实时提取 tools/list（写进 manifest.serverCard） ----------
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}'
LIST='{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
printf '%s\n%s\n' "$INIT" "$LIST" | (cd "$STAGE" && node src/server.js 2>/dev/null) > "$STAGE/.smoke.out"
grep -q '"serverInfo"' "$STAGE/.smoke.out" || { echo "smoke failed: no initialize response" >&2; exit 1; }
TOOLS_JSON="$(grep '"id":2' "$STAGE/.smoke.out" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const line=d.split("\n").find(l=>l.includes("\"id\":2"));
  if(!line){console.error("no tools/list response");process.exit(1);}
  const tools=JSON.parse(line).result.tools;
  if(!Array.isArray(tools)||tools.length===0){console.error("empty tools");process.exit(1);}
  console.log(JSON.stringify(tools));
});')"
rm -f "$STAGE/.smoke.out"

# ---------- 3. manifest.json（含 tools，供 Smithery serverCard） ----------
TOOLS_JSON="$TOOLS_JSON" node - "$STAGE" <<'EOF'
const fs = require("fs");
const stage = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(`${stage}/package.json`, "utf8"));
const tools = JSON.parse(process.env.TOOLS_JSON);
const manifest = {
  manifest_version: "0.3",
  name: pkg.name,
  display_name: "Stemem",
  version: pkg.version,
  description: "Identity-layer MCP runtime for AI agents: persistent personality state, emotion-driven tone drift, compression-immune memory. Local-first, zero egress, zero dependencies.",
  author: { name: "JOJO&Adam", url: "https://github.com/JOJO-Adam" },
  server: {
    type: "node",
    entry_point: "src/server.js",
    mcp_config: { command: "node", args: ["${__dirname}/src/server.js"], env: {} },
  },
  tools,
  keywords: ["mcp", "agent", "identity", "persona", "memory", "local-first", "emotion", "tone"],
  icon: "icon.png",
  license: pkg.license,
};
fs.writeFileSync(`${stage}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
console.error(`manifest: ${tools.length} tools captured`);
EOF

# ---------- 4. 压包 ----------
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$OUT" . -x '*.DS_Store')
rm -rf "$STAGE"
echo "OK -> $OUT ($(du -h "$OUT" | cut -f1))"
