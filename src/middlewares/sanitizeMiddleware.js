// src/middlewares/sanitizeMiddleware.js
// ═══════════════════════════════════════════════
// DATA SANITIZATION MIDDLEWARE
// Prevents XSS & SQL injection via input cleaning
// ═══════════════════════════════════════════════

/**
 * HTML special character map for escaping
 */
const escapeMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const escapeRegex = /[&<>"']/g;

/**
 * Escape HTML special characters in a string
 */
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(escapeRegex, (char) => escapeMap[char]);
};

/**
 * Recursively sanitize an object's string values
 */
const sanitizeObject = (obj) => {
  if (typeof obj === 'string') {
    return escapeHtml(obj.trim());
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
};

/**
 * Sanitize Request Body
 * 
 * Escapes HTML special characters in all string values
 * in req.body to prevent XSS injection.
 * 
 * Does NOT sanitize password fields (they should be hashed anyway).
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    // Preserve password as-is (will be hashed)
    const password = req.body.password;
    req.body = sanitizeObject(req.body);
    if (password !== undefined) {
      req.body.password = password;
    }
  }
  next();
};

/**
 * Sanitize Query Params
 * 
 * Escapes HTML in query string parameters
 */
const sanitizeQuery = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
};

/**
 * Sanitize Route Params
 * 
 * Escapes HTML in route parameters
 */
const sanitizeParams = (req, res, next) => {
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
};

/**
 * Combined sanitizer — body + query + params
 * Use this as a single global middleware
 */
const sanitizeAll = (req, res, next) => {
  // Sanitize body (preserve password)
  if (req.body && typeof req.body === 'object') {
    const password = req.body.password;
    req.body = sanitizeObject(req.body);
    if (password !== undefined) {
      req.body.password = password;
    }
  }

  // Sanitize query
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize params
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
};

module.exports = {
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeAll,
};
