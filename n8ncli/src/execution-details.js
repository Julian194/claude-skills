/**
 * Detailed extraction of AI exchanges from n8n execution data
 *
 * n8n Execution Data Structure:
 * ─────────────────────────────
 * execution
 * ├── id, status, startedAt, stoppedAt
 * ├── workflowId
 * ├── data
 * │   ├── startData
 * │   ├── executionData
 * │   └── resultData
 * │       ├── lastNodeExecuted
 * │       └── runData
 * │           └── [nodeName][] - Array of runs per node
 * │               ├── startTime, executionTime, executionStatus
 * │               ├── source[].previousNode
 * │               └── data
 * │                   ├── main[][] - Standard node output
 * │                   └── ai_languageModel[][] - LLM output (for AI nodes)
 * │                       └── json
 * │                           ├── response.generations[][].text
 * │                           └── tokenUsage {promptTokens, completionTokens, totalTokens}
 * └── workflowData - The workflow definition
 *
 * AI Node Types that contain token data:
 * - OpenAI Chat Model → data.ai_languageModel
 * - AI Agent → data.main (output only, tokens in underlying model)
 * - Basic LLM Chain → data.main
 */

/**
 * Extract ALL node data from an execution (inputs/outputs for every node)
 */
export function extractAllNodeData(execution) {
  const runData = execution.data?.resultData?.runData || {};

  const details = {
    executionId: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    startedAt: execution.startedAt,
    stoppedAt: execution.stoppedAt,
    duration: calculateDuration(execution.startedAt, execution.stoppedAt),
    nodes: [],
  };

  for (const [nodeName, runs] of Object.entries(runData)) {
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];

      const nodeData = {
        name: nodeName,
        runIndex: i + 1,
        status: run.executionStatus,
        startTime: run.startTime,
        executionTime: run.executionTime,
        input: extractNodeInput(run),
        output: extractNodeOutput(run),
      };

      details.nodes.push(nodeData);
    }
  }

  // Sort by startTime
  details.nodes.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  return details;
}

/**
 * Extract input data from a node run
 */
function extractNodeInput(run) {
  // Input comes from source nodes, but we can also check inputData if available
  const source = run.source;
  if (source && source.length > 0) {
    return source.map(s => s.previousNode).filter(Boolean);
  }
  return null;
}

/**
 * Extract output data from a node run
 */
function extractNodeOutput(run) {
  const outputs = {};

  // Check main channel
  if (run.data?.main) {
    const mainData = run.data.main.flat().map(item => item?.json).filter(Boolean);
    if (mainData.length > 0) {
      outputs.main = mainData;
    }
  }

  // Check ai_languageModel channel
  if (run.data?.ai_languageModel) {
    const aiData = run.data.ai_languageModel.flat().map(item => item?.json).filter(Boolean);
    if (aiData.length > 0) {
      outputs.ai = aiData;
    }
  }

  return Object.keys(outputs).length > 0 ? outputs : null;
}

/**
 * Format compact summary table (default, token-efficient)
 */
