import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * @param {{ id: number|string, role: 'doctor'|'patient' }} user
 */
export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * @param {string} token
 * @returns {{ sub: string, role: 'doctor'|'patient' }}
 */
export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
