// AHPRA-style medical registration number: 3 letters + 10 digits, e.g. MED0001234567.
export const REGISTRATION_NUMBER_RE = /^[A-Z]{3}\d{10}$/;

export function isValidRegistrationNumber(value) {
  return typeof value === 'string' && REGISTRATION_NUMBER_RE.test(value);
}
