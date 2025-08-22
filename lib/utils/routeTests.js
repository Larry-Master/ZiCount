// Route validation test for Vercel deployment
// This file can be used to test all API routes manually

const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://your-vercel-app.vercel.app' 
  : 'http://localhost:3000';

const testRoutes = async () => {
  const results = [];

  // Test 1: GET /api/receipts
  try {
    const response = await fetch(`${API_BASE}/api/receipts`);
    const data = await response.json();
    results.push({
      route: 'GET /api/receipts',
      status: response.status,
      success: response.ok,
      data: Array.isArray(data) ? `Array with ${data.length} items` : data
    });
  } catch (error) {
    results.push({
      route: 'GET /api/receipts',
      status: 'error',
      success: false,
      error: error.message
    });
  }

  // Test 2: POST /api/receipts (create receipt)
  try {
    const response = await fetch(`${API_BASE}/api/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Receipt',
        items: [
          { id: 'test-1', name: 'Test Item', price: '5.99', quantity: '1' }
        ],
        total: '5.99'
      })
    });
    const data = await response.json();
    results.push({
      route: 'POST /api/receipts',
      status: response.status,
      success: response.ok,
      data: data
    });
  } catch (error) {
    results.push({
      route: 'POST /api/receipts',
      status: 'error',
      success: false,
      error: error.message
    });
  }

  // Test 3: GET /api/users/user1/claims
  try {
    const response = await fetch(`${API_BASE}/api/users/user1/claims`);
    const data = await response.json();
    results.push({
      route: 'GET /api/users/user1/claims',
      status: response.status,
      success: response.ok,
      data: Array.isArray(data) ? `Array with ${data.length} items` : data
    });
  } catch (error) {
    results.push({
      route: 'GET /api/users/user1/claims',
      status: 'error',
      success: false,
      error: error.message
    });
  }

  // Test 4: POST /api/analyze (with mock file)
  try {
    const formData = new FormData();
    const blob = new Blob(['test image data'], { type: 'image/jpeg' });
    formData.append('file', blob, 'test.jpg');
    
    const response = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    results.push({
      route: 'POST /api/analyze',
      status: response.status,
      success: response.ok,
      data: data.success ? 'Analysis successful' : data
    });
  } catch (error) {
    results.push({
      route: 'POST /api/analyze',
      status: 'error',
      success: false,
      error: error.message
    });
  }

  return results;
};

// Export for use in browser console or testing
if (typeof window !== 'undefined') {
  window.testRoutes = testRoutes;
}

export default testRoutes;
