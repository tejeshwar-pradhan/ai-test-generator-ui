
//const BASE_URL = process.env.API_BASE_URL;
const BASE_URL = 'http://127.0.0.1:8000';
const apiClient = async (endpoint, options = {}) => {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  } catch (error) {
    console.error(`[API ERROR] ${endpoint}:`, error.message);
    throw error;
  }
};

export default apiClient;