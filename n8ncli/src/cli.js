#!/usr/bin/env node

import { N8nClient } from './n8n-client.js';
import { extractTokenUsage, formatTokenUsage } from './token-extractor.js';
import { extractAllNodeData, formatAllNodeData, formatCompactSummary, filterNodesByName, filterFailedNodes, extractAiDetails, formatAiDetails } from './execution-details.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CONFIG_DIR = path.join(os.homedir(), '.n8ncli');
const ACCOUNTS_FILE = path.join(CONFIG_DIR, 'accounts.json');
const TEMP_DIR = path.join(os.tmpdir(), 'n8ncli');

/**
 * Write JSON to temp file and return the path (context-efficient)
 */
function writeJsonToTemp(data, prefix = 'output') {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}-${timestamp}.json`;
  const filepath = path.join(TEMP_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

const USAGE = `
n8ncli - N8N CLI for monitoring workflows across multiple instances

Usage:
  n8ncli accounts list                    List configured workspaces
  n8ncli accounts add <name>              Add a new workspace
  n8ncli accounts remove <name>           Remove a workspace
  n8ncli <workspace> <command> [options]  Run command on workspace

Commands:
  workflows                    List all workflows
  executions <workflow-id>     List executions for a workflow
  execution <id>               Get execution details (all nodes)
  errors [--limit <n>]         List recent failed executions

Options:
  --limit <n>        Number of results (default: 10)
  --status <status>  Filter by status: success, error, waiting
  --node <name>      Filter/show specific node by name
  --verbose          Show full node data (default: compact summary)
  --errors           Only show failed nodes
  --ai               Show AI-specific data (tokens, prompts, LLM outputs)
  --full             Show full output text (not truncated)
  --json             Write JSON to temp file, return path (context-efficient)
  --filter <k=v>     Filter executions by customData (e.g. --filter "airtable_id=xyz")

Examples:
  n8ncli accounts add myworkspace
  n8ncli myworkspace workflows
  n8ncli myworkspace executions abc123 --limit 5
  n8ncli myworkspace execution 123                    # Compact summary
  n8ncli myworkspace execution 123 --node "AI Agent"  # Specific node
  n8ncli myworkspace execution 123 --verbose          # Full data
  n8ncli myworkspace errors --limit 20
