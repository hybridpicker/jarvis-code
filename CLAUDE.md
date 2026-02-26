# Jarvis Code — Claude Code Instructions

## Project Overview

Standalone agentic coding CLI. Keine Abhängigkeit von jarvis-agent.
Repo: `github.com/hybridpicker/jarvis-code`

## Architecture

```
bin/jarvis-code.js  → Entrypoint (shebang, .env, startREPL)
cli/index.js        → REPL + Slash Commands
cli/agent.js        → Agentic Loop + Conversation State
cli/ollama.js       → Ollama Cloud API (Streaming + Fallback)
cli/tools.js        → 6 Tool Definitions + Implementations
cli/diff.js         → LCS Diff + Colored Output + Confirmations
cli/context.js      → Auto-Context (package.json, git, README)
cli/ui.js           → ANSI Colors, Spinner, Formatting
cli/safety.js       → Forbidden/Dangerous Pattern Detection
tests/              → Jest, 8 Suites, 173 Tests, 95% Coverage
```

## Commit Message Convention

```
feat: <kurze Beschreibung>
fix: <was gefixt wurde>
test: <Test-Beschreibung>
chore: <Maintenance>
```

Kein `Co-Authored-By: Claude` oder andere AI-Attributionen. NIEMALS.

## Git Rules

- **NIEMALS** `Co-Authored-By: Claude` oder andere Claude/Anthropic-Signaturen einfügen
- **NIEMALS** `--no-verify` bei git commit oder push
- Commits werden OHNE jegliche AI-Attribution gepusht

## Testing

- Framework: Jest
- Coverage-Ziel: 80%+
- Run: `npm test` (jest --coverage)
- Watch: `npm run test:watch`

## Ollama Cloud API

- **Base:** `https://ollama.com/api/chat`
- **Auth:** `Authorization: Bearer $OLLAMA_API_KEY`
- **Primary Model:** Kimi K2.5 (16384 tokens)
- **Fallback Model:** Qwen3 Coder (16384 tokens)
- **Streaming:** NDJSON (`stream: true`)
- **Temperature:** 0.2

## Key Patterns

- Tool-Implementierungen sind async (wegen Confirmation Prompts)
- Conversation State ist global in agent.js (conversationMessages Array)
- Diff-Algorithmus: LCS (Longest Common Subsequence) mit DP-Tabelle
- Safety: 16 Forbidden Patterns (blocked) + 9 Dangerous Patterns (confirm)
- Auto-Context: Läuft bei jedem Prompt (package.json, git, README, .gitignore)
- Max 30 Iterationen pro User-Input im Agentic Loop
- Tool-Output wird bei 50KB abgeschnitten
