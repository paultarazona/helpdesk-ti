const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  AttachmentsService,
  detectRealFileType,
  MAX_FILE_SIZE_BYTES,
} = require('../../../src/modules/attachments/service');
const { AppError } = require('../../../src/core/errors/AppError');

// Same PNG magic number the service checks against.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const GIF_MAGIC = Buffer.from('GIF89a', 'ascii');

function buildRepositoryStub(overrides = {}) {
  return {
    create: mock.fn(async () => 1),
    findById: mock.fn(async (id) => ({ id, ticket_id: TICKET.id, stored_filename: 'stub.png' })),
    listByTicketId: mock.fn(async () => []),
    delete: mock.fn(async () => 1),
    ...overrides,
  };
}

function buildTicketsServiceStub(overrides = {}) {
  return {
    getOwnedTicket: mock.fn(async () => TICKET),
    ...overrides,
  };
}

const OWNER = { id: 1, role: 'user' };
const TICKET = { id: 42, requester_id: OWNER.id };

describe('detectRealFileType() — content-sniffing, never trusts filename/Content-Type', () => {
  test('detects a genuine PNG by magic bytes', () => {
    const buffer = Buffer.concat([PNG_MAGIC, Buffer.from('rest-of-file')]);
    assert.deepEqual(detectRealFileType(buffer), { mime: 'image/png', ext: 'png' });
  });

  test('detects a genuine JPEG by magic bytes', () => {
    const buffer = Buffer.concat([JPEG_MAGIC, Buffer.from('rest-of-file')]);
    assert.deepEqual(detectRealFileType(buffer), { mime: 'image/jpeg', ext: 'jpg' });
  });

  test('detects a genuine GIF by magic bytes', () => {
    const buffer = Buffer.concat([GIF_MAGIC, Buffer.from('rest-of-file')]);
    assert.deepEqual(detectRealFileType(buffer), { mime: 'image/gif', ext: 'gif' });
  });

  test('detects a plain-text log file', () => {
    const buffer = Buffer.from('2026-07-24 10:00:00 INFO something happened\n');
    assert.deepEqual(detectRealFileType(buffer), { mime: 'text/plain', ext: 'txt' });
  });

  test('rejects a webshell disguised as .png: no PNG magic bytes in the real content', () => {
    // The classic bypass attempt: filename says "screenshot.png", but the
    // real bytes are server-side script source. No image magic number is
    // present, and the text falls into the "looks dangerous" bucket, so it
    // must be rejected regardless of what the client claims.
    const scriptPayload = Buffer.from('<' + '?php system($_GET["cmd"]); ?' + '>');
    assert.equal(detectRealFileType(scriptPayload), null);
  });

  test('rejects content containing a <script> tag even though it decodes as UTF-8 text', () => {
    const buffer = Buffer.from('<script>alert(document.cookie)</script>');
    assert.equal(detectRealFileType(buffer), null);
  });

  test('rejects content containing a shebang line', () => {
    const buffer = Buffer.from('#!/bin/sh\nrm -rf /\n');
    assert.equal(detectRealFileType(buffer), null);
  });

  test('rejects arbitrary binary data with no recognized magic number (not text, not an allowed image)', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd]);
    assert.equal(detectRealFileType(buffer), null);
  });
});

