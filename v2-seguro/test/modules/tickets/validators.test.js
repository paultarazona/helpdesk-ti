const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createTicketSchema, updateTicketSchema, ticketQuerySchema } = require('../../../src/modules/tickets/validators');

describe('tickets validators - createTicketSchema', () => {
  test('accepts a valid ticket payload with defaults for priority/status', () => {
    const result = createTicketSchema.safeParse({
      subject: 'Printer not working',
      description: 'The office printer on the 3rd floor is jammed.',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.priority, 'medium');
    assert.equal(result.data.status, 'open');
    assert.equal(result.data.assetId, undefined);
  });

  test('accepts an explicit priority/status/assetId', () => {
    const result = createTicketSchema.safeParse({
      subject: 'Server down',
      description: 'Prod server is unreachable.',
      priority: 'critical',
      status: 'in_progress',
      assetId: '5',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.priority, 'critical');
    assert.equal(result.data.status, 'in_progress');
    assert.equal(result.data.assetId, 5);
  });

  test('treats an empty-string assetId (the "no asset" form option) as undefined', () => {
    const result = createTicketSchema.safeParse({
      subject: 'Printer not working',
      description: 'Jammed again.',
      assetId: '',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.assetId, undefined);
  });

  test('rejects an empty subject', () => {
    const result = createTicketSchema.safeParse({ subject: '', description: 'Something broke.' });
    assert.equal(result.success, false);
  });

  test('rejects a subject longer than 200 characters', () => {
    const result = createTicketSchema.safeParse({
      subject: 'a'.repeat(201),
      description: 'Something broke.',
    });
    assert.equal(result.success, false);
  });

  test('rejects an empty description', () => {
    const result = createTicketSchema.safeParse({ subject: 'Subject', description: '' });
    assert.equal(result.success, false);
  });

  test('rejects a priority outside the enum', () => {
    const result = createTicketSchema.safeParse({
      subject: 'Subject',
      description: 'Description',
      priority: 'urgent',
    });
    assert.equal(result.success, false);
  });

  test('rejects a status outside the enum', () => {
    const result = createTicketSchema.safeParse({
      subject: 'Subject',
      description: 'Description',
      status: 'archived',
    });
    assert.equal(result.success, false);
  });

  test('rejects a payload that attempts to smuggle a requesterId (strict schema, ownership can never come from the client)', () => {
    const result = createTicketSchema.safeParse({
      subject: 'Subject',
      description: 'Description',
      requesterId: 999,
    });
    assert.equal(result.success, false);
  });
});

describe('tickets validators - updateTicketSchema', () => {
  test('accepts a full valid update payload', () => {
    const result = updateTicketSchema.safeParse({
      subject: 'Updated subject',
      description: 'Updated description',
      priority: 'low',
      status: 'closed',
      assetId: '',
    });

    assert.equal(result.success, true);
  });

  test('rejects a missing priority (no default on update)', () => {
    const result = updateTicketSchema.safeParse({
      subject: 'Updated subject',
      description: 'Updated description',
      status: 'closed',
    });

    assert.equal(result.success, false);
  });
});

describe('tickets validators - ticketQuerySchema (search/filter)', () => {
  test('defaults all fields when the query string is empty', () => {
    const result = ticketQuerySchema.safeParse({});

    assert.equal(result.success, true);
    assert.deepEqual(result.data, { search: '', status: '', priority: '' });
  });

  test('accepts a normal search string plus status/priority filters', () => {
    const result = ticketQuerySchema.safeParse({ search: 'printer', status: 'open', priority: 'high' });

    assert.equal(result.success, true);
    assert.equal(result.data.search, 'printer');
  });

  test('accepts a classic SQLi-shaped search string as ordinary text (not rejected — mitigation lives in the repository)', () => {
    const result = ticketQuerySchema.safeParse({ search: "' OR '1'='1" });

    assert.equal(result.success, true);
    assert.equal(result.data.search, "' OR '1'='1");
  });

  test('rejects a status value outside the enum', () => {
    const result = ticketQuerySchema.safeParse({ status: 'archived' });
    assert.equal(result.success, false);
  });

  test('rejects a priority value outside the enum', () => {
    const result = ticketQuerySchema.safeParse({ priority: 'urgent' });
    assert.equal(result.success, false);
  });

  test('rejects a search string longer than 200 characters', () => {
    const result = ticketQuerySchema.safeParse({ search: 'a'.repeat(201) });
    assert.equal(result.success, false);
  });
});
