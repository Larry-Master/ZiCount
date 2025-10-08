class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        let error;
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
          error = await response.json().catch(() => ({ message: 'Request failed' }));
        } else {
          const text = await response.text();
          error = { message: text.includes('<') && text.includes('>') ? `Server error (${response.status})` : text || 'Request failed' };
        }
        
        const err = new Error(error.message || `HTTP ${response.status}`);
        err.status = response.status;
        throw err;
      }

      const contentType = response.headers.get('content-type');
      return contentType?.includes('application/json') ? response.json() : response.text();
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Network error - please check your connection');
      }
      throw err;
    }
  }

  async getReceipts() {
    return this.request('/api/receipts');
  }

  async getReceipt(receiptId) {
    return this.request(`/api/receipts/${receiptId}`);
  }

  async deleteReceipt(receiptId) {
    return this.request(`/api/receipts/${receiptId}`, { method: 'DELETE' });
  }

  async uploadReceipt(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/analyze', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  }

  async claimItem(receiptId, itemId, userId) {
    return this.request(`/api/receipts/${receiptId}/items/${itemId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async unclaimItem(itemId) {
    try {
      const result = await this.request(`/api/items/${itemId}/unclaim`, { method: 'DELETE' });
      // Handle both success cases: successful unclaim or item was never claimed
      return result;
    } catch (err) {
      // If item not found (404), treat as already unclaimed
      if (err?.status === 404) return { success: true, alreadyUnclaimed: true };
      throw err;
    }
  }

  async getUserClaims(userId) {
    return this.request(`/api/users/${userId}/claims`);
  }

  async getUsers() {
    return this.request('/api/users');
  }

  async createUser(name) {
    return this.request('/api/users', { method: 'POST', body: JSON.stringify({ name }) });
  }

  async deleteUser(userId) {
    return this.request(`/api/users/${userId}`, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export default ApiClient;