export function formatCompactSummary(details) {
  const lines = [];

  lines.push(`\nExecution: ${details.executionId} | ${details.status} | ${details.duration}`);
  lines.push(`Started: ${details.startedAt}`);
  lines.push(`${'─'.repeat(70)}`);
  lines.push(`${'NODE'.padEnd(35)} ${'STATUS'.padEnd(10)} ${'TIME'.padEnd(10)} OUTPUT`);
  lines.push(`${'─'.repeat(70)}`);

  for (const node of details.nodes) {
    const name = node.name.length > 32 ? node.name.slice(0, 32) + '...' : node.name;
    const status = node.status || 'unknown';
    const time = `${node.executionTime}ms`;
    const outputSize = node.output ? formatBytes(JSON.stringify(node.output).length) : '-';

    lines.push(`${name.padEnd(35)} ${status.padEnd(10)} ${time.padEnd(10)} ${outputSize}`);
  }

  lines.push(`${'─'.repeat(70)}`);
  lines.push(`Total: ${details.nodes.length} nodes`);
  lines.push(`\nTip: Use --node "Node Name" to inspect a specific node's data`);

  return lines.join('\n');
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Filter nodes by name pattern
 */
export function filterNodesByName(details, pattern) {
  const lowerPattern = pattern.toLowerCase();
  return {
    ...details,
    nodes: details.nodes.filter(n => n.name.toLowerCase().includes(lowerPattern)),
  };
}

/**
 * Filter to only failed nodes
 */
export function filterFailedNodes(details) {
  return {
    ...details,
    nodes: details.nodes.filter(n => n.status === 'error' || n.status === 'failed'),
  };
}

/**
 * Format all node data for display (verbose mode)
 */
export function formatAllNodeData(details, options = {}) {
  const lines = [];
  const { showFullOutput = false, maxLength = 500 } = options;

  lines.push(`\n${'═'.repeat(60)}`);
  lines.push(`Execution: ${details.executionId}`);
  lines.push(`Status: ${details.status} | Duration: ${details.duration}`);
  lines.push(`Started: ${details.startedAt}`);
  lines.push(`Nodes: ${details.nodes.length}`);
  lines.push(`${'═'.repeat(60)}`);

  for (const node of details.nodes) {
    lines.push(`\n▸ ${node.name} (run ${node.runIndex})`);
    lines.push(`  Status: ${node.status} | Time: ${node.executionTime}ms`);

    if (node.input) {
      lines.push(`  Input from: ${node.input.join(', ')}`);
    }

    if (node.output) {
      for (const [channel, data] of Object.entries(node.output)) {
        const preview = JSON.stringify(data, null, 2);
        const truncated = showFullOutput ? preview : preview.slice(0, maxLength);
        lines.push(`  Output [${channel}]:`);
        lines.push(`    ${truncated.replace(/\n/g, '\n    ')}${preview.length > maxLength && !showFullOutput ? '...' : ''}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Extract all AI-related details from an execution
 */
export function extractAiDetails(execution) {
  const runData = execution.data?.resultData?.runData || {};

  const details = {
    executionId: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    startedAt: execution.startedAt,
    stoppedAt: execution.stoppedAt,
    duration: calculateDuration(execution.startedAt, execution.stoppedAt),
    prompts: extractPrompts(runData),
    exchanges: extractExchanges(runData),
    totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  // Calculate totals
  for (const exchange of details.exchanges) {
    details.totals.promptTokens += exchange.tokens.promptTokens || 0;
    details.totals.completionTokens += exchange.tokens.completionTokens || 0;
    details.totals.totalTokens += exchange.tokens.totalTokens || 0;
  }

  return details;
}

/**
 * Calculate duration in human readable format
 */
function calculateDuration(start, end) {
  if (!start || !end) return 'N/A';
  const ms = new Date(end) - new Date(start);
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Extract prompts from a Prompts node if it exists
 */
function extractPrompts(runData) {
  const promptsNode = runData['Prompts'];
  if (!promptsNode?.[0]?.data?.main?.[0]?.[0]?.json) {
    return null;
  }

  const json = promptsNode[0].data.main[0][0].json;
  const prompts = {};

  // Extract STEP_N keys
  for (const [key, value] of Object.entries(json)) {
    if (key.startsWith('STEP_') && typeof value === 'string') {
      prompts[key] = value;
    }
  }

  return Object.keys(prompts).length > 0 ? prompts : null;
}

/**
 * Extract all AI model exchanges with tokens and outputs
 */
function extractExchanges(runData) {
  const exchanges = [];

  // Find all OpenAI/LLM nodes
  for (const [nodeName, runs] of Object.entries(runData)) {
    // Skip non-AI nodes
    if (!isAiModelNode(nodeName)) continue;

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];

      // Check ai_languageModel channel (where OpenAI Chat Model stores data)
      const aiOutput = run.data?.ai_languageModel?.[0]?.[0]?.json;
      if (aiOutput) {
        const exchange = {
          nodeName,
          runIndex: i + 1,
          timestamp: run.startTime,
          executionTime: run.executionTime,
          tokens: aiOutput.tokenUsage || {},
          output: aiOutput.response?.generations?.[0]?.[0]?.text || null,
          outputLength: aiOutput.response?.generations?.[0]?.[0]?.text?.length || 0,
        };
        exchanges.push(exchange);
      }

      // Also check main channel for agent output
      const mainOutput = run.data?.main?.[0]?.[0]?.json;
      if (mainOutput?.output && nodeName.toLowerCase().includes('agent')) {
        // Agent nodes have output but tokens are in the underlying model
        const exchange = {
          nodeName,
          runIndex: i + 1,
          timestamp: run.startTime,
          executionTime: run.executionTime,
          tokens: {},
          output: mainOutput.output,
          outputLength: mainOutput.output?.length || 0,
          isAgentOutput: true,
        };
        exchanges.push(exchange);
      }
    }
  }

  return exchanges;
}

/**
 * Check if a node name indicates an AI model node
 */
function isAiModelNode(nodeName) {
  const lowerName = nodeName.toLowerCase();
  return (
    lowerName.includes('openai') ||
    lowerName.includes('chat model') ||
    lowerName.includes('llm') ||
    lowerName.includes('anthropic') ||
    lowerName.includes('gemini') ||
    lowerName.includes('agent')
  );
}

/**
 * Format AI details for display
 */
export function formatAiDetails(details, options = {}) {
  const lines = [];
  const { showFullOutput = false, maxOutputLength = 300 } = options;

  lines.push(`\n${'═'.repeat(60)}`);
  lines.push(`Execution: ${details.executionId}`);
  lines.push(`Status: ${details.status} | Duration: ${details.duration}`);
  lines.push(`Started: ${details.startedAt}`);
  lines.push(`${'═'.repeat(60)}`);

  // Show prompts if available
  if (details.prompts) {
    lines.push(`\n📝 PROMPTS (${Object.keys(details.prompts).length} steps)`);
    lines.push('─'.repeat(40));
    for (const [step, prompt] of Object.entries(details.prompts)) {
      const preview = prompt.slice(0, 200).replace(/\n/g, ' ');
      lines.push(`  ${step}: ${preview}${prompt.length > 200 ? '...' : ''}`);
    }
  }

  // Show exchanges
  lines.push(`\n🤖 AI EXCHANGES (${details.exchanges.length} calls)`);
  lines.push('─'.repeat(40));

  for (const ex of details.exchanges) {
    if (ex.isAgentOutput) continue; // Skip agent outputs (duplicates model output)

    lines.push(`\n  [${ex.nodeName}] Run ${ex.runIndex}`);
    if (ex.tokens.totalTokens) {
      lines.push(`  Tokens: ${ex.tokens.totalTokens.toLocaleString()} (prompt: ${ex.tokens.promptTokens?.toLocaleString()}, completion: ${ex.tokens.completionTokens?.toLocaleString()})`);
    }
    if (ex.output) {
      const output = showFullOutput
        ? ex.output
        : ex.output.slice(0, maxOutputLength);
      lines.push(`  Output (${ex.outputLength.toLocaleString()} chars):`);
      lines.push(`    ${output.replace(/\n/g, '\n    ')}${ex.output.length > maxOutputLength && !showFullOutput ? '...' : ''}`);
    }
  }

  // Totals
  lines.push(`\n${'─'.repeat(40)}`);
  lines.push(`📊 TOTALS`);
  lines.push(`  Prompt tokens:     ${details.totals.promptTokens.toLocaleString()}`);
  lines.push(`  Completion tokens: ${details.totals.completionTokens.toLocaleString()}`);
  lines.push(`  Total tokens:      ${details.totals.totalTokens.toLocaleString()}`);

  return lines.join('\n');
}
