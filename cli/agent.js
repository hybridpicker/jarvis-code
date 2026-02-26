/**
 * cli/agent.js — Agentic Loop + Conversation State
 * Hybrid: chat + tool-use in a single conversation.
 */

const { C, Spinner, formatToolCall, formatResult } = require('./ui');
const { callOllamaStream, parseToolArgs } = require('./ollama');
const { TOOL_DEFINITIONS, executeTool } = require('./tools');
const { gatherProjectContext } = require('./context');

const MAX_ITERATIONS = 30;
const CWD = process.cwd();

// Persistent conversation state
let conversationMessages = [];

function buildSystemPrompt() {
  const projectContext = gatherProjectContext(CWD);

  return `You are Jarvis Code, an expert coding assistant. You help with programming tasks by reading, writing, and editing files, running commands, and answering questions.

WORKING DIRECTORY: ${CWD}
All relative paths resolve from this directory.

PROJECT CONTEXT:
${projectContext}

BEHAVIOR:
- You can use tools OR just respond with text — decide based on what's needed.
- For simple questions, answer directly without tools.
- For coding tasks, use tools to read files, make changes, run tests, etc.
- Be efficient: read only what you need, implement precisely.
- Prefer edit_file for targeted changes over write_file for full rewrites.
- Use relative paths when possible.

SAFETY:
- NEVER read .env files or credentials.
- NEVER run destructive commands (rm -rf /, etc.).
- Dangerous commands (git push, npm publish, sudo) require user confirmation.`;
}

function clearConversation() {
  conversationMessages = [];
}

function getConversationLength() {
  return conversationMessages.length;
}

/**
 * Process a single user input through the agentic loop.
 * Maintains conversation state across calls.
 */
async function processInput(userInput) {
  conversationMessages.push({ role: 'user', content: userInput });

  const systemPrompt = buildSystemPrompt();
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...conversationMessages];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let result;
    try {
      result = await callOllamaStream(fullMessages, TOOL_DEFINITIONS);
    } catch (err) {
      console.log(`${C.red}${err.message}${C.reset}`);

      if (err.message.includes('429')) {
        console.log(`${C.yellow}  Rate limit — waiting 10s...${C.reset}`);
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      break;
    }

    const { content, tool_calls } = result;

    // Build assistant message for history
    const assistantMsg = { role: 'assistant', content: content || '' };
    if (tool_calls && tool_calls.length > 0) {
      assistantMsg.tool_calls = tool_calls;
    }
    conversationMessages.push(assistantMsg);
    fullMessages.push(assistantMsg);

    // No tool calls → response complete
    if (!tool_calls || tool_calls.length === 0) {
      return;
    }

    // Execute tool calls
    for (const tc of tool_calls) {
      const fnName = tc.function.name;
      const args = parseToolArgs(tc.function.arguments);
      const callId = tc.id || `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (!args) {
        console.log(`${C.red}  ✗ ${fnName}: malformed arguments${C.reset}`);
        const toolMsg = { role: 'tool', content: 'ERROR: Malformed tool arguments', tool_call_id: callId };
        conversationMessages.push(toolMsg);
        fullMessages.push(toolMsg);
        continue;
      }

      console.log(formatToolCall(fnName, args));

      // Execute (async for confirmation prompts)
      const toolResult = await executeTool(fnName, args);
      const truncated =
        toolResult.length > 50000
          ? toolResult.substring(0, 50000) + `\n...(truncated ${toolResult.length - 50000} chars)`
          : toolResult;

      console.log(formatResult(truncated));

      const toolMsg = { role: 'tool', content: truncated, tool_call_id: callId };
      conversationMessages.push(toolMsg);
      fullMessages.push(toolMsg);
    }
  }

  console.log(`\n${C.yellow}⚠ Max iterations (${MAX_ITERATIONS}) reached.${C.reset}`);
}

module.exports = { processInput, clearConversation, getConversationLength };
