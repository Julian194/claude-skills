---
name: n8ncli
description: N8N workflow monitoring CLI - list workflows, analyze executions, track errors across multiple instances. Use when user asks about n8n workflows, executions, or errors.
---

# N8N CLI

Monitor N8N workflows and executions across multiple instances.

## Setup

```bash
cd {baseDir}
npm install
```

## Configure Workspaces

First check if already configured:
```bash
node {baseDir}/src/cli.js accounts list
```

If no workspaces, add one:
```bash
node {baseDir}/src/cli.js accounts add <name>
# Prompts for URL and API key
```

To get an API key from N8N:
1. Go to Settings → API in your N8N instance
2. Create a new API key

## Usage

```bash
# List workspaces
node {baseDir}/src/cli.js accounts list

# List workflows
node {baseDir}/src/cli.js <workspace> workflows

# List executions for a workflow
node {baseDir}/src/cli.js <workspace> executions <workflow-id> --limit 10

# Get execution summary (compact, token-efficient)
node {baseDir}/src/cli.js <workspace> execution <execution-id>

# Inspect specific node(s)
node {baseDir}/src/cli.js <workspace> execution <execution-id> --node "AI Agent"

# Full verbose output (all node data)
node {baseDir}/src/cli.js <workspace> execution <execution-id> --verbose

# Only failed nodes
node {baseDir}/src/cli.js <workspace> execution <execution-id> --errors

# AI-specific data (tokens, prompts, LLM outputs)
node {baseDir}/src/cli.js <workspace> execution <execution-id> --ai

# List recent errors across all workflows
node {baseDir}/src/cli.js <workspace> errors --limit 20
```

## Options

**Filtering:**
- `--limit <n>` - Number of results (default: 10)
- `--status <status>` - Filter: success, error, waiting
- `--node <name>` - Filter/show specific node by name pattern
- `--errors` - Only show failed nodes
- `--filter <k=v>` - Filter by customData (e.g. `--filter "airtable_id=xyz"`)

**Output to stdout (formatted):**
- `--verbose` - Full formatted node data (human-readable)
- `--ai` - AI-specific data (tokens, prompts, LLM outputs)
- `--full` - Show full output text (not truncated)

**Output to file (raw data):**
- `--json` - Write raw JSON to temp file, return path only

## Output Modes

| Flag | Destination | Format |
|------|-------------|--------|
| (none) | stdout | compact summary table |
| `--verbose` | stdout | formatted, human-readable |
| `--ai` | stdout | AI-specific formatted |
| `--json` | temp file | raw JSON data |

The `--json` flag writes to a temp file for context efficiency:
```bash
node {baseDir}/src/cli.js <workspace> execution <id> --json
# Output: JSON written to: /tmp/n8ncli/execution-123-2025-12-15T...json
```

Then use Read/Grep tools to search the file as needed.

## Default Behavior

By default, `execution` shows a **compact summary table**:
- Node name, status, execution time, output size
- Token-efficient for context
- Use `--node` to drill into specific nodes

## Data Storage

- `~/.n8ncli/accounts.json` - Workspace credentials

## When to Use

- User asks about N8N workflows or executions
- User wants to check for errors in N8N
- User asks about token usage in AI workflows
- Debugging failed workflow executions
- Inspecting node inputs/outputs
