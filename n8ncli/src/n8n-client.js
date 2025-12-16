/**
 * n8n API Client
 */

export class N8nClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-N8N-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`n8n API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * List executions for a workflow
   * @param {string} workflowId - Workflow ID to filter by
   * @param {object} options - Query options
   * @param {number} options.limit - Max results (default: 10)
   * @param {string} options.status - Filter by status: success, error, waiting
   * @param {boolean} options.includeData - Include execution data (default: true)
   */
  async listExecutions(workflowId, { limit = 10, status = null, includeData = true } = {}) {
    const params = new URLSearchParams({
      workflowId,
      limit: String(limit),
      includeData: String(includeData),
    });
    if (status) {
      params.set('status', status);
    }
    return this.request(`/executions?${params}`);
  }

  /**
   * Get a single execution by ID
   */
  async getExecution(executionId, includeData = true) {
    const params = new URLSearchParams({
      includeData: String(includeData),
    });
    return this.request(`/executions/${executionId}?${params}`);
  }

  /**
   * List all workflows
   */
  async listWorkflows() {
    return this.request('/workflows');
  }

  /**
   * Get a single workflow by ID
   */
  async getWorkflow(workflowId) {
    return this.request(`/workflows/${workflowId}`);
  }
}
