const { z } = require('zod');

// Comment body: required, non-empty after trimming whitespace, bounded
// length. This only bounds shape/size — it deliberately does NOT try to
// reject HTML/script-shaped input (e.g. '<script>...'), because that is a
// perfectly valid thing for someone to type. The actual XSS mitigation
// (VULN-002, same vulnerability class as tickets/description and
// tickets/comments in v1-inseguro) lives in the service layer (DOMPurify
// sanitization at write time) and in the view layer (EJS auto-escaping),
// not here.
//
// `.strict()` rejects any field not declared here — in particular a
// client-supplied `authorId` or `ticketId`, so authorship can never be
// spoofed from the request body (the author is always taken from the
// authenticated `request.user`, and the ticket id always from the route
// param, never from this payload).
const createCommentSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, 'Comment body is required.')
      .max(2000, 'Comment body must be at most 2000 characters.'),
  })
  .strict();

module.exports = { createCommentSchema };
