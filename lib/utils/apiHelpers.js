/**
 * Create standardized HTTP method not allowed response
 * @param {Object} res - Next.js response object
 * @param {string|string[]} allowedMethods - Allowed HTTP methods
 * @param {string} method - Current HTTP method that was attempted
 */
export function methodNotAllowed(res, allowedMethods, method) {
  const methods = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];
  res.setHeader('Allow', methods);
  res.status(405).end(`Method ${method} Not Allowed`);
}

/**
 * Check if method is allowed and handle rejection
 * @param {Object} req - Next.js request object
 * @param {Object} res - Next.js response object
 * @param {string|string[]} allowedMethods - Allowed HTTP methods
 * @returns {boolean} True if method is allowed, false if rejected
 */
export function checkMethod(req, res, allowedMethods) {
  const methods = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];
  if (!methods.includes(req.method)) {
    methodNotAllowed(res, methods, req.method);
    return false;
  }
  return true;
}

/**
 * Standard error response handler
 * @param {Object} res - Next.js response object
 * @param {Error} error - Error object
 * @param {string} message - Custom error message
 * @param {number} status - HTTP status code (default: 500)
 */
export function errorResponse(res, error, message = 'Internal server error', status = 500) {
  console.error(message + ':', error);
  res.status(status).json({ error: message });
}