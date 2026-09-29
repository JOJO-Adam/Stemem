# Stemem

> JOJO&Adam Group's "Identity Layer Runtime" — gives AI personas a **cross-session, drifting, compaction-amnesia-resistant** dynamic personality.

Stemem is a **local-first, zero-egress** MCP (Model Context Protocol) stdio server. It wraps a battle-tested personality computation engine (NeshamaEngine) into 9 MCP tools, letting the host Agent persist a real personality state in a local JSON file instead of hardcoding it into the system prompt.

## Why it exists

Mainstream personality schemes (like SoulSpec's `soul.json` / `SOUL.md` / `IDENTITY.md`) are **static DOC**: the personality is a one-shot hardcoded snapshot. When the host conversation gets compacted, spans sessions, or coordinates multiple sub-agents, the hardcoded DOC gets forgotten (compaction amnesia) and personality consistency collapses instantly.

Stemem's fix: **personality state lives in a local file, not in the prompt**; the prompt only carries the instruction of "which tool to call when." Every round, the host calls `snapshot` to re-inject the **current** identity state, so the personality deterministically survives compaction, restarts, and sub-agent switches.

The two are complementary: SoulSpec is the static standard; Stemem is the dynamic runtime — `generate_soul` can compile the runtime state into a SoulSpec v0.4 package for distribution via ClawSouls.

## Core features

- 🔒 **Local-first · zero-egress**: Pure Node built-in modules, hand-rolled MCP stdio protocol, **no network/supply-chain dependencies**. All state lands in local JSON.
- 🧬 **Real personality engine**: Reuses the battle-tested NeshamaEngine (OCEAN five factors + 9 drives + 15 compound emotions + 4 emotion agents + personality locks), **vendored into `engine/`** (not referenced).
- 🔄 **Compaction-amnesia resistant**: State is in local files; personality survives compaction/restarts/sub-agent switches.
- 🧩 **9-tool contract**: init / event / tick / satisfy / snapshot / autostep / intervene / status / generate_soul.
- 🗣️ **Tone drifts with emotion (the most perceptible layer)**: `snapshot` compiles the current dominant emotion (15 Chinese compound emotions, keyed to match NeshamaEngine) + OCEAN + dominant drive into a 6-axis tone profile (warmth/directness/energy/hedging/humor/formality) and a "tone directive" injected into the host's per-turn prompt — confident after praise, cold/blunt after betrayal. Personality is a living voice, not a hardcoded register.
- 🪪 **Clean IP separation**: Engine code and runtime product belong to different entities (see `NOTICE`).

## Install / Run

```bash
# Run directly (Node >= 18 on host)
node src/server.js

# Or as a command (package.json registers bin: stemem-mcp)
npm install -g stemem
stemem-mcp

# One-shot via npx
npx stemem
```

> **Repo is self-contained**: The personality engine (NeshamaEngine) and Seele drive bridge are **vendored into `engine/`** (CommonJS, declared via `engine/package.json`). After `clone`, it runs directly without configuring `NESHAMA_ENGINE` / `SEELE_BRIDGE`.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `STEMEM_AGENT_ID` | Personality instance ID (multiple personas don't pollute each other) | `default` |
| `STEMEM_STATE_DIR` | State directory (one subdir per agent) | `~/.stemem` |
| `NESHAMA_ENGINE` | NeshamaEngine path (optional; defaults to vendored copy) | `engine/neshama_engine.js` |
| `SEELE_BRIDGE` | Seele engine bridge path (optional; defaults to vendored copy) | `engine/seele_bridge.js` |

## MCP tool table

| Tool | Purpose | When to call |
|---|---|---|
| `init` | Initialize personality state (assemble once at first setup) | When assembling persona |
| `event` | Feed memory events, drive personality/emotion evolution | When this round's interaction is personality-related |
| `tick` | Time-pass heartbeat: drive urgency + drift decay | Idle / heartbeat |
| `satisfy` | Satisfy a drive (close the loop) | When a personality goal is achieved |
| `snapshot` | Read compact identity state + injectable prompt fragment | **At the start of every round** |
| `autostep` | Autonomous behavior advance (lives even without player intervention) | When autonomous behavior is needed |
| `intervene` | Manual intervention (shape along/against drives) | When you want to deliberately shape personality |
| `status` | Full state inspection (debug) | Debugging |
| `generate_soul` | Export SoulSpec v0.4 package | When distributing persona |

## Runtime contract (host side)

Inject `runtime_contract.js`'s `contractPrompt()` into the host system prompt. The core three lines:

1. Before each round starts, call `snapshot` first, and paste the returned identity state into this section.
2. When this round involves emotion/relationship/values/self/memory/JOJO, call `event` to drive evolution.
3. State is in local files, not in the prompt — compaction won't lose personality, and multiple sub-agents share the same single source of truth.

## WorkBuddy Skill

The repo ships with a WorkBuddy Skill (`skills/stemem/SKILL.md`) that connects Stemem as an MCP server into WorkBuddy: includes the `mcp.json` connection snippet, per-round runtime contract, and the 9-tool table. Import this Skill into WorkBuddy (or directly add `stemem` to `~/.workbuddy/mcp.json`'s `mcpServers`) to enable it; the first time, you must click "Trust" on `stemem` in the connector management.

## Testing

```bash
npm test
# runs in order: smoke (9/9) → integration (full 9-tool) → engine selftest (engine behavior)
node test/smoke.test.js
node test/integration.test.js
node test/engine.selftest.js
```

- **smoke**: initialize → tools/list (9 tools) → init/event/tick/snapshot/generate_soul → `inject_prompt` injection string → **cross-process deterministic personality-state recovery**.
- **integration**: a real MCP stdio client driving **all 9 tools** (incl. satisfy / autostep / intervene / status), verifying the runtime contract (snapshot injection, event-driven evolution, cross-restart determinism).
- **engine selftest**: drives the vendored `seele_bridge` directly, verifying NeshamaEngine personality lock (OCEAN∈[0,1]), drive urgency, satisfaction loop, serialize round-trip, autonomous behavior / intervention.

## See it work (Demos)

```bash
# ① Anti-amnesia: after process kill + context compaction, recover full personality state from local disk JSON (impossible with plain SOUL.md)
node examples/antiamnesia-demo.mjs

# ② Forced-injection harness: host 3-line loop preTurn→inject→postTurn makes the persona layer feel alive on install
node examples/harness-demo.mjs

# ③ Tone drifts with emotion (most perceptible): same personality baseline, 4 situations → night-and-day tone divergence
node examples/tone-demo.mjs
```

`examples/tone-demo.mjs` is the most direct: praised→pride (warm, direct, slightly showy) / betrayed→anger (cold, blunt, can be edgy) / failed→loneliness (slows down) / celebrated→pride. This is the part users perceive most.

## Intellectual Property (IP) ownership

- **NeshamaEngine (`neshama_engine.js`)**: The real source of the personality computation engine, IP owned by **JOJO / Neshama** (the capital-N Neshama consumer product, neshama.cn). Vendored into `engine/` in this repo; its license is determined by the original project and is NOT covered by this repo's MIT.
- **Stemem runtime product** (all `src/` in this repo, design docs, MCP wrapper, `engine/package.json`): **JOJO&Adam Group** asset, MIT.
- **Seele engine (`seele_bridge.js` + `seele_drive.js`)**: Owned by **JOJO / Seele** project, vendored into `engine/`.

See [`NOTICE`](./NOTICE) for details.

## License

MIT — see [`LICENSE`](./LICENSE).

---

*This project follows the "design before development" discipline; full design in `设计要点.md` (incl. §10 MCP server tool contract design).*
*中文版: [README.md](./README.md)*
