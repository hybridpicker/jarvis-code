const { EventEmitter } = require('events');

// Mock axios before requiring ollama
jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const {
  MODELS,
  getActiveModel,
  setActiveModel,
  getModelNames,
  callOllamaStream,
  callOllama,
  parseToolArgs,
} = require('../cli/ollama');

describe('ollama.js', () => {
  let writeSpy;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
    process.env.OLLAMA_API_KEY = 'test-key-123';
    setActiveModel('kimi-k2.5');
  });

  afterEach(() => {
    writeSpy.mockRestore();
    jest.clearAllMocks();
  });

  // ─── Models ─────────────────────────────────────────────────
  describe('MODELS', () => {
    it('has kimi-k2.5 model', () => {
      expect(MODELS['kimi-k2.5']).toBeDefined();
      expect(MODELS['kimi-k2.5'].name).toBe('Kimi K2.5');
      expect(MODELS['kimi-k2.5'].max_tokens).toBe(16384);
    });

    it('has qwen3-coder model', () => {
      expect(MODELS['qwen3-coder']).toBeDefined();
      expect(MODELS['qwen3-coder'].name).toBe('Qwen3 Coder');
    });
  });

  // ─── getActiveModel / setActiveModel ─────────────────────
  describe('model management', () => {
    it('defaults to kimi-k2.5', () => {
      expect(getActiveModel().id).toBe('kimi-k2.5');
    });

    it('switches to valid model', () => {
      const result = setActiveModel('qwen3-coder');
      expect(result).toBe(true);
      expect(getActiveModel().id).toBe('qwen3-coder');
    });

    it('rejects invalid model', () => {
      const result = setActiveModel('nonexistent');
      expect(result).toBe(false);
      expect(getActiveModel().id).toBe('kimi-k2.5');
    });

    it('getModelNames returns all model keys', () => {
      const names = getModelNames();
      expect(names).toContain('kimi-k2.5');
      expect(names).toContain('qwen3-coder');
      expect(names).toHaveLength(2);
    });
  });

  // ─── parseToolArgs ──────────────────────────────────────────
  describe('parseToolArgs()', () => {
    it('returns null for null input', () => {
      expect(parseToolArgs(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(parseToolArgs(undefined)).toBeNull();
    });

    it('returns object as-is', () => {
      const obj = { command: 'ls' };
      expect(parseToolArgs(obj)).toBe(obj);
    });

    it('parses valid JSON string', () => {
      const result = parseToolArgs('{"command": "ls -la"}');
      expect(result).toEqual({ command: 'ls -la' });
    });

    it('fixes trailing commas', () => {
      const result = parseToolArgs('{"command": "ls",}');
      expect(result).toEqual({ command: 'ls' });
    });

    it('fixes single quotes', () => {
      const result = parseToolArgs("{'command': 'ls'}");
      expect(result).toEqual({ command: 'ls' });
    });

    it('extracts JSON from surrounding text', () => {
      const result = parseToolArgs('here is the args: {"path": "test.js"} end');
      expect(result).toEqual({ path: 'test.js' });
    });

    it('returns null for completely unparseable input', () => {
      expect(parseToolArgs('not json at all')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseToolArgs('')).toBeNull();
    });

    it('handles nested objects', () => {
      const result = parseToolArgs('{"a": {"b": 1}}');
      expect(result).toEqual({ a: { b: 1 } });
    });

    it('handles arrays in JSON', () => {
      const result = parseToolArgs('{"files": ["a.js", "b.js"]}');
      expect(result).toEqual({ files: ['a.js', 'b.js'] });
    });
  });

  // ─── callOllamaStream ──────────────────────────────────────
  describe('callOllamaStream()', () => {
    function createMockStream(chunks) {
      const emitter = new EventEmitter();
      process.nextTick(() => {
        for (const chunk of chunks) {
          emitter.emit('data', Buffer.from(chunk));
        }
        emitter.emit('end');
      });
      return emitter;
    }

    it('streams text tokens to stdout', async () => {
      const stream = createMockStream([
        '{"message":{"content":"Hello"},"done":false}\n',
        '{"message":{"content":" World"},"done":false}\n',
        '{"message":{"content":""},"done":true}\n',
      ]);

      axios.post.mockResolvedValueOnce({ data: stream });

      const result = await callOllamaStream([{ role: 'user', content: 'Hi' }], []);
      expect(result.content).toBe('Hello World');
      expect(result.tool_calls).toEqual([]);
    });

    it('collects tool calls', async () => {
      const toolCall = { function: { name: 'bash', arguments: { command: 'ls' } } };
      const stream = createMockStream([
        '{"message":{"content":"Let me check..."},"done":false}\n',
        `{"message":{"tool_calls":[${JSON.stringify(toolCall)}]},"done":false}\n`,
        '{"message":{},"done":true}\n',
      ]);

      axios.post.mockResolvedValueOnce({ data: stream });

      const result = await callOllamaStream([{ role: 'user', content: 'list files' }], []);
      expect(result.content).toBe('Let me check...');
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].function.name).toBe('bash');
    });

    it('handles empty response', async () => {
      const stream = createMockStream(['{"message":{},"done":true}\n']);

      axios.post.mockResolvedValueOnce({ data: stream });

      const result = await callOllamaStream([], []);
      expect(result.content).toBe('');
      expect(result.tool_calls).toEqual([]);
    });

    it('handles stream errors', async () => {
      const emitter = new EventEmitter();
      process.nextTick(() => {
        emitter.emit('error', new Error('Connection reset'));
      });

      axios.post.mockResolvedValueOnce({ data: emitter });

      await expect(callOllamaStream([], [])).rejects.toThrow('Stream error');
    });

    it('throws on API connection error', async () => {
      axios.post.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(callOllamaStream([], [])).rejects.toThrow('API Error');
    });

    it('includes error details from API response', async () => {
      const err = new Error('fail');
      err.response = { data: { error: 'Model not found' } };
      axios.post.mockRejectedValueOnce(err);

      await expect(callOllamaStream([], [])).rejects.toThrow('Model not found');
    });

    it('sends correct request payload', async () => {
      const stream = createMockStream(['{"message":{},"done":true}\n']);
      axios.post.mockResolvedValueOnce({ data: stream });

      const messages = [{ role: 'user', content: 'test' }];
      const tools = [{ type: 'function', function: { name: 'test' } }];
      await callOllamaStream(messages, tools);

      expect(axios.post).toHaveBeenCalledWith(
        'https://ollama.com/api/chat',
        expect.objectContaining({
          model: 'kimi-k2.5',
          messages,
          tools,
          stream: true,
        }),
        expect.objectContaining({
          responseType: 'stream',
          headers: { Authorization: 'Bearer test-key-123' },
        })
      );
    });

    it('handles multiple NDJSON lines in single chunk', async () => {
      const stream = createMockStream([
        '{"message":{"content":"A"},"done":false}\n{"message":{"content":"B"},"done":false}\n{"message":{},"done":true}\n',
      ]);

      axios.post.mockResolvedValueOnce({ data: stream });
      const result = await callOllamaStream([], []);
      expect(result.content).toBe('AB');
    });

    it('handles incomplete NDJSON lines across chunks', async () => {
      const stream = createMockStream([
        '{"message":{"content":"X"},"do',
        'ne":false}\n{"message":{},"done":true}\n',
      ]);

      axios.post.mockResolvedValueOnce({ data: stream });
      const result = await callOllamaStream([], []);
      expect(result.content).toBe('X');
    });

    it('processes remaining buffer on stream end', async () => {
      const emitter = new EventEmitter();
      process.nextTick(() => {
        // Send data without trailing newline (stays in buffer)
        emitter.emit('data', Buffer.from('{"message":{"content":"buffered"},"done":true}'));
        emitter.emit('end');
      });

      axios.post.mockResolvedValueOnce({ data: emitter });
      const result = await callOllamaStream([], []);
      expect(result.content).toBe('buffered');
    });

    it('handles malformed JSON in stream gracefully', async () => {
      const stream = createMockStream([
        'not-json\n',
        '{"message":{"content":"ok"},"done":false}\n',
        '{"message":{},"done":true}\n',
      ]);

      axios.post.mockResolvedValueOnce({ data: stream });
      const result = await callOllamaStream([], []);
      expect(result.content).toBe('ok');
    });
  });

  // ─── callOllama (non-streaming) ─────────────────────────────
  describe('callOllama()', () => {
    it('sends non-streaming request', async () => {
      const mockResponse = {
        data: { message: { content: 'Hello', tool_calls: [] } },
      };
      axios.post.mockResolvedValueOnce(mockResponse);

      const result = await callOllama([{ role: 'user', content: 'Hi' }], []);
      expect(result.message.content).toBe('Hello');
      expect(axios.post).toHaveBeenCalledWith(
        'https://ollama.com/api/chat',
        expect.objectContaining({ stream: false }),
        expect.objectContaining({ timeout: 120000 })
      );
    });

    it('uses correct model in request', async () => {
      setActiveModel('qwen3-coder');
      axios.post.mockResolvedValueOnce({ data: { message: { content: '' } } });

      await callOllama([], []);
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'qwen3-coder' }),
        expect.any(Object)
      );
    });
  });

  // ─── getHeaders (indirectly tested) ─────────────────────────
  describe('API key handling', () => {
    it('throws when OLLAMA_API_KEY is missing', async () => {
      delete process.env.OLLAMA_API_KEY;
      // callOllamaStream calls getHeaders() which throws
      await expect(callOllamaStream([], [])).rejects.toThrow();
    });
  });
});