`;

// Config management
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadAccounts() {
  ensureConfigDir();
  if (fs.existsSync(ACCOUNTS_FILE)) {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
  }
  return {};
}

function saveAccounts(accounts) {
  ensureConfigDir();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

function getAccount(name) {
  const accounts = loadAccounts();
  return accounts[name];
}

// Interactive prompt
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Account commands
async function handleAccounts(args) {
  const action = args[0];
  const name = args[1];

  switch (action) {
    case 'list': {
      const accounts = loadAccounts();
      const names = Object.keys(accounts);
      if (names.length === 0) {
        console.log('No workspaces configured. Run: n8ncli accounts add <name>');
      } else {
        console.log('\nConfigured workspaces:\n');
        for (const n of names) {
          console.log(`  ${n}  ${accounts[n].url}`);
        }
      }
      break;
    }
    case 'add': {
      if (!name) {
        console.error('Usage: n8ncli accounts add <name>');
        process.exit(1);
      }
      const url = await prompt('N8N instance URL: ');
      const apiKey = await prompt('API key: ');

      const accounts = loadAccounts();
      accounts[name] = { url, apiKey };
      saveAccounts(accounts);
      console.log(`\nWorkspace "${name}" added.`);
      break;
    }
    case 'remove': {
      if (!name) {
        console.error('Usage: n8ncli accounts remove <name>');
        process.exit(1);
      }
      const accounts = loadAccounts();
      if (accounts[name]) {
        delete accounts[name];
        saveAccounts(accounts);
        console.log(`Workspace "${name}" removed.`);
      } else {
        console.error(`Workspace "${name}" not found.`);
      }
      break;
    }
    default:
      console.error('Unknown accounts command. Use: list, add, remove');
      process.exit(1);
  }
}

// Parse arguments
function parseArgs(args) {
  const parsed = {
    workspace: null,
    command: null,
    commandArgs: [],
    limit: 10,
    status: null,
    node: null,
    verbose: false,
    errorsOnly: false,
    ai: false,
    full: false,
    json: false,
    filter: null,
  };

  let i = 0;

  // First arg is workspace
  if (args[i] && !args[i].startsWith('--')) {
    parsed.workspace = args[i++];
  }

  // Second arg is command
  if (args[i] && !args[i].startsWith('--')) {
    parsed.command = args[i++];
  }

  // Rest are command args and options
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--limit' && args[i + 1]) {
      parsed.limit = parseInt(args[++i], 10);
    } else if (arg === '--status' && args[i + 1]) {
      parsed.status = args[++i];
    } else if (arg === '--node' && args[i + 1]) {
      parsed.node = args[++i];
    } else if (arg === '--verbose') {
      parsed.verbose = true;
    } else if (arg === '--errors') {
      parsed.errorsOnly = true;
    } else if (arg === '--ai') {
      parsed.ai = true;
    } else if (arg === '--full') {
      parsed.full = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--filter' && args[i + 1]) {
      parsed.filter = args[++i];
    } else if (!arg.startsWith('--')) {
      parsed.commandArgs.push(arg);
    }
    i++;
  }

  return parsed;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  // Handle accounts subcommand
  if (args[0] === 'accounts') {
    await handleAccounts(args.slice(1));
    return;
  }

  const parsed = parseArgs(args);

  if (!parsed.workspace) {
    console.error('Error: Please specify a workspace. Run: n8ncli accounts list');
    process.exit(1);
  }

  const account = getAccount(parsed.workspace);
  if (!account) {
    console.error(`Error: Workspace "${parsed.workspace}" not found.`);
    console.error('Run: n8ncli accounts list');
    process.exit(1);
  }

  const client = new N8nClient(account.url, account.apiKey);

  try {
    switch (parsed.command) {
      case 'workflows': {
        const response = await client.listWorkflows();
        const workflows = response.data || response;

        if (parsed.json) {
          const filepath = writeJsonToTemp(workflows, 'workflows');
          console.log(`JSON written to: ${filepath}`);
        } else {
          console.log('\nWorkflows:\n');
          console.log('ID\tNAME\tSTATUS');
          for (const wf of workflows) {
            console.log(`${wf.id}\t${wf.name}\t${wf.active ? 'active' : 'inactive'}`);
          }
        }
        break;
      }

      case 'executions': {
        const workflowId = parsed.commandArgs[0];
        if (!workflowId) {
          console.error('Usage: n8ncli <workspace> executions <workflow-id>');
          process.exit(1);
        }

        const response = await client.listExecutions(workflowId, {
          limit: parsed.limit,
          status: parsed.status,
          includeData: true,
        });

        let executions = response.data || response;

        // Filter by customData if --filter provided
        if (parsed.filter) {
          const [key, value] = parsed.filter.split('=');
          executions = executions.filter(exec => {
            const customData = exec.customData || {};
            return customData[key] === value;
          });
          if (executions.length === 0) {
            console.log(`No executions found with customData.${key}="${value}"`);
            return;
          }
        }

        if (parsed.json) {
          const filepath = writeJsonToTemp(executions, `executions-${workflowId}`);
          console.log(`JSON written to: ${filepath}`);
        } else {
          console.log(`\nExecutions for workflow ${workflowId}:\n`);

          // Check if any have customData
          const hasCustomData = executions.some(e => e.customData && Object.keys(e.customData).length > 0);

          if (hasCustomData) {
            console.log('ID\tSTATUS\tSTARTED\tCUSTOM_DATA');
            for (const exec of executions) {
              const date = new Date(exec.startedAt).toLocaleString();
              const customStr = exec.customData ? JSON.stringify(exec.customData) : '-';
              console.log(`${exec.id}\t${exec.status}\t${date}\t${customStr}`);
            }
          } else {
            console.log('ID\tSTATUS\tSTARTED\tTOKENS');
            for (const exec of executions) {
              const tokens = extractTokenUsage(exec);
              const date = new Date(exec.startedAt).toLocaleString();
              console.log(`${exec.id}\t${exec.status}\t${date}\t${tokens.totals.totalTokens}`);
            }
          }
        }
        break;
      }

      case 'execution': {
        const executionId = parsed.commandArgs[0];
        if (!executionId) {
          console.error('Usage: n8ncli <workspace> execution <id>');
          process.exit(1);
        }

        const execution = await client.getExecution(executionId);

        if (parsed.ai) {
          // AI-specific: tokens, prompts, LLM outputs
          const details = extractAiDetails(execution);
          if (parsed.json) {
            const filepath = writeJsonToTemp(details, `execution-${executionId}-ai`);
            console.log(`JSON written to: ${filepath}`);
          } else {
            console.log(formatAiDetails(details, { showFullOutput: parsed.full }));
          }
        } else {
          // General node data
          let details = extractAllNodeData(execution);

          // Apply filters
          if (parsed.node) {
            details = filterNodesByName(details, parsed.node);
            if (details.nodes.length === 0) {
              console.log(`No nodes matching "${parsed.node}" found.`);
              return;
            }
          }
          if (parsed.errorsOnly) {
            details = filterFailedNodes(details);
            if (details.nodes.length === 0) {
              console.log('No failed nodes in this execution.');
              return;
            }
          }

          if (parsed.json) {
            const filepath = writeJsonToTemp(details, `execution-${executionId}`);
            console.log(`JSON written to: ${filepath}`);
          } else if (parsed.verbose || parsed.node) {
            // Verbose or filtered by node: show full data
            console.log(formatAllNodeData(details, { showFullOutput: parsed.full }));
          } else {
            // Default: compact summary
            console.log(formatCompactSummary(details));
          }
        }
        break;
      }

      case 'errors': {
        const response = await client.listExecutions(null, {
          limit: parsed.limit,
          status: 'error',
          includeData: false,
        });

        const executions = response.data || response;

        if (parsed.json) {
          const filepath = writeJsonToTemp(executions, 'errors');
          console.log(`JSON written to: ${filepath}`);
        } else {
          console.log(`\nRecent failed executions:\n`);
          console.log('ID\tWORKFLOW\tSTARTED\tERROR');
          for (const exec of executions) {
            const date = new Date(exec.startedAt).toLocaleString();
            const error = exec.stoppedAt ? 'Failed' : 'Running';
            console.log(`${exec.id}\t${exec.workflowId}\t${date}\t${error}`);
          }
        }
        break;
      }

      default:
        console.error(`Unknown command: ${parsed.command}`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
