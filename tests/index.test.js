// Test the REPL command handling logic
jest.mock('../cli/agent', () => ({
  processInput: jest.fn().mockResolvedValue(undefined),
  clearConversation: jest.fn(),
  getConversationLength: jest.fn().mockReturnValue(0),
}));

jest.mock('../cli/ollama', () => ({
  getActiveModel: jest.fn().mockReturnValue({ id: 'kimi-k2.5', name: 'Kimi K2.5' }),
  setActiveModel: jest.fn(),
  getModelNames: jest.fn().mockReturnValue(['kimi-k2.5', 'qwen3-coder']),
}));

jest.mock('../cli/context', () => ({
  printContext: jest.fn(),
  gatherProjectContext: jest.fn().mockReturnValue(''),
}));

jest.mock('../cli/safety', () => ({
  setAutoConfirm: jest.fn(),
  getAutoConfirm: jest.fn().mockReturnValue(false),
}));

// We test handleSlashCommand by extracting it
// Since it's not exported, we test through startREPL's behavior
// Instead, let's test the exported startREPL with mocked readline

describe('index.js (REPL commands)', () => {
  let logSpy, writeSpy, exitSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logSpy.errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    logSpy.errorSpy.mockRestore();
    writeSpy.mockRestore();
    exitSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('startREPL()', () => {
    it('exits with error when OLLAMA_API_KEY is missing', () => {
      const origKey = process.env.OLLAMA_API_KEY;
      delete process.env.OLLAMA_API_KEY;

      const { startREPL } = require('../cli/index');
      startREPL();
      expect(exitSpy).toHaveBeenCalledWith(1);

      process.env.OLLAMA_API_KEY = origKey;
    });

    it('starts REPL when API key is set', () => {
      const origKey = process.env.OLLAMA_API_KEY;
      process.env.OLLAMA_API_KEY = 'test-key';

      // Mock readline to prevent hanging
      const mockRl = {
        prompt: jest.fn(),
        on: jest.fn().mockReturnThis(),
        close: jest.fn(),
      };
      jest.spyOn(require('readline'), 'createInterface').mockReturnValueOnce(mockRl);

      const { startREPL } = require('../cli/index');
      startREPL();

      // Should show banner
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Kimi K2.5');
      expect(exitSpy).not.toHaveBeenCalledWith(1);

      process.env.OLLAMA_API_KEY = origKey;
    });
  });

  describe('slash commands via readline', () => {
    let lineHandler, closeHandler, mockRl;

    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      mockRl = {
        prompt: jest.fn(),
        on: jest.fn(function (event, handler) {
          if (event === 'line') lineHandler = handler;
          if (event === 'close') closeHandler = handler;
          return this;
        }),
        close: jest.fn(),
      };
      jest.spyOn(require('readline'), 'createInterface').mockReturnValueOnce(mockRl);

      // Clear module cache to get fresh instance
      jest.resetModules();
      // Re-setup mocks after reset
      jest.mock('../cli/agent', () => ({
        processInput: jest.fn().mockResolvedValue(undefined),
        clearConversation: jest.fn(),
        getConversationLength: jest.fn().mockReturnValue(0),
      }));
      jest.mock('../cli/ollama', () => ({
        getActiveModel: jest.fn().mockReturnValue({ id: 'kimi-k2.5', name: 'Kimi K2.5' }),
        setActiveModel: jest.fn().mockImplementation((name) => name === 'qwen3-coder'),
        getModelNames: jest.fn().mockReturnValue(['kimi-k2.5', 'qwen3-coder']),
      }));
      jest.mock('../cli/context', () => ({
        printContext: jest.fn(),
        gatherProjectContext: jest.fn().mockReturnValue(''),
      }));
      jest.mock('../cli/safety', () => ({
        setAutoConfirm: jest.fn(),
        getAutoConfirm: jest.fn().mockReturnValue(false),
      }));

      const { startREPL } = require('../cli/index');
      startREPL();
    });

    afterEach(() => {
      delete process.env.OLLAMA_API_KEY;
    });

    it('handles /help command', async () => {
      await lineHandler('/help');
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('/help');
      expect(output).toContain('/model');
      expect(output).toContain('/clear');
    });

    it('handles /model without args (shows current)', async () => {
      await lineHandler('/model');
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Kimi K2.5');
    });

    it('handles /model with valid name', async () => {
      const { setActiveModel } = require('../cli/ollama');
      setActiveModel.mockReturnValueOnce(true);
      await lineHandler('/model qwen3-coder');
      expect(setActiveModel).toHaveBeenCalledWith('qwen3-coder');
    });

    it('handles /model with invalid name', async () => {
      const { setActiveModel } = require('../cli/ollama');
      setActiveModel.mockReturnValueOnce(false);
      await lineHandler('/model invalid');
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Unknown model');
    });

    it('handles /clear command', async () => {
      const { clearConversation } = require('../cli/agent');
      await lineHandler('/clear');
      expect(clearConversation).toHaveBeenCalled();
    });

    it('handles /context command', async () => {
      const { printContext } = require('../cli/context');
      await lineHandler('/context');
      expect(printContext).toHaveBeenCalled();
    });

    it('handles /autoconfirm toggle', async () => {
      const { setAutoConfirm } = require('../cli/safety');
      await lineHandler('/autoconfirm');
      expect(setAutoConfirm).toHaveBeenCalled();
    });

    it('handles /exit command', async () => {
      await lineHandler('/exit');
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('handles /quit command', async () => {
      await lineHandler('/quit');
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('handles unknown slash command', async () => {
      await lineHandler('/unknown');
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Unknown command');
    });

    it('skips empty input', async () => {
      const { processInput } = require('../cli/agent');
      await lineHandler('');
      expect(processInput).not.toHaveBeenCalled();
    });

    it('sends non-command input to agent', async () => {
      const { processInput } = require('../cli/agent');
      await lineHandler('write a function');
      expect(processInput).toHaveBeenCalledWith('write a function');
    });

    it('handles readline close', () => {
      closeHandler();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });
});
