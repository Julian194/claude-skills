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
  workflow <id>                Get workflow definition (show all nodes)
  workflow <id> --pinned       Show pinned/test data for a workflow
  workflow create <file.json>  Create workflow from JSON file
  workflow update <id> <file>  Update workflow from JSON file
  workflow delete <id>         Delete a workflow
  workflow activate <id>       Activate a workflow
  workflow deactivate <id>     Deactivate a workflow
  workflow set-code <id> <node> <file.js>  Update code node from JS file
  workflow set-setting <id> <key> <value> Update a workflow setting
  workflow add-tag <id> <tag>  Add a tag to a workflow
  workflow remove-tag <id> <tag> Remove a tag from a workflow
  workflow diff <id1> <id2>    Compare two workflows
  search <query>               Search workflows for text or node types
  clone <workspace:id> <target-workspace>  Clone workflow to another workspace
  projects                     List all projects
  executions <workflow-id>     List executions for a workflow
  execution <id>               Get execution details (all nodes)
  errors [--limit <n>]         List recent failed executions

Options:
  --limit <n>        Number of results (default: 10)
  --status <status>  Filter by status: success, error, waiting
  --project <id>     Project ID for workflow create
  --node <name>      Filter/show specific node by name
  --verbose          Show full node data (default: compact summary)
  --errors           Only show failed nodes
  --ai               Show AI-specific data (tokens, prompts, LLM outputs)
  --full             Show full output text (not truncated)
  --json             Write JSON to temp file, return path (context-efficient)
  --pinned           Show pinned/test data for a workflow
  --filter <k=v>     Filter executions by customData (e.g. --filter "airtable_id=xyz")

