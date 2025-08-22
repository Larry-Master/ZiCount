class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Receipt operations
  async getReceipts() {
    return this.request('/api/receipts');
  }

  async getReceipt(receiptId) {
    return this.request(`/api/receipts/${receiptId}`);
  }

  async deleteReceipt(receiptId) {
    return this.request(`/api/receipts/${receiptId}`, {
      method: 'DELETE'
    });
  }

  async uploadReceipt(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    return response.json();
  }

  // Item claim operations
  async claimItem(receiptId, itemId, userId) {
    return this.request(`/api/receipts/${receiptId}/items/${itemId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async unclaimItem(itemId) {
    return this.request(`/api/items/${itemId}/unclaim`, {
      method: 'POST',
    });
  }

  // User claims
  async getUserClaims(userId) {
    return this.request(`/api/users/${userId}/claims`);
  }
}

export const apiClient = new ApiClient();
export default ApiClient;
