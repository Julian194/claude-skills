# Common n8n Node Parameters

Quick reference for parameters when creating/updating workflows via JSON.

## HTTP Request Node

```json
{
  "parameters": {
    "method": "GET|POST|PUT|PATCH|DELETE",
    "url": "https://api.example.com/endpoint",
    "authentication": "none|predefinedCredentialType|genericCredentialType",
    "nodeCredentialType": "httpBasicAuth|httpHeaderAuth|oAuth2Api|...",

    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Authorization", "value": "Bearer xxx" },
        { "name": "Content-Type", "value": "application/json" }
      ]
    },

    "sendQuery": true,
    "queryParameters": {
      "parameters": [
        { "name": "limit", "value": "10" }
      ]
    },

    "sendBody": true,
    "contentType": "json|form-urlencoded|multipart-form-data|raw",
    "body": "={{ $json.message }}",
    "specifyBody": "json|keypair",
    "jsonBody": "={ \"key\": \"value\" }",

    "options": {
      "timeout": 10000,
      "redirect": { "followRedirects": true }
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2
}
```

### Body Content Types

| contentType | Use Case |
|-------------|----------|
| `json` | JSON body with `specifyBody: "json"` and `jsonBody` |
| `raw` | Plain text with `body` field |
| `form-urlencoded` | Form data |
| `multipart-form-data` | File uploads |

### For ntfy notifications:
```json
{
  "parameters": {
    "method": "POST",
    "url": "http://ntfy.sh/topic",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Title", "value": "={{ $json.title }}" },
        { "name": "Priority", "value": "high" },
        { "name": "Tags", "value": "warning" },
        { "name": "Click", "value": "={{ $json.url }}" }
      ]
    },
    "sendBody": true,
    "contentType": "raw",
    "body": "={{ $json.message }}"
  }
}
```

## Code Node

```json
{
  "parameters": {
    "jsCode": "return $input.all().map(item => ({ json: { ...item.json, processed: true } }));"
  },
  "type": "n8n-nodes-base.code",
  "typeVersion": 2
}
```

### Code Node Input/Output

```javascript
// Get all input items
const items = $input.all();

// Get first item
const item = $input.first();

// Access JSON data
const data = item.json;

// Return items (must be array of { json: {} })
return [{ json: { result: 'success' } }];

// Return multiple items
return items.map(item => ({
  json: { ...item.json, modified: true }
}));
```

## Slack Node

```json
{
  "parameters": {
    "authentication": "oAuth2",
    "select": "channel",
    "channelId": {
      "__rl": true,
      "value": "C08MJSJAB8U",
      "mode": "list",
      "cachedResultName": "channel-name"
    },
    "messageType": "text|block",
    "text": "Hello world",
    "blocksUi": "={{ $json.blocks }}",
    "otherOptions": {}
  },
  "type": "n8n-nodes-base.slack",
  "typeVersion": 2.3,
  "credentials": {
    "slackOAuth2Api": {
      "id": "credential-id",
      "name": "Slack account"
    }
  }
}
```

## IF Node (Conditions)

```json
{
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "uuid",
          "leftValue": "={{ $json.status }}",
          "rightValue": "active",
          "operator": {
            "type": "string",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    }
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2
}
```

### Operators

| Type | Operations |
|------|------------|
| string | equals, notEquals, contains, notContains, startsWith, endsWith, regex |
| number | equals, notEquals, gt, lt, gte, lte |
| boolean | true, false |
| array | contains, notContains, lengthEquals, lengthGt, lengthLt |

## Error Trigger Node

```json
{
  "parameters": {},
  "type": "n8n-nodes-base.errorTrigger",
  "typeVersion": 1
}
```

### Error Data Structure

The error trigger receives:
```javascript
{
  execution: {
    id: "12345",
    url: "https://instance.n8n.cloud/workflow/.../executions/12345",
    mode: "trigger|manual|webhook",
    error: {
      name: "NodeOperationError",
      message: "Error description",
      timestamp: 1234567890000,
      node: {
        name: "Node Name",
        type: "n8n-nodes-base.httpRequest",
        parameters: { ... }
      },
      context: { itemIndex: 0 }
    }
  },
  workflow: {
    id: "abc123",
    name: "Workflow Name"
  }
}
```

## Set Node

```json
{
  "parameters": {
    "mode": "manual",
    "duplicateItem": false,
    "assignments": {
      "assignments": [
        {
          "id": "uuid",
          "name": "fieldName",
          "value": "={{ $json.source }}",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4
}
```

## Switch Node

```json
{
  "parameters": {
    "mode": "rules",
    "rules": {
      "rules": [
        {
          "output": 0,
          "conditions": {
            "conditions": [
              {
                "leftValue": "={{ $json.type }}",
                "rightValue": "email",
                "operator": { "type": "string", "operation": "equals" }
              }
            ]
          }
        }
      ]
    }
  },
  "type": "n8n-nodes-base.switch",
  "typeVersion": 3
}
```

## Webhook Trigger

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "my-webhook",
    "responseMode": "onReceived|lastNode|responseNode",
    "options": {}
  },
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2
}
```

## Schedule Trigger

```json
{
  "parameters": {
    "rule": {
      "interval": [
        { "field": "minutes", "minutesInterval": 30 }
      ]
    }
  },
  "type": "n8n-nodes-base.scheduleTrigger",
  "typeVersion": 1.2
}
```

## Common Patterns

### Expression Syntax
```
={{ $json.field }}              - Access field from current item
={{ $('Node Name').item.json }} - Access data from specific node
={{ $input.first().json }}      - First input item
={{ $now }}                     - Current timestamp
={{ $execution.id }}            - Current execution ID
```

### Credential Reference
```json
"credentials": {
  "credentialType": {
    "id": "credential-id-from-n8n",
    "name": "Display Name"
  }
}
```
