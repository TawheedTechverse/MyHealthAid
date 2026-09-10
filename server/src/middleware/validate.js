import { ZodError } from 'zod';
import { ApiError } from '../lib/ApiError.js';

/**
 * Validates `req[source]` against a Zod schema and replaces it with the parsed
 * value. On failure, forwards a 400 ApiError with flattened field errors.
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} [source]
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(ApiError.badRequest('Validation failed', err.flatten().fieldErrors));
        return;
      }
      next(err);
    }
  };
}
