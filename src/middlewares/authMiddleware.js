// src/middlewares/authMiddleware.js
// ═══════════════════════════════════════════════
// JWT Verification & Role-Based Access Control
// ═══════════════════════════════════════════════

const jwt = require('jsonwebtoken');

/**
 * Middleware: Verify JWT Token
 * Attaches decoded user data to req.user
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak disediakan' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role, iat, exp }
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa' });
  }
};

/**
 * Middleware Factory: Authorize specific roles
 * Usage: authorizeRoles('Administrator', 'Kurikulum')
 * 
 * @param  {...string} allowedRoles - Role names that are permitted
 * @returns Express middleware
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Autentikasi diperlukan' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Akses ditolak. Endpoint ini hanya untuk: ${allowedRoles.join(', ')}` 
      });
    }

    next();
  };
};

// Backward compatible: verifyAdmin = verifyToken + admin-only check
const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, (err) => {
    if (err) return;
    if (req.user.role !== 'Administrator') {
      return res.status(403).json({ message: 'Akses ditolak. Endpoint khusus Administrator' });
    }
    next();
  });
};

module.exports = { verifyToken, authorizeRoles, verifyAdmin };