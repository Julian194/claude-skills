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
