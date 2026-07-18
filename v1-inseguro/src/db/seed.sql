-- [VULN-010][A02:Plaintext-Passwords][CWE-256] v1 intentionally stores plaintext passwords.
INSERT INTO users (username, email, password, role) VALUES
  ('alice', 'alice@example.test', 'alice-password', 'user'),
  ('bob', 'bob@example.test', 'bob-password', 'user'),
  ('dana.agent', 'dana.agent@example.test', 'agent-password', 'agent'),
  ('ada.admin', 'ada.admin@example.test', 'admin-password', 'admin');

INSERT INTO assets (name, asset_type, ip_address, assigned_to_user_id, created_by_user_id) VALUES
  ('Alice Laptop', 'laptop', '10.10.0.21', 1, 3),
  ('Bob File Server', 'server', '10.10.0.22', 2, 3),
  ('Main Floor Switch', 'switch', '10.10.0.2', NULL, 3);

INSERT INTO tickets (subject, description, status, priority, requester_id, assignee_id, asset_id) VALUES
  ('VPN connection fails', 'Alice cannot connect to the internal VPN.', 'open', 'high', 1, 3, 1),
  ('File share is unavailable', 'Bob cannot access the finance share.', 'in_progress', 'critical', 2, 3, 2);

INSERT INTO comments (ticket_id, author_id, body) VALUES
  (1, 3, 'Investigating the VPN configuration.'),
  (2, 2, 'The outage started after the last restart.');

INSERT INTO ticket_attachments (ticket_id, uploaded_by_user_id, original_name, storage_path, content_type, size_bytes) VALUES
  (1, 1, 'vpn-error.txt', 'uploads/vpn-error.txt', 'text/plain', 128);
