const jwt = require('jsonwebtoken');

const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Cek keberadaan token di header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak disediakan' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validasi RBAC: Harus Administrator
    if (decoded.role !== 'Administrator') {
      return res.status(403).json({ message: 'Akses ditolak. Endpoint khusus Administrator' });
    }

    req.user = decoded; // Menyimpan data user ke dalam request object
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa' });
  }
};

module.exports = { verifyAdmin };