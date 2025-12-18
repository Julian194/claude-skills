---
name: n8ncli
description: N8N workflow CLI - create/update/manage workflows, analyze executions, track errors across multiple instances. Use when user asks about n8n workflows, executions, errors, or wants to create/modify workflows via API.
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

# Get workflow definition
node {baseDir}/src/cli.js <workspace> workflow <workflow-id>

# Get workflow as JSON (for modification)
node {baseDir}/src/cli.js <workspace> workflow <workflow-id> --json

# View pinned/test data for a workflow
node {baseDir}/src/cli.js <workspace> workflow <workflow-id> --pinned

# Create workflow from JSON file
node {baseDir}/src/cli.js <workspace> workflow create <file.json>

# Update workflow from JSON file
node {baseDir}/src/cli.js <workspace> workflow update <workflow-id> <file.json>

# Update code node from JS file (avoids JSON escaping pain)
node {baseDir}/src/cli.js <workspace> workflow set-code <workflow-id> "Code Node Name" ./code.js

# Compare two workflows
node {baseDir}/src/cli.js <workspace> workflow diff <id1> <id2>

# Update a workflow setting
node {baseDir}/src/cli.js <workspace> workflow set-setting <id> <key> <value>
node {baseDir}/src/cli.js <workspace> workflow set-setting abc123 errorWorkflow xyz789

# Manage workflow tags
node {baseDir}/src/cli.js <workspace> workflow add-tag <id> <tag-name>
node {baseDir}/src/cli.js <workspace> workflow remove-tag <id> <tag-name>

# Search workflows for text or node types
node {baseDir}/src/cli.js <workspace> search ntfy
node {baseDir}/src/cli.js <workspace> search "HTTP Request"

# Clone workflow to another workspace
node {baseDir}/src/cli.js <workspace> clone <workflow-id> <target-workspace>

# Activate/deactivate workflow
node {baseDir}/src/cli.js <workspace> workflow activate <workflow-id>
node {baseDir}/src/cli.js <workspace> workflow deactivate <workflow-id>

# Delete workflow
node {baseDir}/src/cli.js <workspace> workflow delete <workflow-id>
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

**Workflow inspection:**
- `--pinned` - Show pinned/test data for a workflow

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
- Creating or modifying workflows programmatically

## Additional Docs

When creating/modifying workflows via JSON:
- `{baseDir}/docs/n8n-gotchas.md` - Common pitfalls (Loop Over Items outputs, AI Agent promptType, etc.)
- `{baseDir}/docs/node-parameters.md` - Quick reference for common node parameters (HTTP Request, Code, Slack, etc.)