Examples:
  n8ncli accounts add myworkspace
  n8ncli myworkspace workflows
  n8ncli myworkspace workflow abc123 --pinned         # Show test data
  n8ncli myworkspace workflow set-code abc123 "Code" ./format.js
  n8ncli myworkspace workflow diff abc123 def456      # Compare workflows
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
    project: null,
    pinned: false,
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
    } else if (arg === '--project' && args[i + 1]) {
      parsed.project = args[++i];
    } else if (arg === '--pinned') {
      parsed.pinned = true;
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

      case 'projects': {
        const response = await client.listProjects();
        const projects = response.data || response;

        if (parsed.json) {
          const filepath = writeJsonToTemp(projects, 'projects');
          console.log(`JSON written to: ${filepath}`);
        } else {
          console.log('\nProjects:\n');
          console.log('ID\tNAME\tTYPE');
          for (const proj of projects) {
            console.log(`${proj.id}\t${proj.name}\t${proj.type || '-'}`);
          }
        }
        break;
      }

      case 'workflow': {
        const subCommand = parsed.commandArgs[0];

        if (subCommand === 'create') {
          const filePath = parsed.commandArgs[1];
          if (!filePath) {
            console.error('Usage: n8ncli <workspace> workflow create <file.json> [--project <id>]');
            process.exit(1);
          }
          const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (parsed.project) {
            workflowData.projectId = parsed.project;
          }
          const created = await client.createWorkflow(workflowData);
          console.log(`Workflow created: ${created.name} (ID: ${created.id})`);
          break;
        }

        if (subCommand === 'update') {
          const workflowId = parsed.commandArgs[1];
          const filePath = parsed.commandArgs[2];
          if (!workflowId || !filePath) {
            console.error('Usage: n8ncli <workspace> workflow update <id> <file.json>');
            process.exit(1);
          }
          const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

          // Preserve credentials from existing workflow
          const existing = await client.getWorkflow(workflowId);
          const existingCreds = new Map();
          for (const node of (existing.nodes || [])) {
            if (node.credentials) {
              existingCreds.set(node.name, node.credentials);
            }
          }

          // Merge credentials into new nodes by name
          if (workflowData.nodes) {
            for (const node of workflowData.nodes) {
              if (!node.credentials && existingCreds.has(node.name)) {
                node.credentials = existingCreds.get(node.name);
              }
            }
          }

          const updated = await client.updateWorkflow(workflowId, workflowData);
          console.log(`Workflow updated: ${updated.name} (ID: ${updated.id})`);
          break;
        }

        if (subCommand === 'delete') {
          const workflowId = parsed.commandArgs[1];
          if (!workflowId) {
            console.error('Usage: n8ncli <workspace> workflow delete <id>');
            process.exit(1);
          }
          await client.deleteWorkflow(workflowId);
          console.log(`Workflow ${workflowId} deleted.`);
          break;
        }

        if (subCommand === 'activate') {
          const workflowId = parsed.commandArgs[1];
          if (!workflowId) {
            console.error('Usage: n8ncli <workspace> workflow activate <id>');
            process.exit(1);
          }
          const result = await client.activateWorkflow(workflowId);
          console.log(`Workflow ${result.name} activated.`);
          break;
        }

        if (subCommand === 'deactivate') {
          const workflowId = parsed.commandArgs[1];
          if (!workflowId) {
            console.error('Usage: n8ncli <workspace> workflow deactivate <id>');
            process.exit(1);
          }
          const result = await client.deactivateWorkflow(workflowId);
          console.log(`Workflow ${result.name} deactivated.`);
          break;
        }

        if (subCommand === 'set-code') {
          const workflowId = parsed.commandArgs[1];
          const nodeName = parsed.commandArgs[2];
          const jsFilePath = parsed.commandArgs[3];
          if (!workflowId || !nodeName || !jsFilePath) {
            console.error('Usage: n8ncli <workspace> workflow set-code <id> <node-name> <file.js>');
            process.exit(1);
          }

          // Read JS file
          if (!fs.existsSync(jsFilePath)) {
            console.error(`File not found: ${jsFilePath}`);
            process.exit(1);
          }
          const jsCode = fs.readFileSync(jsFilePath, 'utf-8');

          // Get workflow
          const workflow = await client.getWorkflow(workflowId);

          // Find node by name
          const nodeIndex = workflow.nodes.findIndex(n => n.name === nodeName);
          if (nodeIndex === -1) {
            console.error(`Node "${nodeName}" not found in workflow. Available nodes:`);
            workflow.nodes.forEach(n => console.error(`  - ${n.name}`));
            process.exit(1);
          }

          const node = workflow.nodes[nodeIndex];
          if (!node.type.includes('code')) {
            console.error(`Node "${nodeName}" is not a code node (type: ${node.type})`);
            process.exit(1);
          }

          // Update the code
          workflow.nodes[nodeIndex].parameters.jsCode = jsCode;

          // Strip fields that n8n API doesn't accept on update
          // Only include fields that are allowed in the update endpoint
          const updatePayload = {
            name: workflow.name,
            nodes: workflow.nodes.map(node => ({
              id: node.id,
              name: node.name,
              type: node.type,
              typeVersion: node.typeVersion,
              position: node.position,
              parameters: node.parameters,
              credentials: node.credentials,
              webhookId: node.webhookId,
            })),
            connections: workflow.connections,
            settings: workflow.settings,
          };

          // Save workflow
          const updated = await client.updateWorkflow(workflowId, updatePayload);
          console.log(`Updated code in "${nodeName}" node of workflow "${updated.name}"`);
          break;
        }

        if (subCommand === 'diff') {
          const id1 = parsed.commandArgs[1];
          const id2 = parsed.commandArgs[2];
          if (!id1 || !id2) {
            console.error('Usage: n8ncli <workspace> workflow diff <id1> <id2>');
            process.exit(1);
          }

          const [wf1, wf2] = await Promise.all([
            client.getWorkflow(id1),
            client.getWorkflow(id2)
          ]);

          console.log(`\nComparing workflows:\n`);
          console.log(`  [1] ${wf1.name} (${id1})`);
          console.log(`  [2] ${wf2.name} (${id2})\n`);

          // Compare nodes
          const nodes1 = new Map(wf1.nodes.map(n => [n.name, n]));
          const nodes2 = new Map(wf2.nodes.map(n => [n.name, n]));

          const allNodeNames = new Set([...nodes1.keys(), ...nodes2.keys()]);

          const added = [];
          const removed = [];
          const modified = [];
          const unchanged = [];

          for (const name of allNodeNames) {
            const n1 = nodes1.get(name);
            const n2 = nodes2.get(name);

            if (!n1) {
              added.push(name);
            } else if (!n2) {
              removed.push(name);
            } else {
              // Compare parameters
              const p1 = JSON.stringify(n1.parameters);
              const p2 = JSON.stringify(n2.parameters);
              if (p1 !== p2) {
                modified.push(name);
              } else {
                unchanged.push(name);
              }
            }
          }

          if (added.length > 0) {
            console.log(`Added in [2] (${added.length}):`);
            added.forEach(n => console.log(`  + ${n}`));
            console.log();
          }

          if (removed.length > 0) {
            console.log(`Removed in [2] (${removed.length}):`);
            removed.forEach(n => console.log(`  - ${n}`));
            console.log();
          }

          if (modified.length > 0) {
            console.log(`Modified (${modified.length}):`);
            modified.forEach(n => console.log(`  ~ ${n}`));
            console.log();
          }

          console.log(`Unchanged: ${unchanged.length} nodes`);

          // If --json, write full diff to file
          if (parsed.json) {
            const diffData = {
              workflow1: { id: id1, name: wf1.name },
              workflow2: { id: id2, name: wf2.name },
              added: added.map(name => nodes2.get(name)),
              removed: removed.map(name => nodes1.get(name)),
              modified: modified.map(name => ({
                name,
                before: nodes1.get(name),
                after: nodes2.get(name)
              })),
              unchanged: unchanged
            };
            const filepath = writeJsonToTemp(diffData, `diff-${id1}-${id2}`);
            console.log(`\nFull diff written to: ${filepath}`);
          }
          break;
        }

        if (subCommand === 'set-setting') {
          const workflowId = parsed.commandArgs[1];
          const settingKey = parsed.commandArgs[2];
          const settingValue = parsed.commandArgs[3];
          if (!workflowId || !settingKey || settingValue === undefined) {
            console.error('Usage: n8ncli <workspace> workflow set-setting <id> <key> <value>');
            console.error('Example: n8ncli big workflow set-setting abc123 errorWorkflow xyz789');
            process.exit(1);
          }

          const workflow = await client.getWorkflow(workflowId);

          // Update the setting
          workflow.settings = workflow.settings || {};
          // Handle "null" or "none" to remove a setting
          if (settingValue === 'null' || settingValue === 'none') {
            delete workflow.settings[settingKey];
          } else {
            workflow.settings[settingKey] = settingValue;
          }

          const updatePayload = {
            name: workflow.name,
            nodes: workflow.nodes.map(node => ({
              id: node.id,
              name: node.name,
              type: node.type,
              typeVersion: node.typeVersion,
              position: node.position,
              parameters: node.parameters,
              credentials: node.credentials,
              webhookId: node.webhookId,
            })),
            connections: workflow.connections,
            settings: workflow.settings,
          };

          const updated = await client.updateWorkflow(workflowId, updatePayload);
          console.log(`Set ${settingKey}=${settingValue} on workflow "${updated.name}"`);
          break;
        }

        if (subCommand === 'add-tag') {
          const workflowId = parsed.commandArgs[1];
          const tagName = parsed.commandArgs[2];
          if (!workflowId || !tagName) {
            console.error('Usage: n8ncli <workspace> workflow add-tag <id> <tag-name>');
            process.exit(1);
          }

          // Get or create the tag
          let allTags = await client.listTags();
          let tag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());

          if (!tag) {
            tag = await client.createTag(tagName);
            console.log(`Created tag "${tagName}"`);
          }

          // Get existing workflow tags and add the new one
          const workflow = await client.getWorkflow(workflowId);
          const existingTagIds = (workflow.tags || []).map(t => t.id);

          if (existingTagIds.includes(tag.id)) {
            console.log(`Workflow "${workflow.name}" already has tag "${tagName}"`);
            break;
          }

          await client.setWorkflowTags(workflowId, [...existingTagIds, tag.id]);
          console.log(`Added tag "${tagName}" to workflow "${workflow.name}"`);
          break;
        }

        if (subCommand === 'remove-tag') {
          const workflowId = parsed.commandArgs[1];
          const tagName = parsed.commandArgs[2];
          if (!workflowId || !tagName) {
            console.error('Usage: n8ncli <workspace> workflow remove-tag <id> <tag-name>');
            process.exit(1);
          }

          // Find the tag
          const allTags = await client.listTags();
          const tag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());

          if (!tag) {
            console.error(`Tag "${tagName}" not found`);
            process.exit(1);
          }

          // Get existing workflow tags and remove this one
          const workflow = await client.getWorkflow(workflowId);
          const existingTagIds = (workflow.tags || []).map(t => t.id);

          if (!existingTagIds.includes(tag.id)) {
            console.log(`Workflow "${workflow.name}" doesn't have tag "${tagName}"`);
            break;
          }

          const newTagIds = existingTagIds.filter(id => id !== tag.id);
          await client.setWorkflowTags(workflowId, newTagIds);
          console.log(`Removed tag "${tagName}" from workflow "${workflow.name}"`);
          break;
        }

        // Default: get workflow by ID
        const workflowId = subCommand;
        if (!workflowId) {
          console.error('Usage: n8ncli <workspace> workflow <id>');
          process.exit(1);
        }

        const workflow = await client.getWorkflow(workflowId);

        // Handle --pinned flag
        if (parsed.pinned) {
          const pinData = workflow.pinData;
          if (!pinData || Object.keys(pinData).length === 0) {
            console.log(`No pinned data found in workflow "${workflow.name}"`);
            break;
          }

          if (parsed.json) {
            const filepath = writeJsonToTemp(pinData, `pinned-${workflowId}`);
            console.log(`JSON written to: ${filepath}`);
          } else {
            console.log(`\nPinned data for: ${workflow.name}\n`);
            for (const [nodeName, data] of Object.entries(pinData)) {
              console.log(`━━━ ${nodeName} ━━━`);
              if (Array.isArray(data)) {
                console.log(`Items: ${data.length}`);
                for (let i = 0; i < data.length; i++) {
                  console.log(`\n[Item ${i}]`);
                  const item = data[i].json || data[i];
                  console.log(JSON.stringify(item, null, 2));
                }
              } else {
                console.log(JSON.stringify(data, null, 2));
              }
              console.log();
            }
          }
          break;
        }

        if (parsed.json) {
          const filepath = writeJsonToTemp(workflow, `workflow-${workflowId}`);
          console.log(`JSON written to: ${filepath}`);
        } else {
          console.log(`\nWorkflow: ${workflow.name}`);
          console.log(`ID: ${workflow.id}`);
          console.log(`Status: ${workflow.active ? 'active' : 'inactive'}`);

          // Show if pinned data exists
          const pinnedNodes = workflow.pinData ? Object.keys(workflow.pinData) : [];
          if (pinnedNodes.length > 0) {
            console.log(`Pinned data: ${pinnedNodes.join(', ')} (use --pinned to view)`);
          }

          console.log(`\nNodes (${workflow.nodes?.length || 0}):\n`);

          if (workflow.nodes && workflow.nodes.length > 0) {
            for (const node of workflow.nodes) {
              const type = node.type?.replace('n8n-nodes-base.', '') || 'unknown';
              console.log(`  • ${node.name} (${type})`);
            }
          }
        }
        break;
      }

      case 'search': {
        const query = parsed.commandArgs[0];
        if (!query) {
          console.error('Usage: n8ncli <workspace> search <query>');
          console.error('Examples:');
          console.error('  n8ncli big search ntfy');
          console.error('  n8ncli big search "HTTP Request"');
          process.exit(1);
        }

        const response = await client.listWorkflows();
        const workflows = response.data || response;

        console.log(`\nSearching for "${query}"...\n`);

        const matches = [];
        for (const wfSummary of workflows) {
          const wf = await client.getWorkflow(wfSummary.id);
          const wfString = JSON.stringify(wf).toLowerCase();

          if (wfString.includes(query.toLowerCase())) {
            // Find which nodes match
            const matchingNodes = (wf.nodes || [])
              .filter(n => JSON.stringify(n).toLowerCase().includes(query.toLowerCase()))
              .map(n => n.name);

            matches.push({
              id: wf.id,
              name: wf.name,
              active: wf.active,
              nodes: matchingNodes
            });
          }
        }

        if (matches.length === 0) {
          console.log('No matches found.');
        } else {
          console.log(`Found ${matches.length} workflow(s):\n`);
          for (const m of matches) {
            const status = m.active ? 'active' : 'inactive';
            console.log(`• ${m.name} (${m.id}) [${status}]`);
            if (m.nodes.length > 0) {
              console.log(`  Matching nodes: ${m.nodes.join(', ')}`);
            }
          }
        }
        break;
      }

      case 'clone': {
        const source = parsed.commandArgs[0];
        const targetWorkspace = parsed.commandArgs[1];

        if (!source || !targetWorkspace) {
          console.error('Usage: n8ncli <workspace> clone <source-id> <target-workspace>');
          console.error('Example: n8ncli big clone uib8tUrlBuTMlcdw universalintelligence');
          process.exit(1);
        }

        // Get source workflow
        const sourceWf = await client.getWorkflow(source);
        console.log(`Cloning "${sourceWf.name}" to ${targetWorkspace}...`);

        // Get target workspace client
        const targetAccount = getAccount(targetWorkspace);
        if (!targetAccount) {
          console.error(`Target workspace "${targetWorkspace}" not found.`);
          process.exit(1);
        }
        const targetClient = new N8nClient(targetAccount.url, targetAccount.apiKey);

        // Prepare workflow for target (strip IDs, credentials, etc.)
        const cloneData = {
          name: sourceWf.name,
          nodes: sourceWf.nodes.map(node => ({
            id: node.id,
            name: node.name,
            type: node.type,
            typeVersion: node.typeVersion,
            position: node.position,
            parameters: node.parameters,
            // Don't copy credentials - they won't exist in target
          })),
          connections: sourceWf.connections,
          settings: sourceWf.settings || { executionOrder: 'v1' },
        };

        const created = await targetClient.createWorkflow(cloneData);
        console.log(`Created: ${created.name} (ID: ${created.id}) in ${targetWorkspace}`);
        console.log(`Note: Credentials need to be configured manually.`);
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
          includeData: false,
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
            console.log('ID\tSTATUS\tSTARTED');
            for (const exec of executions) {
              const date = new Date(exec.startedAt).toLocaleString();
              console.log(`${exec.id}\t${exec.status}\t${date}`);
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
