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
   * List all projects
   */
  async listProjects() {
    return this.request('/projects');
  }

  /**
   * Get a single workflow by ID
   */
  async getWorkflow(workflowId) {
    return this.request(`/workflows/${workflowId}`);
  }

  /**
   * Create a new workflow
   * @param {object} workflow - Workflow definition
   * @param {string} workflow.name - Workflow name
   * @param {array} workflow.nodes - Array of node definitions
   * @param {object} workflow.connections - Node connections
   * @param {object} workflow.settings - Workflow settings
   */
  async createWorkflow(workflow) {
    return this.request('/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
  }

  /**
   * Update an existing workflow
   * @param {string} workflowId - Workflow ID
   * @param {object} workflow - Updated workflow definition
   */
  async updateWorkflow(workflowId, workflow) {
    return this.request(`/workflows/${workflowId}`, {
      method: 'PUT',
      body: JSON.stringify(workflow),
    });
  }

  /**
   * Delete a workflow
   * @param {string} workflowId - Workflow ID
   */
  async deleteWorkflow(workflowId) {
    return this.request(`/workflows/${workflowId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Activate a workflow
   * @param {string} workflowId - Workflow ID
   */
  async activateWorkflow(workflowId) {
    return this.request(`/workflows/${workflowId}/activate`, {
      method: 'POST',
    });
  }

  /**
   * Deactivate a workflow
   * @param {string} workflowId - Workflow ID
   */
  async deactivateWorkflow(workflowId) {
    return this.request(`/workflows/${workflowId}/deactivate`, {
      method: 'POST',
    });
  }

  /**
   * List all tags
   */
  async listTags() {
    const response = await this.request('/tags');
    return response.data || response;
  }

  /**
   * Create a new tag
   * @param {string} name - Tag name
   */
  async createTag(name) {
    return this.request('/tags', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  /**
   * Get tags for a workflow
   * @param {string} workflowId - Workflow ID
   */
  async getWorkflowTags(workflowId) {
    const workflow = await this.getWorkflow(workflowId);
    return workflow.tags || [];
  }

  /**
   * Set tags for a workflow (replaces all existing tags)
   * @param {string} workflowId - Workflow ID
   * @param {Array} tagIds - Array of tag IDs
   */
  async setWorkflowTags(workflowId, tagIds) {
    return this.request(`/workflows/${workflowId}/tags`, {
      method: 'PUT',
      body: JSON.stringify(tagIds.map(id => ({ id }))),
    });
  }
}