describe('AttachmentsService.upload — whitelist + size cap + server-generated filenames', () => {
  test('rejects a disguised server-side script renamed to .png at the service layer (end-to-end of the check)', async () => {
    const repository = buildRepositoryStub();
    const ticketsService = buildTicketsServiceStub();
    const service = new AttachmentsService(repository, ticketsService, '/tmp/does-not-matter');

    const file = {
      originalname: 'totally-a-screenshot.png',
      buffer: Buffer.from('<' + '?php echo shell_exec($_GET["c"]); ?' + '>'),
      size: 40,
    };

    await assert.rejects(
      () => service.upload(TICKET.id, OWNER, file),
      (error) => error instanceof AppError && error.statusCode === 400 && error.message === 'File type not allowed.'
    );
    assert.equal(repository.create.mock.callCount(), 0);
  });

  test('rejects a file whose content matches no whitelisted type (declared image/png header is ignored)', async () => {
    const repository = buildRepositoryStub();
    const ticketsService = buildTicketsServiceStub();
    const service = new AttachmentsService(repository, ticketsService, '/tmp/does-not-matter');

    const file = {
      originalname: 'fake.png',
      buffer: Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44]),
      size: 5,
    };

    await assert.rejects(
      () => service.upload(TICKET.id, OWNER, file),
      (error) => error instanceof AppError && error.statusCode === 400
    );
  });

  test('rejects a file over the 5 MB cap even if its content is a valid PNG', async () => {
    const repository = buildRepositoryStub();
    const ticketsService = buildTicketsServiceStub();
    const service = new AttachmentsService(repository, ticketsService, '/tmp/does-not-matter');

    const oversized = Buffer.concat([PNG_MAGIC, Buffer.alloc(MAX_FILE_SIZE_BYTES)]);
    const file = { originalname: 'huge.png', buffer: oversized, size: oversized.length };

    await assert.rejects(
      () => service.upload(TICKET.id, OWNER, file),
      (error) => error instanceof AppError && error.statusCode === 400 && /maximum allowed size/.test(error.message)
    );
    assert.equal(repository.create.mock.callCount(), 0);
  });

  test('accepts a valid PNG at/under the cap and persists it under a UUID filename, never the client filename', async () => {
    const repository = buildRepositoryStub();
    const ticketsService = buildTicketsServiceStub();
    const storageDir = path.join(require('node:os').tmpdir(), `attach-test-${Date.now()}`);
    const service = new AttachmentsService(repository, ticketsService, storageDir);

    const buffer = Buffer.concat([PNG_MAGIC, Buffer.from('pixels')]);
    const file = { originalname: '../../evil/../path/traversal.png', buffer, size: buffer.length };

    await service.upload(TICKET.id, OWNER, file);

    assert.equal(repository.create.mock.callCount(), 1);
    const [persisted] = repository.create.mock.calls[0].arguments;

    // Original client filename kept only as metadata...
    assert.equal(persisted.originalFilename, '../../evil/../path/traversal.png');
    // ...but the on-disk filename is a server-generated UUID + detected
    // extension, with no trace of the client's path segments.
    const uuidPngPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;
    assert.match(persisted.storedFilename, uuidPngPattern);
    assert.equal(persisted.mimeType, 'image/png');

    await require('node:fs/promises').rm(storageDir, { recursive: true, force: true });
  });

  test('propagates the ownership check: a non-owner uploading gets the ticket-not-found error, upload never runs', async () => {
    const repository = buildRepositoryStub();
    const ticketsService = buildTicketsServiceStub({
      getOwnedTicket: mock.fn(async () => {
        throw new AppError('Ticket not found.', 404);
      }),
    });
    const service = new AttachmentsService(repository, ticketsService, '/tmp/does-not-matter');

    const buffer = Buffer.concat([PNG_MAGIC, Buffer.from('pixels')]);
    const file = { originalname: 'x.png', buffer, size: buffer.length };

    await assert.rejects(
      () => service.upload(TICKET.id, OWNER, file),
      (error) => error instanceof AppError && error.statusCode === 404
    );
    assert.equal(repository.create.mock.callCount(), 0);
  });

  test('rejects when no file is provided', async () => {
    const repository = buildRepositoryStub();
    const ticketsService = buildTicketsServiceStub();
    const service = new AttachmentsService(repository, ticketsService, '/tmp/does-not-matter');

    await assert.rejects(
      () => service.upload(TICKET.id, OWNER, undefined),
      (error) => error instanceof AppError && error.statusCode === 400 && error.message === 'A file is required.'
    );
  });
});

describe('AttachmentsService.resolveStoragePath — defensive traversal check', () => {
  test('resolves a plain UUID filename inside the storage directory', () => {
    const storageDir = path.resolve(require('node:os').tmpdir(), 'attach-resolve-fixture', 'attachments');
    const service = new AttachmentsService(buildRepositoryStub(), buildTicketsServiceStub(), storageDir);

    const resolved = service.resolveStoragePath('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png');
    assert.equal(resolved, path.resolve(storageDir, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png'));
  });

  test('throws a 400 when the resolved path would escape the storage directory (../../etc/passwd)', () => {
    const storageDir = path.resolve(require('node:os').tmpdir(), 'attach-resolve-fixture', 'attachments');
    const service = new AttachmentsService(buildRepositoryStub(), buildTicketsServiceStub(), storageDir);

    assert.throws(
      () => service.resolveStoragePath('../../etc/passwd'),
      (error) => error instanceof AppError && error.statusCode === 400
    );
  });

  test('throws a 400 for a traversal payload disguised with a valid-looking suffix', () => {
    const storageDir = path.resolve(require('node:os').tmpdir(), 'attach-resolve-fixture', 'attachments');
    const service = new AttachmentsService(buildRepositoryStub(), buildTicketsServiceStub(), storageDir);

    assert.throws(
      () => service.resolveStoragePath('../../../etc/passwd%00.png'),
      (error) => error instanceof AppError && error.statusCode === 400
    );
  });
});

describe('AttachmentsService.getForDownload — IDOR guard', () => {
  test('rejects when the attachment does not belong to the ticket in the URL', async () => {
    const repository = buildRepositoryStub({
      findById: mock.fn(async () => ({ id: 5, ticket_id: 999, stored_filename: 'x.png' })),
    });
    const ticketsService = buildTicketsServiceStub();
    const service = new AttachmentsService(repository, ticketsService, '/tmp/does-not-matter');

    await assert.rejects(
      () => service.getForDownload(TICKET.id, 5, OWNER),
      (error) => error instanceof AppError && error.statusCode === 404 && error.message === 'Attachment not found.'
    );
  });

  test('rejects when the attachment does not exist', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => null) });
    const ticketsService = buildTicketsServiceStub();
    const service = new AttachmentsService(repository, ticketsService, '/tmp/does-not-matter');

    await assert.rejects(
      () => service.getForDownload(TICKET.id, 999, OWNER),
      (error) => error instanceof AppError && error.statusCode === 404
    );
  });

  test('resolves the file path for a legitimate owner+ticket+attachment match', async () => {
    const repository = buildRepositoryStub({
      findById: mock.fn(async () => ({ id: 5, ticket_id: TICKET.id, stored_filename: 'legit.png' })),
    });
    const ticketsService = buildTicketsServiceStub();
    const storageDir = path.resolve(require('node:os').tmpdir(), 'attach-resolve-fixture', 'attachments');
    const service = new AttachmentsService(repository, ticketsService, storageDir);

    const { attachment, filePath } = await service.getForDownload(TICKET.id, 5, OWNER);
    assert.equal(attachment.id, 5);
    assert.equal(filePath, path.resolve(storageDir, 'legit.png'));
  });
});
