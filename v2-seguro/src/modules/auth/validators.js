const { z } = require('zod');

// Password policy (decided for this course module — not full NIST
// breach-list checking, that's out of scope): minimum length 10, at least
// one letter and one digit. Mitigates [VULN-009][A07:CWE-521] — v1 has no
// password policy at all.
const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long.')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter.')
  .regex(/[0-9]/, 'Password must contain at least one digit.');

// `.strict()` rejects any key not explicitly declared here — in particular
// it rejects a client-supplied `role` field instead of silently dropping it.
// This is a small defense-in-depth win: role is always hardcoded to 'user'
// in the service layer (mitigates [VULN-014][A01:CWE-285], broken RBAC),
// and a request that tries to smuggle a role is rejected outright rather
// than just ignored.
const registerSchema = z
  .object({
    username: z.string().min(1, 'Username is required.').max(50, 'Username must be at most 50 characters.'),
    email: z.string().email('A valid email is required.').max(255, 'Email must be at most 255 characters.'),
    password: passwordSchema,
  })
  .strict();

// Login intentionally does not enforce the password policy — an existing
// user's stored password may predate the policy, or may simply be any
// string an attacker is trying against the endpoint. The policy is a
// registration-time control, not a login-time one.
const loginSchema = z
  .object({
    username: z.string().min(1, 'Username is required.'),
    password: z.string().min(1, 'Password is required.'),
  })
  .strict();

module.exports = { registerSchema, loginSchema, passwordSchema };
