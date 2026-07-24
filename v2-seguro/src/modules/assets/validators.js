const { z } = require('zod');

// Fixed domain taken verbatim from the CHECK constraint in
// migrations/002_create_assets.js ('server', 'laptop', 'switch', 'router',
// 'printer') — the same values v1 (v1-inseguro/src/views/assets/form.ejs)
// offers in its <select>. Do NOT invent values not present there.
const ASSET_TYPES = ['server', 'laptop', 'switch', 'router', 'printer'];

// HTML forms send ipAddress="" / assignedToUserId="" when the optional field
// is left blank — treat that as "not provided" (undefined) rather than a
// validation failure. Mirrors the same pattern used for `assetId` in
// tickets/validators.js.
const emptyStringToUndefined = (value) => (value === '' || value === undefined ? undefined : value);

const ipAddressSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().ip({ message: 'ipAddress must be a valid IPv4 or IPv6 address.' }).optional()
);

const assignedToUserIdSchema = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().positive().optional()
);

// `.strict()` rejects any field not declared here — in particular a
// client-supplied `createdByUserId` or `id`, so the creator/owner can never
// be spoofed from the request body (it is always taken from the
// authenticated `request.user`, set in the controller/service).
const createAssetSchema = z
  .object({
    name: z.string().min(1, 'Name is required.').max(120, 'Name must be at most 120 characters.'),
    assetType: z.enum(ASSET_TYPES),
    ipAddress: ipAddressSchema,
    assignedToUserId: assignedToUserIdSchema,
  })
  .strict();

const updateAssetSchema = z
  .object({
    name: z.string().min(1, 'Name is required.').max(120, 'Name must be at most 120 characters.'),
    assetType: z.enum(ASSET_TYPES),
    ipAddress: ipAddressSchema,
    assignedToUserId: assignedToUserIdSchema,
  })
  .strict();

// Search query params (GET /assets?search=). Mitigates [VULN-001][A03:SQLi]
// alongside the repository (repository.js), which never concatenates this
// value into SQL — it is always passed to Knex as a bound parameter. This
// schema only bounds the shape/size of the input; it deliberately does NOT
// reject SQLi-shaped strings like `' OR '1'='1`, since that is a perfectly
// valid (if unlikely to match) search term — the real mitigation lives in
// the repository layer.
const assetQuerySchema = z.object({
  search: z.string().max(200, 'Search must be at most 200 characters.').optional().default(''),
});

module.exports = {
  createAssetSchema,
  updateAssetSchema,
  assetQuerySchema,
  ASSET_TYPES,
};
