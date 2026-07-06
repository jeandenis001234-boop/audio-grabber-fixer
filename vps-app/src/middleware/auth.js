const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.admin) return res.status(403).json({ error: 'Accès refusé.' });
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée.' });
  }
}

function signAdminToken(admin) {
  return jwt.sign(
    { admin: true, id: admin.id, username: admin.username, role: admin.role },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

module.exports = { requireAdmin, signAdminToken };
