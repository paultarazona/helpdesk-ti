const { z } = require('zod');

const STATUSES = ['open', 'in_progress', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

// HTML forms send assetId="" when the "no asset" option is selected — treat
// that as "no asset" (undefined) rather than a validation failure.
const emptyStringToUndefined = (value) => (value === '' || value === undefined ? undefined : value);

const assetIdSchema = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().positive().optional()
);

// `.strict()` rejects any field not declared here — in particular a
// client-supplied `requesterId` or `id`, so ownership can never be spoofed
// from the request body (the requester is always taken from the
// authenticated `request.user`, set in the controller/service, never from
// this payload).
const createTicketSchema = z
  .object({
    subject: z.string().min(1, 'Subject is required.').max(200, 'Subject must be at most 200 characters.'),
    description: z.string().min(1, 'Description is required.'),
    priority: z.enum(PRIORITIES).default('medium'),
    status: z.enum(STATUSES).default('open'),
    assetId: assetIdSchema,
  })
  .strict();

const updateTicketSchema = z
  .object({
    subject: z.string().min(1, 'Subject is required.').max(200, 'Subject must be at most 200 characters.'),
    description: z.string().min(1, 'Description is required.'),
    priority: z.enum(PRIORITIES),
    status: z.enum(STATUSES),
    assetId: assetIdSchema,
  })
  .strict();

// Search/filter query params (GET /tickets). Mitigates [VULN-001][A03:SQLi]
// alongside the repository (repository/index.js), which never concatenates
// these values into SQL — they are always passed to Knex as bound
// parameters. This schema's job is only to bound the shape/size of the
// input (reject non-strings, cap length, restrict status/priority to known
// values); it deliberately does NOT reject SQLi-shaped strings like
// `' OR '1'='1` as search text, because that is a perfectly valid thing to
// search for — the real mitigation is that it can never break out of its
// parameter slot in the repository layer.
const ticketQuerySchema = z.object({
  search: z.string().max(200, 'Search must be at most 200 characters.').optional().default(''),
  status: z.enum([...STATUSES, '']).optional().default(''),
  priority: z.enum([...PRIORITIES, '']).optional().default(''),
});

module.exports = {
  createTicketSchema,
  updateTicketSchema,
  ticketQuerySchema,
  STATUSES,
  PRIORITIES,
};
