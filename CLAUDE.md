# Jarvis Code — Claude Code Instructions

## Project Overview

Standalone agentic coding CLI. Provider-agnostisch, leichtgewichtig, open-source.
Repo: `github.com/hybridpicker/jarvis-code`

## Architecture

```
bin/jarvis-code.js       → Entrypoint (shebang, .env, startREPL)
cli/index.js             → REPL + Slash Commands (/model, /providers, etc.)
cli/agent.js             → Agentic Loop + Conversation State
cli/providers/           → Multi-Provider Abstraction Layer
  base.js                → Abstract Provider Interface
  ollama.js              → Ollama Cloud Provider (Kimi K2.5, Qwen3 Coder)
  openai.js              → OpenAI Provider (GPT-4o, o1, o3)
  anthropic.js           → Anthropic Provider (Claude Sonnet, Opus, Haiku)
  local.js               → Local Ollama Server Provider
  registry.js            → Provider Registry + Model Resolution
cli/ollama.js            → Backward-compatible wrapper (delegates to providers/)
cli/tools.js             → 6 Tool Definitions + Implementations
cli/diff.js              → LCS Diff + Colored Output + Confirmations
cli/context.js           → Auto-Context (package.json, git, README)
cli/ui.js                → ANSI Colors, Spinner, Formatting
cli/safety.js            → Forbidden/Dangerous Pattern Detection
tests/                   → Jest, 14 Suites, 336 Tests, 95%+ Coverage
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
- Coverage-Ziel: 95%+ Statements, 90%+ Branches
- Run: `npm test` (jest --coverage)
- Watch: `npm run test:watch`

## Provider System

### Unterstützte Provider:
- **ollama** — Ollama Cloud (`OLLAMA_API_KEY`)
- **openai** — OpenAI API (`OPENAI_API_KEY`)
- **anthropic** — Anthropic API (`ANTHROPIC_API_KEY`)
- **local** — Lokaler Ollama Server (kein Key nötig)

### Model-Spec-Format:
`provider:model` (z.B. `openai:gpt-4o`, `anthropic:claude-sonnet`, `local:llama3`)

### Env-Variablen:
- `OLLAMA_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- `DEFAULT_PROVIDER` (default: `ollama`)
- `DEFAULT_MODEL` (default: provider-abhängig)

## Key Patterns

- Provider-Abstraction: Jeder Provider implementiert `chat()`, `stream()`, `isConfigured()`
- `registry.js` verwaltet aktiven Provider + Model, resolving von Model-Specs
- `agent.js` nutzt `registry.callStream()` mit `onToken` Callback für Streaming
- `ollama.js` ist Backward-compatible Wrapper (delegiert an Registry)
- Tool-Implementierungen sind async (wegen Confirmation Prompts)
- Conversation State ist global in agent.js (conversationMessages Array)
- Diff-Algorithmus: LCS (Longest Common Subsequence) mit DP-Tabelle
- Safety: 16 Forbidden Patterns (blocked) + 9 Dangerous Patterns (confirm)
- Auto-Context: Läuft bei jedem Prompt (package.json, git, README, .gitignore)
- Max 30 Iterationen pro User-Input im Agentic Loop
- Tool-Output wird bei 50KB abgeschnitten
