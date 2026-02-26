/**
 * cli/ollama.js — Ollama API Client with Streaming
 */

const axios = require('axios');
const { C, Spinner } = require('./ui');

const OLLAMA_BASE = 'https://ollama.com';

const MODELS = {
  'kimi-k2.5': { id: 'kimi-k2.5', name: 'Kimi K2.5', max_tokens: 16384 },
  'qwen3-coder': { id: 'qwen3-coder', name: 'Qwen3 Coder', max_tokens: 16384 },
};

let activeModel = MODELS['kimi-k2.5'];

function getActiveModel() {
  return activeModel;
}

function setActiveModel(name) {
  if (MODELS[name]) {
    activeModel = MODELS[name];
    return true;
  }
  return false;
}

function getModelNames() {
  return Object.keys(MODELS);
}

function getHeaders() {
  const key = process.env.OLLAMA_API_KEY;
  if (!key) throw new Error('OLLAMA_API_KEY not set');
  return { Authorization: `Bearer ${key}` };
}

/**
 * Parse tool call arguments with fallback strategies
 */
function parseToolArgs(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    /* continue */
  }
  try {
    const fixed = raw.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
    return JSON.parse(fixed);
  } catch {
    /* continue */
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* give up */
    }
  }
  return null;
}

/**
 * Call Ollama API with streaming.
 * Streams text tokens to stdout in real-time.
 * Collects and returns tool_calls when done.
 *
 * Returns: { content: string, tool_calls: Array }
 */
async function callOllamaStream(messages, tools) {
  const spinner = new Spinner('Connecting...');
  spinner.start();

  let response;
  try {
    response = await axios.post(
      `${OLLAMA_BASE}/api/chat`,
      {
        model: activeModel.id,
        messages,
        tools,
        stream: true,
        options: { temperature: 0.2, num_predict: activeModel.max_tokens },
      },
      {
        timeout: 180000,
        headers: getHeaders(),
        responseType: 'stream',
      }
    );
  } catch (err) {
    spinner.stop();
    const msg = err.response?.data?.error || err.message;
    throw new Error(`API Error: ${msg}`);
  }

  spinner.stop();

  return new Promise((resolve, reject) => {
    let content = '';
    let toolCalls = [];
    let buffer = '';
    let firstToken = true;

    response.data.on('data', (chunk) => {
      buffer += chunk.toString();

      // Process complete NDJSON lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        // Stream text tokens
        if (parsed.message?.content) {
          if (firstToken) {
            process.stdout.write(`${C.blue}`);
            firstToken = false;
          }
          process.stdout.write(parsed.message.content);
          content += parsed.message.content;
        }

        // Collect tool calls
        if (parsed.message?.tool_calls) {
          toolCalls = toolCalls.concat(parsed.message.tool_calls);
        }

        // Done
        if (parsed.done) {
          if (!firstToken) {
            process.stdout.write(`${C.reset}\n`);
          }
          resolve({ content, tool_calls: toolCalls });
          return;
        }
      }
    });

    response.data.on('error', (err) => {
      if (!firstToken) process.stdout.write(`${C.reset}\n`);
      reject(new Error(`Stream error: ${err.message}`));
    });

    response.data.on('end', () => {
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.message?.content) content += parsed.message.content;
          if (parsed.message?.tool_calls) toolCalls = toolCalls.concat(parsed.message.tool_calls);
        } catch {
          /* ignore */
        }
      }
      if (!firstToken) process.stdout.write(`${C.reset}\n`);
      resolve({ content, tool_calls: toolCalls });
    });
  });
}

/**
 * Non-streaming fallback (used if streaming fails)
 */
async function callOllama(messages, tools) {
  const response = await axios.post(
    `${OLLAMA_BASE}/api/chat`,
    {
      model: activeModel.id,
      messages,
      tools,
      stream: false,
      options: { temperature: 0.2, num_predict: activeModel.max_tokens },
    },
    { timeout: 120000, headers: getHeaders() }
  );
  return response.data;
}

module.exports = {
  MODELS,
  getActiveModel,
  setActiveModel,
  getModelNames,
  callOllamaStream,
  callOllama,
  parseToolArgs,
};
