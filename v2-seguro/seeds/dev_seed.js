const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

/**
 * Seeds two users with crossed-over data (tickets/assets/comments owned by
 * one another) so a future IDOR mitigation test can assert that user A
 * cannot read or modify user B's resources.
 *
 * @param { import('knex').Knex } knex
 */
exports.seed = async function seed(knex) {
  await knex('comments').del();
  await knex('tickets').del();
  await knex('assets').del();
  await knex('users').del();

  const [passwordAlice, passwordBob, passwordAdmin] = await Promise.all([
    bcrypt.hash('AliceDevPass!123', BCRYPT_ROUNDS),
    bcrypt.hash('BobDevPass!123', BCRYPT_ROUNDS),
    bcrypt.hash('AdminDevPass!123', BCRYPT_ROUNDS),
  ]);

  const [alice] = await knex('users')
    .insert({
      username: 'alice',
      email: 'alice@example.test',
      password_hash: passwordAlice,
      role: 'user',
    })
    .returning('id');

  const [bob] = await knex('users')
    .insert({
      username: 'bob',
      email: 'bob@example.test',
      password_hash: passwordBob,
      role: 'user',
    })
    .returning('id');

  await knex('users').insert({
    username: 'admin',
    email: 'admin@example.test',
    password_hash: passwordAdmin,
    role: 'admin',
  });

  const aliceId = alice.id ?? alice;
  const bobId = bob.id ?? bob;

  const [aliceLaptop] = await knex('assets')
    .insert({
      name: "Alice's Laptop",
      asset_type: 'laptop',
      ip_address: '10.0.0.11',
      assigned_to_user_id: aliceId,
      created_by_user_id: aliceId,
    })
    .returning('id');

  const [bobRouter] = await knex('assets')
    .insert({
      name: "Bob's Router",
      asset_type: 'router',
      ip_address: '10.0.0.22',
      assigned_to_user_id: bobId,
      created_by_user_id: bobId,
    })
    .returning('id');

  const [aliceTicket] = await knex('tickets')
    .insert({
      subject: "Alice's laptop won't boot",
      description: 'Screen stays black after the login chime.',
      status: 'open',
      priority: 'high',
      requester_id: aliceId,
      asset_id: aliceLaptop.id ?? aliceLaptop,
    })
    .returning('id');

  const [bobTicket] = await knex('tickets')
    .insert({
      subject: 'Router intermittently drops connection',
      description: 'Wi-Fi disconnects every ~30 minutes.',
      status: 'in_progress',
      priority: 'medium',
      requester_id: bobId,
      asset_id: bobRouter.id ?? bobRouter,
    })
    .returning('id');

  // Cross-user comments: Bob comments on Alice's ticket and vice versa, so
  // ownership checks must be verified per-ticket, not per-user-blanket.
  await knex('comments').insert([
    {
      ticket_id: aliceTicket.id ?? aliceTicket,
      author_id: bobId,
      body: 'Have you tried a hard reset (hold power for 10s)?',
    },
    {
      ticket_id: bobTicket.id ?? bobTicket,
      author_id: aliceId,
      body: 'Same issue happened to me last month, rebooting the ONT fixed it.',
    },
  ]);
};
