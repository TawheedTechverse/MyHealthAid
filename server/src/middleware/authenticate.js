import { ApiError } from '../lib/ApiError.js';
import { verifyToken } from '../lib/jwt.js';
import { query } from '../db/pool.js';

/**
 * Reads the Bearer token, verifies it, and attaches the current user to
 * `req.user` as `{ id, email, fullName, role }`.
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing Bearer token');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    const { rows } = await query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1',
      [payload.sub],
    );
    if (rows.length === 0) {
      throw ApiError.unauthorized('Account no longer exists');
    }

    const row = rows[0];
    req.user = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Route guard: require a specific role.
 * @param {'doctor'|'patient'} role
 */
export function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user || req.user.role !== role) {
      next(ApiError.forbidden(`This action requires a ${role} account`));
      return;
    }
    next();
  };
}
