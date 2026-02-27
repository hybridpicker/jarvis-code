# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-02-27

### Added
- **Multi-Provider Support** — Use any LLM provider: Ollama Cloud, OpenAI, Anthropic, or local Ollama
- `cli/providers/` — Provider abstraction layer with unified API
  - `base.js` — Abstract provider interface
  - `ollama.js` — Ollama Cloud provider (Kimi K2.5, Qwen3 Coder)
  - `openai.js` — OpenAI provider (GPT-4o, o1, o3, GPT-4o-mini)
  - `anthropic.js` — Anthropic provider (Claude Sonnet, Opus, Haiku)
  - `local.js` — Local Ollama server provider (auto-detect models)
  - `registry.js` — Provider registry + model resolution
- `/providers` command — Show available providers and their configuration status
- `/model list` command — List all models across all providers
- `/model provider:model` syntax — Switch provider and model in one command (e.g. `/model openai:gpt-4o`)
- `DEFAULT_PROVIDER` and `DEFAULT_MODEL` environment variables
- 163 new tests (336 total, up from 173)

### Changed
- `cli/agent.js` — Uses provider registry for API calls instead of direct Ollama calls
- `cli/ollama.js` — Refactored to thin wrapper over provider system (backward-compatible)
- `cli/index.js` — Enhanced `/model` command, added `/providers` command
- `cli/ui.js` — Version bump in banner
- Startup check: requires any configured provider (not just OLLAMA_API_KEY)

## [2.0.0] - 2026-02-26

### Added
- Initial release: Standalone agentic coding CLI
- 8 modules, 6 tools, 2 models
- LCS diff with colored output
- Safety: forbidden + dangerous pattern detection
- Auto-context: package.json, git, README, .gitignore
- 173 tests, 95% coverage
