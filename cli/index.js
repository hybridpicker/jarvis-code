/**
 * cli/index.js — Main REPL + Command Handling
 */

const readline = require('readline');
const { C, banner } = require('./ui');
const { processInput, clearConversation, getConversationLength } = require('./agent');
const { getActiveModel, setActiveModel, getModelNames } = require('./ollama');
const { printContext } = require('./context');
const { setAutoConfirm, getAutoConfirm } = require('./safety');

const CWD = process.cwd();

function showHelp() {
  console.log(`
${C.bold}Commands:${C.reset}
  ${C.cyan}/help${C.reset}             Show this help
  ${C.cyan}/model <name>${C.reset}     Switch model (${getModelNames().join(', ')})
  ${C.cyan}/clear${C.reset}            Clear conversation context
  ${C.cyan}/context${C.reset}          Show project context
  ${C.cyan}/autoconfirm${C.reset}      Toggle auto-confirm for file changes
  ${C.cyan}/exit${C.reset}             Quit
`);
}

function handleSlashCommand(input) {
  const [cmd, ...rest] = input.split(/\s+/);

  switch (cmd) {
    case '/help':
      showHelp();
      return true;

    case '/model': {
      const name = rest.join(' ').trim();
      if (!name) {
        console.log(`${C.bold}Active model:${C.reset} ${getActiveModel().name}`);
        console.log(`${C.gray}Available: ${getModelNames().join(', ')}${C.reset}`);
        return true;
      }
      if (setActiveModel(name)) {
        console.log(`${C.green}Switched to ${getActiveModel().name}${C.reset}`);
      } else {
        console.log(`${C.red}Unknown model: ${name}${C.reset}`);
        console.log(`${C.gray}Available: ${getModelNames().join(', ')}${C.reset}`);
      }
      return true;
    }

    case '/clear':
      clearConversation();
      console.log(`${C.green}Conversation cleared${C.reset}`);
      return true;

    case '/context':
      printContext(CWD);
      return true;

    case '/autoconfirm': {
      const newVal = !getAutoConfirm();
      setAutoConfirm(newVal);
      console.log(`${C.green}Auto-confirm: ${newVal ? 'ON' : 'OFF'}${C.reset}`);
      if (newVal) {
        console.log(`${C.yellow}  ⚠ File changes will be applied without confirmation${C.reset}`);
      }
      return true;
    }

    case '/exit':
    case '/quit':
      console.log(`\n${C.gray}Bye!${C.reset}`);
      process.exit(0);

    default:
      console.log(`${C.red}Unknown command: ${cmd}. Type /help${C.reset}`);
      return true;
  }
}

function startREPL() {
  // Check API key
  if (!process.env.OLLAMA_API_KEY) {
    console.error(`${C.red}ERROR: OLLAMA_API_KEY not set.${C.reset}`);
    console.error(`${C.gray}Set it in .env or export OLLAMA_API_KEY=your-key${C.reset}`);
    process.exit(1);
  }

  banner();
  console.log(`${C.gray}Model: ${getActiveModel().name} | CWD: ${CWD}${C.reset}`);
  console.log(`${C.gray}Type /help for commands${C.reset}\n`);

  // Show brief project context
  printContext(CWD);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.magenta}jarvis>${C.reset} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Slash commands
    if (input.startsWith('/')) {
      handleSlashCommand(input);
      rl.prompt();
      return;
    }

    // Process through agent
    try {
      await processInput(input);
    } catch (err) {
      console.log(`${C.red}Error: ${err.message}${C.reset}`);
    }

    const msgCount = getConversationLength();
    if (msgCount > 0) {
      process.stdout.write(`${C.gray}[${msgCount} messages] ${C.reset}`);
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.gray}Bye!${C.reset}`);
    process.exit(0);
  });
}

module.exports = { startREPL };
