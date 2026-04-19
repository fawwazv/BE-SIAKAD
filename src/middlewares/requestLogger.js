// src/middlewares/requestLogger.js
// ═══════════════════════════════════════════════
// REQUEST LOGGING MIDDLEWARE
// Logs all API requests for monitoring & debugging
// ═══════════════════════════════════════════════

/**
 * Colors for different HTTP methods (terminal output)
 */
const methodColors = {
  GET: '\x1b[32m',    // Green
  POST: '\x1b[33m',   // Yellow
  PUT: '\x1b[34m',    // Blue
  PATCH: '\x1b[35m',  // Magenta
  DELETE: '\x1b[31m', // Red
};

const statusColors = (code) => {
  if (code >= 500) return '\x1b[31m'; // Red
  if (code >= 400) return '\x1b[33m'; // Yellow
  if (code >= 300) return '\x1b[36m'; // Cyan
  if (code >= 200) return '\x1b[32m'; // Green
  return '\x1b[0m';
};

const reset = '\x1b[0m';

/**
 * Request Logger Middleware
 * 
 * Logs: timestamp, method, URL, status code, response time, user info
 * 
 * Example output:
 *   [2026-04-16 14:30:00] POST /api/auth/login → 200 (45ms)
 *   [2026-04-16 14:30:05] GET  /api/users → 200 (12ms) [admin@siakad.sch.id]
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Capture original end to hook into response
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const method = req.method.padEnd(6);
    const url = req.originalUrl || req.url;
    const status = res.statusCode;

    const mColor = methodColors[req.method] || '';
    const sColor = statusColors(status);

    // Build user string
    let userInfo = '';
    if (req.user) {
      userInfo = ` ${reset}[${req.user.role || '?'}:${req.user.userId?.substring(0, 8) || '?'}]`;
    }

    console.log(
      `  ${reset}[${timestamp}] ${mColor}${method}${reset} ${url} → ${sColor}${status}${reset} (${duration}ms)${userInfo}`
    );

    originalEnd.apply(res, args);
  };

  next();
};

/**
 * Simple request logger (no colors, for production/file logging)
 */
const requestLoggerSimple = (req, res, next) => {
  const startTime = Date.now();

  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.userId || null,
      role: req.user?.role || null,
    };

    console.log(JSON.stringify(logEntry));
    originalEnd.apply(res, args);
  };

  next();
};

module.exports = { requestLogger, requestLoggerSimple };
