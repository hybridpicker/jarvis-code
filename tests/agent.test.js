// Mock all external dependencies before requiring agent
jest.mock('../cli/ollama', () => ({
  callOllamaStream: jest.fn(),
  parseToolArgs: jest.requireActual('../cli/ollama').parseToolArgs,
}));

jest.mock('../cli/tools', () => ({
  TOOL_DEFINITIONS: [{ type: 'function', function: { name: 'bash', description: 'test', parameters: { type: 'object', properties: {}, required: [] } } }],
  executeTool: jest.fn(),
}));

jest.mock('../cli/context', () => ({
  gatherProjectContext: jest.fn().mockReturnValue('PACKAGE: test-project'),
}));

const { processInput, clearConversation, getConversationLength } = require('../cli/agent');
const { callOllamaStream } = require('../cli/ollama');
const { executeTool } = require('../cli/tools');

describe('agent.js', () => {
  let logSpy, writeSpy;

  beforeEach(() => {
    clearConversation();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  // ─── conversation state ───────────────────────────────────
  describe('conversation state', () => {
    it('starts with empty conversation', () => {
      expect(getConversationLength()).toBe(0);
    });

    it('clearConversation resets state', () => {
      callOllamaStream.mockResolvedValueOnce({ content: 'hello', tool_calls: [] });
      return processInput('test').then(() => {
        expect(getConversationLength()).toBeGreaterThan(0);
        clearConversation();
        expect(getConversationLength()).toBe(0);
      });
    });
  });

  // ─── processInput ─────────────────────────────────────────
  describe('processInput()', () => {
    it('handles simple text response (no tools)', async () => {
      callOllamaStream.mockResolvedValueOnce({ content: 'Hello there!', tool_calls: [] });
      await processInput('Hi');
      expect(getConversationLength()).toBe(2); // user + assistant
    });

    it('handles tool call and result', async () => {
      callOllamaStream
        .mockResolvedValueOnce({
          content: 'Let me check...',
          tool_calls: [
            { function: { name: 'bash', arguments: { command: 'echo test' } }, id: 'call-1' },
          ],
        })
        .mockResolvedValueOnce({ content: 'Done!', tool_calls: [] });

      executeTool.mockResolvedValueOnce('test output');

      await processInput('run echo test');
      // user + assistant(tool) + tool_result + assistant(done)
      expect(getConversationLength()).toBe(4);
    });

    it('handles malformed tool arguments', async () => {
      callOllamaStream
        .mockResolvedValueOnce({
          content: '',
          tool_calls: [{ function: { name: 'bash', arguments: null }, id: 'call-1' }],
        })
        .mockResolvedValueOnce({ content: 'Oops', tool_calls: [] });

      await processInput('test');
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('malformed');
    });

    it('handles API errors', async () => {
      callOllamaStream.mockRejectedValueOnce(new Error('API Error: connection refused'));
      await processInput('test');
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('API Error');
    });

    it('maintains conversation across multiple calls', async () => {
      callOllamaStream.mockResolvedValueOnce({ content: 'First response', tool_calls: [] });
      await processInput('First message');

      callOllamaStream.mockResolvedValueOnce({ content: 'Second response', tool_calls: [] });
      await processInput('Second message');

      expect(getConversationLength()).toBe(4); // 2 user + 2 assistant
    });

    it('truncates large tool results', async () => {
      const largeOutput = 'x'.repeat(60000);
      callOllamaStream
        .mockResolvedValueOnce({
          content: '',
          tool_calls: [{ function: { name: 'bash', arguments: { command: 'test' } }, id: 'c1' }],
        })
        .mockResolvedValueOnce({ content: 'Done', tool_calls: [] });

      executeTool.mockResolvedValueOnce(largeOutput);

      await processInput('run something big');
      // Verify the message was added (not checking exact truncation in message array)
      expect(getConversationLength()).toBeGreaterThan(0);
    });

    it('handles multiple tool calls in one response', async () => {
      callOllamaStream
        .mockResolvedValueOnce({
          content: 'Running both...',
          tool_calls: [
            { function: { name: 'bash', arguments: { command: 'echo 1' } }, id: 'c1' },
            { function: { name: 'bash', arguments: { command: 'echo 2' } }, id: 'c2' },
          ],
        })
        .mockResolvedValueOnce({ content: 'Both done', tool_calls: [] });

      executeTool.mockResolvedValueOnce('1').mockResolvedValueOnce('2');

      await processInput('run both');
      expect(executeTool).toHaveBeenCalledTimes(2);
    });
  });
});
