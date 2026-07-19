# IT Helpdesk v1: Security Lab

This is a deliberately vulnerable IT helpdesk application for cybersecurity practice. Use it only with a dedicated PostgreSQL database containing no real or shared data.

Do not publish this application, expose it to the internet, or connect it to a production database.

## Quick Start

Run these commands from the `v1-inseguro` directory after completing the PostgreSQL setup below:

```powershell
npm install
npm run db:setup
npm start
```

Open `http://localhost:3017` in your browser.

## Requirements

- Node.js 22 or newer
- npm
- Access to a PostgreSQL server
- pgAdmin or another PostgreSQL client to create an empty database

## 1. Create a Dedicated Database

Create an empty database only for this lab. In pgAdmin, connect to your PostgreSQL server, open the Query Tool, and run:

```sql
CREATE DATABASE helpdesk_v1_lab;
```

Do not reuse a database from another project. The setup command adds tables and sample users to the database selected in `DATABASE_URL`.

## 2. Configure the Connection

From `v1-inseguro`, copy the template:

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace the connection values with your own PostgreSQL server details:

```dotenv
NODE_ENV=development
PORT=3017
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/helpdesk_v1_lab
JWT_SECRET=replace-with-a-local-lab-secret
```

Keep `.env` private. It is excluded from Git and must never contain a shared or production database URL. If the password contains URL-reserved characters such as `@`, `:`, `/`, or `#`, encode it in the connection URL.

## 3. Install Dependencies

```powershell
npm install
```

## 4. Initialize the Database

```powershell
npm run db:setup
```

This command runs `src/db/schema.sql` and then `src/db/seed.sql` in one transaction. Run it only once on a new empty lab database. It does not erase or overwrite an existing database.

v1 does not use versioned migrations. Its database initialization is intentionally simple so students can inspect the schema and seed files directly.

## 5. Run the Application

```powershell
npm start
```

Visit `http://localhost:3017`. Stop the server with `Ctrl+C`.

## Sample Accounts

| Username | Password | Role |
| --- | --- | --- |
| `alice` | `alice-password` | User |
| `bob` | `bob-password` | User |
| `dana.agent` | `agent-password` | Agent |
| `ada.admin` | `admin-password` | Admin |

These passwords are intentionally insecure and must only exist in the lab database.

## Run Tests

```powershell
npm test
npm run test:coverage
```

## Lab Scope

This v1 application intentionally contains vulnerabilities for coursework. The catalog, affected routes, and safe lab constraints are documented in [VULNERABILITIES.md](VULNERABILITIES.md).

`JWT_EXPIRES_IN` is not used in v1 on purpose: the lab demonstrates non-expiring JWTs. The secure v2 is the place to implement expiration and other mitigations.
