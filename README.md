# Jarvis Code v2.0

Agentic Coding CLI powered by Ollama Cloud. Streaming output, persistent conversation, diff previews, auto-context.

## Setup

```bash
git clone git@github.com:hybridpicker/jarvis-code.git
cd jarvis-code
npm install
cp .env.example .env
# Edit .env and add your OLLAMA_API_KEY
npm link
```

## Usage

```bash
cd ~/your-project
jarvis-code
```

### Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/model <name>` | Switch model (kimi-k2.5, qwen3-coder) |
| `/clear` | Clear conversation context |
| `/context` | Show project context |
| `/autoconfirm` | Toggle auto-confirm for file changes |
| `/exit` | Quit |

### Features

- **Streaming Output** — Tokens appear live as the model generates them
- **Conversation Mode** — Context persists across messages (use `/clear` to reset)
- **Diff Preview** — File changes shown as colored diffs before applying
- **Auto-Context** — Reads package.json, README, git info at startup
- **Safety** — Dangerous commands require confirmation, forbidden patterns blocked

### Tools

The agent has access to:
- `bash` — Run shell commands
- `read_file` — Read file contents
- `write_file` — Create/overwrite files (with diff preview)
- `edit_file` — Targeted text replacement (with diff preview)
- `list_directory` — Browse directory tree
- `search_files` — Grep through files

## Models

- **Kimi K2.5** (default) — Fast, capable coding model
- **Qwen3 Coder** — Alternative coding model

## License

MIT
