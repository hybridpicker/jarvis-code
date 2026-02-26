/**
 * cli/tools.js — Tool Definitions + Implementations
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { isForbidden, isDangerous, confirm } = require('./safety');
const { showEditDiff, showWriteDiff, showNewFilePreview, confirmFileChange } = require('./diff');
const { C } = require('./ui');

const CWD = process.cwd();

function resolvePath(p) {
  if (path.isAbsolute(p)) return p;
  return path.resolve(CWD, p);
}

// ─── Tool Definitions (Ollama format) ─────────────────────────
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description:
        'Execute a bash command in the project directory. Max timeout 90s. Use for running tests, installing packages, git commands, etc.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'The bash command to execute' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: "Read a file's contents. Supports optional line range.",
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (relative or absolute)' },
          line_start: { type: 'number', description: 'Start line (1-based, optional)' },
          line_end: { type: 'number', description: 'End line (1-based, optional)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with the given content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace specific text in a file. old_text must match exactly (including whitespace).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_text: { type: 'string', description: 'Exact text to find' },
          new_text: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories in a tree view.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path' },
          max_depth: { type: 'number', description: 'Max depth (default: 2)' },
          pattern: { type: 'string', description: "File filter glob (e.g. '*.js')" },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a text pattern in files (like grep). Returns matching lines with file paths.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory to search' },
          pattern: { type: 'string', description: 'Search pattern (regex)' },
          file_pattern: { type: 'string', description: "File filter (e.g. '*.js')" },
        },
        required: ['path', 'pattern'],
      },
    },
  },
];

// ─── Tool Implementations ─────────────────────────────────────
async function executeTool(name, args) {
  switch (name) {
    case 'bash': {
      const cmd = args.command;
      const forbidden = isForbidden(cmd);
      if (forbidden) return `BLOCKED: Command matches forbidden pattern: ${forbidden}`;

      if (isDangerous(cmd)) {
        console.log(`\n${C.yellow}  ⚠ Dangerous command: ${cmd}${C.reset}`);
        const ok = await confirm('  Execute?');
        if (!ok) return 'CANCELLED: User declined to execute this command.';
      }

      try {
        const out = execSync(cmd, {
          cwd: CWD,
          timeout: 90000,
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024,
        });
        return out || '(no output)';
      } catch (e) {
        return `EXIT ${e.status || 1}\n${(e.stderr || e.stdout || e.message || '').toString().substring(0, 5000)}`;
      }
    }

    case 'read_file': {
      const fp = resolvePath(args.path);
      if (!fs.existsSync(fp)) return `ERROR: File not found: ${fp}`;
      const content = fs.readFileSync(fp, 'utf-8');
      const lines = content.split('\n');
      const start = (args.line_start || 1) - 1;
      const end = args.line_end || lines.length;
      return lines
        .slice(start, end)
        .map((l, i) => `${start + i + 1}: ${l}`)
        .join('\n');
    }

    case 'write_file': {
      const fp = resolvePath(args.path);
      const exists = fs.existsSync(fp);

      if (exists) {
        const oldContent = fs.readFileSync(fp, 'utf-8');
        showWriteDiff(fp, oldContent, args.content);
        const ok = await confirmFileChange('Overwrite');
        if (!ok) return 'CANCELLED: User declined to overwrite file.';
      } else {
        showNewFilePreview(fp, args.content);
        const ok = await confirmFileChange('Create');
        if (!ok) return 'CANCELLED: User declined to create file.';
      }

      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, args.content, 'utf-8');
      return `Written: ${fp} (${args.content.length} chars)`;
    }

    case 'edit_file': {
      const fp = resolvePath(args.path);
      if (!fs.existsSync(fp)) return `ERROR: File not found: ${fp}`;
      const content = fs.readFileSync(fp, 'utf-8');
      if (!content.includes(args.old_text)) return `ERROR: old_text not found in ${fp}`;

      showEditDiff(fp, args.old_text, args.new_text);
      const ok = await confirmFileChange('Apply');
      if (!ok) return 'CANCELLED: User declined to apply edit.';

      const updated = content.replace(args.old_text, args.new_text);
      fs.writeFileSync(fp, updated, 'utf-8');
      return `Edited: ${fp}`;
    }

    case 'list_directory': {
      const dp = resolvePath(args.path);
      if (!fs.existsSync(dp)) return `ERROR: Directory not found: ${dp}`;
      const depth = args.max_depth || 2;
      const pattern = args.pattern ? new RegExp(args.pattern.replace(/\*/g, '.*')) : null;
      const result = [];

      const walk = (dir, level, prefix) => {
        if (level > depth) return;
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        entries = entries.filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules');
        for (const entry of entries) {
          if (pattern && !entry.isDirectory() && !pattern.test(entry.name)) continue;
          const marker = entry.isDirectory() ? '/' : '';
          result.push(`${prefix}${entry.name}${marker}`);
          if (entry.isDirectory()) walk(path.join(dir, entry.name), level + 1, prefix + '  ');
        }
      };

      walk(dp, 1, '');
      return result.join('\n') || '(empty)';
    }

    case 'search_files': {
      const dp = resolvePath(args.path);
      const fileFilter = args.file_pattern ? `--include="${args.file_pattern}"` : '';
      try {
        const out = execSync(
          `grep -rn ${fileFilter} "${args.pattern}" "${dp}" 2>/dev/null | head -50`,
          { cwd: CWD, timeout: 30000, encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024 }
        );
        return out || '(no matches)';
      } catch {
        return '(no matches)';
      }
    }

    default:
      return `ERROR: Unknown tool: ${name}`;
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool, resolvePath };
