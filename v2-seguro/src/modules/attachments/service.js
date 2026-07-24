const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('../../core/errors/AppError');
const { TicketsService } = require('../tickets/service');
const { AttachmentsRepository } = require('./repository');

// Mitigates [VULN-006][A05:Unrestricted-Upload][CWE-434]. v1
// (v1-inseguro/src/modules/attachments/routes.js) trusts the client
// completely: no type whitelist, no size limit, and the file is written
// under `public/uploads` using either the client-supplied `storagePath` or
// the original filename — so `storagePath=../../evil.js` (or a
// `.php`/`.js` upload with a `.png` name) is written wherever the client
// wants, inside the webroot Express serves statically.
//
// This module never uses client-supplied data to decide *where* a file is
// written, and never trusts client-supplied data to decide *whether* a
// file is written:
//   - WHERE: the on-disk filename is always `crypto.randomUUID()` + an
//     extension derived from the extension we detected, never the client's
//     filename/path. Path traversal is impossible by construction (there is
//     no attacker-controlled path segment to escape with `../`), and we
//     still defensively verify the resolved path stays inside the storage
//     directory (belt and suspenders, in case that invariant is ever
//     broken by a future refactor).
//   - WHETHER: the decision to accept a file is based only on the file's
//     real bytes (magic-number sniffing below), never on the client's
//     `Content-Type` header or the extension in the original filename —
//     both of which are attacker-controlled and proven meaningless by the
//     PHP-disguised-as-.png e2e test in attachments.e2e.test.js.
//
// Library choice: rather than pull in `file-type` (whose modern releases,
// v17+, are pure ESM and awkward to consume from this CommonJS codebase,
// and which — like any magic-number sniffer — still returns `undefined`
// for plain text, so a "logs" allowance needs custom handling either way)
// this module hand-rolls the handful of signatures it actually needs. The
// whitelist is small and fixed (screenshots + logs, per
// docs/plan-mesa-ayuda-ti.md §1), so a few well-known magic numbers plus an
// explicit "looks like a script, not a log" rejection is simpler to read,
// test, and reason about than an extra dependency.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — generous for a screenshot or a text log.

const STORAGE_DIR = path.resolve(__dirname, '..', '..', '..', 'storage', 'attachments');

// Known binary magic numbers for the images we accept (screenshots of the
// error, per the plan). Checked against the real buffer, never the
// filename or declared Content-Type.
const BINARY_SIGNATURES = [
  { mime: 'image/png', ext: 'png', match: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', match: (buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  {
    mime: 'image/gif',
    ext: 'gif',
    match: (buffer) =>
      buffer.subarray(0, 6).equals(Buffer.from('GIF87a', 'ascii')) || buffer.subarray(0, 6).equals(Buffer.from('GIF89a', 'ascii')),
  },
];

