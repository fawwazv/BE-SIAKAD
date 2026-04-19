// src/middlewares/rateLimiter.js
// ═══════════════════════════════════════════════
// RATE LIMITING MIDDLEWARE
// Protects against brute-force & abuse
// ═══════════════════════════════════════════════

/**
 * In-memory rate limiter (no external dependency needed)
 * 
 * Tracks requests by IP address with a sliding window approach.
 * For production, consider using Redis-backed solutions.
 */

const rateLimitStore = new Map();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate Limiter Factory
 * 
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 min)
 * @param {number} options.maxRequests - Max requests per window (default: 100)
 * @param {string} options.message - Custom error message
 * @param {string} options.keyPrefix - Prefix for store key (to separate limiters)
 * @returns Express middleware
 * 
 * Usage:
 *   rateLimiter({ windowMs: 15*60*1000, maxRequests: 5, keyPrefix: 'login' })
 */
const rateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    message = 'Terlalu banyak permintaan. Silakan coba lagi nanti.',
    keyPrefix = 'global',
  } = options;

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      // Start new window
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, record);
    } else {
      record.count++;
    }

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - record.count);
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(record.resetTime).toISOString(),
    });

    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter.toString());

      return res.status(429).json({
        message,
        retryAfter,
      });
    }

    next();
  };
};

// ─── Pre-configured Limiters ────────────────────

/**
 * Login rate limiter: 5 attempts per 15 minutes per IP
 */
const loginLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.',
  keyPrefix: 'login',
});

/**
 * API rate limiter: 200 requests per 15 minutes per IP
 */
const apiLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 200,
  message: 'Terlalu banyak permintaan API. Silakan coba lagi nanti.',
  keyPrefix: 'api',
});

/**
 * Password reset limiter: 3 attempts per hour per IP
 */
const passwordResetLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  message: 'Terlalu banyak percobaan reset password. Silakan coba lagi dalam 1 jam.',
  keyPrefix: 'reset-pwd',
});

/**
 * QR scan limiter: 30 scans per minute (to prevent spam scanning)
 */
const qrScanLimiter = rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Terlalu banyak scan QR. Silakan tunggu sebentar.',
  keyPrefix: 'qr-scan',
});

module.exports = {
  rateLimiter,
  loginLimiter,
  apiLimiter,
  passwordResetLimiter,
  qrScanLimiter,
};
