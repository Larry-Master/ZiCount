/**
 * API Client for ZiCount Backend Services
 * 
 * Centralized HTTP client for all API communications with proper error handling,
 * request/response processing, and type-safe interactions with backend endpoints.
 * 
 * Features:
 * - Automatic JSON parsing and error handling
 * - Robust error message extraction from various response formats
 * - Network error detection and user-friendly messages
 * - Support for file uploads with multipart form data
 * - Configurable base URL for different environments
 * 
 * Endpoints:
 * - Receipt upload and analysis
 * - Item claiming and unclaiming
 * - User management
 * - Data synchronization
 */

class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Core HTTP request method with comprehensive error handling
   * 
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options (method, headers, body, etc.)
   * @returns {Promise} Response data (JSON or text)
   * @throws {Error} Network or HTTP errors with descriptive messages
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      // Handle non-2xx HTTP status codes
      if (!response.ok) {
        let error;
        const contentType = response.headers.get('content-type');
        
        // Try to parse JSON error response
        if (contentType && contentType.includes('application/json')) {
          error = await response.json().catch(() => ({ message: 'Request failed' }));
        } else {
          // Handle HTML error responses (e.g., Vercel error pages)
          const text = await response.text();
          if (text.includes('<') && text.includes('>')) {
            // HTML error page detected
            error = { message: `Server error (${response.status})` };
          } else {
            error = { message: text || 'Request failed' };
          }
        }
        
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      // Parse successful response based on content type
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json();
      } else {
        return response.text();
      }
    } catch (err) {
      // Convert network errors to user-friendly messages
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Network error - please check your connection');
      }
      throw err;
    }
  }

  // Receipt operations
  async getReceipts() {
    return this.request('/api/receipts');
  }

  async getReceipt(receiptId) {
    // support conditional GET via optional second arg (prevUpdatedAt handled by hooks)
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
      method: 'DELETE',
    });
  }

  // User claims
  async getUserClaims(userId) {
    return this.request(`/api/users/${userId}/claims`);
  }

  // Users / people
  async getUsers() {
    return this.request('/api/users');
  }

  async createUser(name) {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteUser(userId) {
    return this.request(`/api/users/${userId}`, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();
export default ApiClient;