// Signatures that prove a "plain text" buffer is actually executable
// code/a script, not a log — this is what stops the classic "upload a
// webshell, name it .png, lie about Content-Type" attack: the content
// itself contains no PNG/JPEG/GIF magic number (so it falls through to the
// text branch), but it also isn't an innocuous log line, it's a PHP tag /
// shebang / script tag. Checked against the raw bytes, case-insensitively,
// anywhere in the first few KB — not against the filename or extension.
const DANGEROUS_TEXT_PATTERNS = [/<\?php/i, /<%[^\r\n]*%>/, /<script[\s>]/i, /^#!\s*\//m, /\bexec\s*\(/i, /\bsystem\s*\(/i];

/**
 * Returns true if `buffer` decodes cleanly as UTF-8 text with no embedded
 * NUL bytes — a reasonable proxy for "this is a text log, not an arbitrary
 * binary blob" once the known binary signatures above have already failed
 * to match.
 */
function looksLikePlainText(buffer) {
  if (buffer.length === 0) return false;
  if (buffer.includes(0x00)) return false;

  try {
    // `fatal: true` makes TextDecoder throw on any byte sequence that isn't
    // valid UTF-8, instead of silently substituting U+FFFD.
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects the REAL type of `buffer` by inspecting its bytes. Returns
 * `{ mime, ext }` for an allowed type, or `null` if the content is not one
 * of the whitelisted types (or can't be safely classified) — regardless of
 * what the client claims via filename or Content-Type.
 *
 * @param {Buffer} buffer
 * @returns {{ mime: string, ext: string } | null}
 */
function detectRealFileType(buffer) {
  for (const signature of BINARY_SIGNATURES) {
    if (signature.match(buffer)) {
      return { mime: signature.mime, ext: signature.ext };
    }
  }

  if (looksLikePlainText(buffer)) {
    const asText = buffer.toString('utf-8');
    const isDangerous = DANGEROUS_TEXT_PATTERNS.some((pattern) => pattern.test(asText));
    if (isDangerous) return null;
    return { mime: 'text/plain', ext: 'txt' };
  }

  return null;
}

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'text/plain']);

class AttachmentsService {
  /**
   * @param {AttachmentsRepository} [repository]
   * @param {TicketsService} [ticketsService]
   * @param {string} [storageDir]
   */
  constructor(repository = new AttachmentsRepository(), ticketsService = new TicketsService(), storageDir = STORAGE_DIR) {
    this.repository = repository;
    this.ticketsService = ticketsService;
    this.storageDir = storageDir;
  }

  /**
   * Resolves `storedFilename` against the storage directory and asserts the
   * result cannot have escaped it. Defensive-in-depth: the filename is
   * always a server-generated UUID (see upload() below), so there is no
   * attacker-controlled input here to traverse with in the first place —
   * this check exists so a future bug can never silently turn into a path
   * traversal vulnerability.
   */
  resolveStoragePath(storedFilename) {
    const resolved = path.resolve(this.storageDir, storedFilename);
    const withSeparator = this.storageDir.endsWith(path.sep) ? this.storageDir : `${this.storageDir}${path.sep}`;

    if (resolved !== this.storageDir && !resolved.startsWith(withSeparator)) {
      throw new AppError('Invalid attachment path.', 400);
    }

    return resolved;
  }

  /**
   * Uploads a new attachment for a ticket, enforcing the same ownership
   * rule as every other ticket sub-resource (VULN-004/IDOR): a non-owner
   * (and non-staff) user gets the same generic 404 as viewing/editing/
   * commenting on the ticket.
   *
   * @param {number} ticketId
   * @param {{ id: number, role: string }} user
   * @param {{ originalname: string, buffer: Buffer, size: number } | undefined} file
   */
  async upload(ticketId, user, file) {
    await this.ticketsService.getOwnedTicket(ticketId, user);

    if (!file) {
      throw new AppError('A file is required.', 400);
    }

    // Defense-in-depth alongside Multer's `limits.fileSize` (see
    // routes.js) — this keeps the size rule enforceable/testable directly
    // against the service even if the multer wiring ever changes.
    if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new AppError('File exceeds the maximum allowed size (5 MB).', 400);
    }

    const detected = detectRealFileType(file.buffer);

    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      // Deliberately generic: never tells the client which check failed
      // (unknown type vs. dangerous content) — that distinction is only
      // useful to an attacker probing the whitelist.
      throw new AppError('File type not allowed.', 400);
    }

    const storedFilename = `${crypto.randomUUID()}.${detected.ext}`;
    const destination = this.resolveStoragePath(storedFilename);

    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.writeFile(destination, file.buffer);

    const id = await this.repository.create({
      ticketId,
      uploadedBy: user.id,
      // Original client filename: metadata only, shown in the UI via
      // EJS's auto-escaping `<%= %>` (see core/views/tickets/show.ejs) —
      // never used to build a filesystem path.
      originalFilename: file.originalname,
      storedFilename,
      mimeType: detected.mime,
      sizeBytes: file.buffer.length,
    });

    return this.repository.findById(id);
  }

  /**
   * Lists attachments for a ticket, enforcing the ownership rule.
   *
   * @param {number} ticketId
   * @param {{ id: number, role: string }} user
   */
  async listForTicket(ticketId, user) {
    await this.ticketsService.getOwnedTicket(ticketId, user);
    return this.repository.listByTicketId(ticketId);
  }

  /**
   * Resolves an attachment for download, enforcing ownership AND that the
   * attachment actually belongs to the ticket in the URL — the same
   * generic 404 as any other IDOR-guarded lookup (VULN-004), so a user
   * cannot download someone else's attachment even by directly guessing
   * an attachment id under their own accessible ticket ids.
   *
   * @param {number} ticketId
   * @param {number} attachmentId
   * @param {{ id: number, role: string }} user
   */
  async getForDownload(ticketId, attachmentId, user) {
    await this.ticketsService.getOwnedTicket(ticketId, user);

    const attachment = await this.repository.findById(attachmentId);

    if (!attachment || attachment.ticket_id !== ticketId) {
      throw new AppError('Attachment not found.', 404);
    }

    const filePath = this.resolveStoragePath(attachment.stored_filename);
    return { attachment, filePath };
  }
}

module.exports = {
  AttachmentsService,
  detectRealFileType,
  looksLikePlainText,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  STORAGE_DIR,
};
