/**
 * Token usage extractor for AI agent nodes
 */

// Known AI-related node types in n8n
const AI_NODE_TYPES = [
  'n8n-nodes-langchain.agent',
  'n8n-nodes-langchain.chainLlm',
  'n8n-nodes-langchain.openAi',
  'n8n-nodes-langchain.lmChatOpenAi',
  'n8n-nodes-langchain.lmChatAnthropic',
  'n8n-nodes-langchain.lmChatGoogleGemini',
  '@n8n/n8n-nodes-langchain.agent',
  '@n8n/n8n-nodes-langchain.chainLlm',
  '@n8n/n8n-nodes-langchain.openAi',
  '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
];

/**
 * Check if a node is an AI-related node
 */
function isAiNode(nodeType) {
  return AI_NODE_TYPES.some(type =>
    nodeType?.toLowerCase().includes(type.toLowerCase()) ||
    nodeType?.toLowerCase().includes('langchain') ||
    nodeType?.toLowerCase().includes('openai') ||
    nodeType?.toLowerCase().includes('anthropic') ||
    nodeType?.toLowerCase().includes('agent')
  );
}

/**
 * Recursively search for token usage in an object
 */
function findTokenUsage(obj, path = '') {
  const results = [];

  if (!obj || typeof obj !== 'object') {
    return results;
  }

  // Check for tokenUsage property
  if (obj.tokenUsage) {
    results.push({
      path,
      tokenUsage: obj.tokenUsage,
      model: obj.model_name || obj.model || obj.modelName || 'unknown',
    });
  }

  // Check for llmOutput with tokenUsage
  if (obj.llmOutput?.tokenUsage) {
    results.push({
      path: path ? `${path}.llmOutput` : 'llmOutput',
      tokenUsage: obj.llmOutput.tokenUsage,
      model: obj.llmOutput.model_name || obj.llmOutput.model || 'unknown',
    });
  }

  // Check for usage property (OpenAI style)
  if (obj.usage && (obj.usage.prompt_tokens || obj.usage.completion_tokens)) {
    results.push({
      path,
      tokenUsage: {
        promptTokens: obj.usage.prompt_tokens,
        completionTokens: obj.usage.completion_tokens,
        totalTokens: obj.usage.total_tokens,
      },
      model: obj.model || 'unknown',
    });
  }

  // Recurse into arrays
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      results.push(...findTokenUsage(item, `${path}[${index}]`));
    });
  } else {
    // Recurse into object properties
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        results.push(...findTokenUsage(value, path ? `${path}.${key}` : key));
      }
    }
  }

  return results;
}

/**
 * Extract token usage from execution data
 */
export function extractTokenUsage(execution) {
  const results = {
    executionId: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    startedAt: execution.startedAt,
    stoppedAt: execution.stoppedAt,
    nodes: [],
    totals: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  };

  const data = execution.data;
  if (!data?.resultData?.runData) {
    return results;
  }

  const runData = data.resultData.runData;

  // Iterate through all nodes in the execution
  for (const [nodeName, nodeRuns] of Object.entries(runData)) {
    if (!Array.isArray(nodeRuns)) continue;

    for (const run of nodeRuns) {
      // Check if this is an AI node or contains token data
      const nodeType = run.source?.[0]?.previousNode || '';

      // Search for token usage in the run data
      const tokenData = findTokenUsage(run);

      if (tokenData.length > 0) {
        for (const td of tokenData) {
          const usage = td.tokenUsage;
          const nodeResult = {
            nodeName,
            model: td.model,
            promptTokens: usage.promptTokens || usage.prompt_tokens || 0,
            completionTokens: usage.completionTokens || usage.completion_tokens || 0,
            totalTokens: usage.totalTokens || usage.total_tokens || 0,
          };

          results.nodes.push(nodeResult);
          results.totals.promptTokens += nodeResult.promptTokens;
          results.totals.completionTokens += nodeResult.completionTokens;
          results.totals.totalTokens += nodeResult.totalTokens;
        }
      }
    }
  }

  // Deduplicate nodes by combining same node entries
  const nodeMap = new Map();
  for (const node of results.nodes) {
    const key = `${node.nodeName}-${node.model}`;
    if (nodeMap.has(key)) {
      const existing = nodeMap.get(key);
      existing.promptTokens += node.promptTokens;
      existing.completionTokens += node.completionTokens;
      existing.totalTokens += node.totalTokens;
    } else {
      nodeMap.set(key, { ...node });
    }
  }
  results.nodes = Array.from(nodeMap.values());

  return results;
}

/**
 * Format token usage for display
 */
export function formatTokenUsage(results) {
  const lines = [];

  lines.push(`\nExecution: ${results.executionId}`);
  lines.push(`Status: ${results.status}`);
  lines.push(`Started: ${results.startedAt}`);
  lines.push(`Stopped: ${results.stoppedAt || 'N/A'}`);

  if (results.nodes.length === 0) {
    lines.push('\nNo token usage data found in this execution.');
  } else {
    lines.push('\n--- Token Usage by Node ---');

    for (const node of results.nodes) {
      lines.push(`\n  ${node.nodeName} (${node.model}):`);
      lines.push(`    Prompt tokens:     ${node.promptTokens.toLocaleString()}`);
      lines.push(`    Completion tokens: ${node.completionTokens.toLocaleString()}`);
      lines.push(`    Total tokens:      ${node.totalTokens.toLocaleString()}`);
    }

    lines.push('\n--- Totals ---');
    lines.push(`  Prompt tokens:     ${results.totals.promptTokens.toLocaleString()}`);
    lines.push(`  Completion tokens: ${results.totals.completionTokens.toLocaleString()}`);
    lines.push(`  Total tokens:      ${results.totals.totalTokens.toLocaleString()}`);
  }

  return lines.join('\n');
}
