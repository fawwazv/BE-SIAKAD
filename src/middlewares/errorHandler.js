// src/middlewares/errorHandler.js
// ═══════════════════════════════════════════════
// CENTRALIZED ERROR HANDLING MIDDLEWARE
// Catches async errors & Prisma errors gracefully
// ═══════════════════════════════════════════════

/**
 * Async Handler Wrapper
 * 
 * Wraps async controller functions so they don't need
 * individual try/catch blocks. Errors are passed to
 * the global error handler.
 * 
 * Usage:
 *   router.get('/', asyncHandler(myController.getAll));
 * 
 * Instead of writing try/catch in every controller,
 * this wrapper catches any thrown/rejected error and
 * forwards it to Express error handler.
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Prisma Error Mapper
 * 
 * Maps Prisma-specific error codes to user-friendly
 * HTTP responses.
 */
const prismaErrorMap = {
  P2002: {
    status: 409,
    getMessage: (meta) => {
      const fields = meta?.target?.join(', ') || 'field';
      return `Data dengan ${fields} yang sama sudah ada (duplikasi)`;
    },
  },
  P2003: {
    status: 400,
    getMessage: (meta) => {
      const field = meta?.field_name || 'referensi';
      return `Referensi ${field} tidak valid. Data terkait tidak ditemukan`;
    },
  },
  P2025: {
    status: 404,
    getMessage: () => 'Data yang diminta tidak ditemukan',
  },
  P2014: {
    status: 400,
    getMessage: () => 'Operasi tidak dapat dilakukan karena ada data terkait yang bergantung',
  },
};

/**
 * Global Error Handler Middleware
 * 
 * Must be registered LAST in Express middleware chain.
 * Handles:
 * - Prisma Client errors (P2002, P2003, P2025, etc.)
 * - JSON parse errors
 * - Generic errors
 */
const globalErrorHandler = (err, req, res, next) => {
  // Already sent response
  if (res.headersSent) {
    return next(err);
  }

  // Log the error
  console.error(`\n  ❌ Error [${req.method} ${req.originalUrl}]:`, err.message || err);

  // A. Prisma Known Errors
  if (err.code && prismaErrorMap[err.code]) {
    const mapped = prismaErrorMap[err.code];
    return res.status(mapped.status).json({
      message: mapped.getMessage(err.meta),
    });
  }

  // B. Prisma Validation Error
  if (err.name === 'PrismaClientValidationError') {
    return res.status(400).json({
      message: 'Data yang dikirim tidak sesuai format yang diharapkan',
    });
  }

  // C. JSON Parse Error (malformed body)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      message: 'Format JSON tidak valid',
    });
  }

  // D. JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Token tidak valid',
    });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Token sudah kadaluarsa. Silakan login kembali.',
    });
  }

  // E. Payload Too Large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'Ukuran data terlalu besar. Maksimal 10MB.',
    });
  }

  // F. Generic Server Error
  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    message: statusCode === 500
      ? 'Terjadi kesalahan internal pada server'
      : err.message || 'Terjadi kesalahan',
  });
};

/**
 * Not Found Handler (404)
 * 
 * Catches requests that don't match any route.
 * Should be placed AFTER all route definitions.
 */
const notFoundHandler = (req, res) => {
  return res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} tidak ditemukan`,
  });
};

module.exports = { asyncHandler, globalErrorHandler, notFoundHandler };
