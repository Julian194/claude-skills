# n8n Node Gotchas

When creating/modifying workflows via JSON, be aware of these common pitfalls.

## Loop Over Items (splitInBatches)

The output indices are counterintuitive:
- **Output 0** = "done" - fires when ALL items are processed
- **Output 1** = "loop" - fires for EACH item to process

```json
"Loop Over Items": {
  "main": [
    [{ "node": "Aggregate Results" }],  // Output 0: done → final step
    [{ "node": "Process Item" }]         // Output 1: loop → processing node
  ]
}
```

## AI Agent Node

- Default `promptType: "auto"` expects a field called `chatInput` (from Chat Trigger)
- For custom prompts, you MUST set `promptType: "define"` and use the `text` parameter:

```json
{
  "parameters": {
    "promptType": "define",
    "text": "={{ $json.myPromptField }}",
    "options": {}
  },
  "type": "@n8n/n8n-nodes-langchain.agent"
}
```

## Set Node

- Raw JSON mode (`mode: "raw"`) with expressions is unreliable
- For outputting multiple items (array), use a **Code node** instead:

```javascript
return [
  { json: { prompt: 'First' } },
  { json: { prompt: 'Second' } },
];
```

Or use Set node with an array field + **Split Out** node to convert to items.

## Sequential Prompts Pattern

To send multiple prompts to an AI agent sequentially with memory:

```
Code Node (define prompts array) → Loop Over Items → AI Agent → (back to Loop)
         ↓                              ↓
    outputs items                  done → Aggregate Results
```

- Use **Window Buffer Memory** or **Postgres Chat Memory** with a fixed session key
- AI Agent remembers previous exchanges within the same execution

## Workflow JSON Structure

Minimal workflow structure:
```json
{
  "name": "My Workflow",
  "nodes": [
    {
      "parameters": {},
      "id": "unique-id",
      "name": "Node Name",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [x, y]
    }
  ],
  "connections": {
    "Source Node": {
      "main": [[{ "node": "Target Node", "type": "main", "index": 0 }]]
    }
  },
  "settings": { "executionOrder": "v1" }
}
```

## AI Node Connections

AI sub-nodes (models, memory, tools) use special connection types:
```json
"OpenAI Chat Model": {
  "ai_languageModel": [[{ "node": "AI Agent", "type": "ai_languageModel", "index": 0 }]]
},
"Window Buffer Memory": {
  "ai_memory": [[{ "node": "AI Agent", "type": "ai_memory", "index": 0 }]]
}
```

## API Update Limitations

When updating workflows via the n8n API (`PUT /workflows/{id}`), the API is **very strict** about accepted fields. Sending any extra field results in error 400: `"request/body must NOT have additional properties"`.

### ONLY These Fields Are Accepted

```json
{
  "name": "Workflow Name",
  "nodes": [...],
  "connections": {...},
  "settings": {...}
}
```

That's it. Only these 4 fields.

### Fields That Are REJECTED (cause 400 error)

| Field | Notes |
|-------|-------|
| `id` | Use URL param instead |
| `active` | Use `activate`/`deactivate` endpoints |
| `description` | Not updateable via API |
| `isArchived` | Not updateable via API |
| `pinData` | Must be set via UI |
| `updatedAt`, `createdAt` | Timestamps (read-only) |
| `versionId`, `activeVersionId`, `versionCounter` | Version control (read-only) |
| `triggerCount` | Stats (read-only) |
| `shared`, `tags`, `activeVersion` | Managed separately |
| `staticData`, `meta` | Internal state |

### Safe Update Pattern

When modifying an existing workflow:

```javascript
// 1. Get existing workflow
const workflow = await getWorkflow(id);

// 2. Modify what you need
workflow.nodes.push(newNode);
workflow.connections['New Node'] = {...};

// 3. Strip ALL non-accepted fields before update
const updatePayload = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings
};

// 4. Update
await updateWorkflow(id, updatePayload);
```

### Using jq to Clean Payload

```bash
jq '{name, nodes, connections, settings}' workflow.json > clean-workflow.json
```

Or to delete specific fields:
```bash
jq 'del(.active, .description, .isArchived, .pinData, .updatedAt, .createdAt, .id, .versionId, .activeVersionId, .versionCounter, .triggerCount, .shared, .tags, .activeVersion, .staticData, .meta)' workflow.json
```

### To Add Pinned Test Data

Pinned data **cannot** be set via API. The user must do it manually in the n8n UI:
1. Open workflow
2. Run/test a node
3. Click "Pin" on the output

### Activation/Deactivation

Use separate endpoints instead of the `active` field:
- `POST /workflows/{id}/activate`
- `POST /workflows/{id}/deactivate`

## Workflow Trigger Input Definition

When creating a subworkflow that receives input from another workflow:

**Wrong** — `inputSource: "passthrough"` doesn't define expected fields:
```json
{
  "parameters": {
    "inputSource": "passthrough"
  },
  "type": "n8n-nodes-base.executeWorkflowTrigger"
}
```

**Correct** — Explicitly define input fields:
```json
{
  "parameters": {
    "inputSource": "define",
    "workflowInputs": {
      "values": [
        { "name": "session_id", "type": "string" },
        { "name": "other_field", "type": "number" }
      ]
    }
  },
  "type": "n8n-nodes-base.executeWorkflowTrigger"
}
```

This ensures the parent workflow knows what fields to pass and shows proper input mapping in the UI.

## Convert to File Node (Creating Downloadable Output)

To make workflow output downloadable as a file (viewable in execution results):

```json
{
  "id": "convert-to-file",
  "name": "Convert to File",
  "type": "n8n-nodes-base.convertToFile",
  "typeVersion": 1.1,
  "position": [1100, 304],
  "parameters": {
    "operation": "toText",
    "sourceProperty": "html",
    "options": {
      "fileName": "={{ 'report-' + $json.id + '.html' }}",
      "mimeType": "text/html"
    }
  }
}
```

### Common Operations

| operation | Use Case |
|-----------|----------|
| `toText` | Convert JSON field to text file (HTML, CSV, etc.) |
| `toJson` | Convert data to JSON file |
| `spreadsheet` | Convert to Excel/CSV |

### Key Parameters

- `sourceProperty`: The JSON field containing the content (e.g., `html`, `content`)
- `options.fileName`: Dynamic filename using expressions
- `options.mimeType`: MIME type for proper browser handling

### After Running

In the execution output, the file appears as a downloadable binary. User can click to download directly from n8n UI.
