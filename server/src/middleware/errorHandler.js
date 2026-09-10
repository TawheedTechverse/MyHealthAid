import { ApiError } from '../lib/ApiError.js';

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args).
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  // Postgres unique-violation -> friendlier 409.
  if (err && err.code === '23505') {
    res.status(409).json({ error: 'That record already exists' });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}
