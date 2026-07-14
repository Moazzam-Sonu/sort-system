# Shopify Collection Sorter

An internal Shopify tool for safely sorting one or many product collections. It gives non-technical users a clean web interface to preview a new order before it changes Shopify.

> This is a private operational tool, not a public Shopify app. Keep its URL, database, and Admin API credentials limited to trusted staff.
<img width="1366" height="2225" alt="screencapture-127-0-0-1-3000-2026-07-14-20_38_57" src="https://github.com/user-attachments/assets/1bb138fe-eea1-4627-9a80-1703fb878e79" />

## What It Does

- Browse, search, and multi-select Shopify collections.
- Apply Shopify's native sort modes, including best selling, alphabetic, price, and date.
- Build custom multi-rule sorting with range metafields, product data, and custom metafields.
- Preview the resulting product order before applying it.
- Queue bulk changes across multiple collections.
- Save original and target orders in Neon so interrupted bulk jobs can be resumed or restored.
- Protect access with database-backed login sessions.
- Verify final Shopify product order after a reorder completes.

## Demo Video



https://github.com/user-attachments/assets/89d97e11-0e5a-4431-9aec-396db872b457





## Technology

- Node.js 20 and Express
- Shopify Admin GraphQL API
- Neon PostgreSQL for users, sessions, previews, audit data, and bulk-job recovery
- Vanilla JavaScript and SweetAlert2

## Requirements

- Node.js 20 or newer
- A Shopify store and permission to install/configure an app
- A Neon PostgreSQL database
- A Shopify Admin API access token with the required product permissions

## 1. Create A Shopify App

New Shopify apps are created from the [Shopify Dev Dashboard](https://dev.shopify.com/), not from the old Shopify Admin custom-app screen.

1. Open the [Dev Dashboard app creation guide](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard).
2. In **Apps**, select **Create app**.
3. Select **Start from Dev Dashboard**, enter a name such as `Collection Sorter`, and create the app.
4. Open the app's **Versions** section and create a version.
5. In the version configuration, add these Admin API scopes:

```text
read_products
write_products
```

6. Release the version, then open **Home** and install the app on the target Shopify store.

Use only the minimum scopes the tool needs. This application reads products, collections, and product metafields, and changes product/collection sorting through the Admin API.

## 2. Get Admin API Credentials

After the app is installed, use its Admin API credentials to obtain an access token. Shopify's current Dev Dashboard flow provides a **Client ID** and **Client secret**; use Shopify's [access-token guide](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens) to create an Admin API token.

This project currently reads `SHOPIFY_ACCESS_TOKEN` from `.env`. Paste a valid token into that variable.

> **Important:** Tokens generated through the Dev Dashboard client-credentials flow expire after 24 hours. This codebase does not yet refresh those tokens automatically. For an always-on deployment, use an OAuth/token-refresh implementation or securely update `SHOPIFY_ACCESS_TOKEN` before it expires. Never commit a token to Git.

## 3. Create A Neon Database

1. Create a Neon project and database.
2. Copy its pooled PostgreSQL connection string.
3. Keep it private; it contains database credentials.

The application runs its database migrations automatically at startup. Neon stores app users, sessions, one-time preview snapshots, and persisted bulk-job progress.

## 4. Configure Environment Variables

Create `.env` from the example file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Set the values in `.env`:

```env
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_valid_admin_api_access_token
DATABASE_URL=postgresql://user:password@your-neon-pooler-host/neondb?sslmode=require
APP_SESSION_HOURS=12
HOST=127.0.0.1
PORT=3000
NODE_ENV=development
```

| Variable | Description |
| --- | --- |
| `SHOPIFY_STORE` | Your exact `*.myshopify.com` store domain. |
| `SHOPIFY_ACCESS_TOKEN` | Valid Admin API access token. Keep secret. |
| `DATABASE_URL` | Neon pooled PostgreSQL connection string. Keep secret. |
| `APP_SESSION_HOURS` | Login session lifetime in hours. |
| `HOST` | Use `127.0.0.1` locally; use `0.0.0.0` for a deployment host. |
| `PORT` | Local HTTP port. Elastic Beanstalk supplies this automatically. |
| `NODE_ENV` | Use `development` locally and `production` when deployed. |

## 5. Install And Run Locally

```bash
npm install
npm start
```

Open [http://localhost:3000/login](http://localhost:3000/login).

On first startup, the app checks Neon, applies all migrations, and then starts the web server. The health endpoint is available at [http://localhost:3000/health](http://localhost:3000/health).

## 6. Create Login Users

Create each user interactively. Passwords are stored as salted hashes, not plain text.

```bash
npm run users:create -- moazzam
npm run users:create -- rida
npm run users:create -- alina
```

The command asks for a password twice. Usernames must be 3-64 characters and passwords must be at least 12 characters.

## How To Use The Sorter

1. Sign in at `/login`.
2. Select one or more collections. Use **Select all** when needed.
3. Choose a Shopify sort option or build custom rules.
4. For custom rules, select a range metafield or add custom metafields, set ascending/descending order, and optionally add a second rule such as **Best selling**.
5. Generate and inspect the preview.
6. Confirm the action only after the preview is correct.
7. For a bulk job, monitor its progress in the job panel. If a job fails after a partial update, use **Resume** or **Restore original order**.

## Safety Controls

- Every browser action requires an authenticated user session.
- Custom sorting needs a one-time preview token that expires after 10 minutes.
- The collection's product order and sort values are hashed before apply; Shopify changes after preview require a fresh preview.
- Bulk jobs, original order, target order, attempts, and recovery state are persisted in Neon.
- Only one bulk job can run at once.
- Completed manual reorders are read back from Shopify and verified.

## Development Commands

```bash
npm start
npm run db:migrate
npm run users:create -- <username>
npm run lint
npm test
npm run check
```

## Testing

The automated suite covers custom comparison, move-batch generation, mocked Shopify pagination, controller preview/apply guards, and one-time preview-token replay protection.

```bash
npm run check
```

GitHub Actions runs lint and tests for every push and pull request through [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Deploy To Elastic Beanstalk

1. Create a **Node.js 20** Elastic Beanstalk environment.
2. Upload `collection-sorter-elastic-beanstalk.zip` from this project folder.
3. In **Configuration** > **Environment properties**, set:

```text
SHOPIFY_STORE
SHOPIFY_ACCESS_TOKEN
DATABASE_URL
APP_SESSION_HOURS=12
NODE_ENV=production
```

4. Do not set `PORT`; Elastic Beanstalk provides it.
5. The included `Procfile` starts the app with `npm start`.

The deployment ZIP excludes `.env`, `node_modules`, `.git`, and other local secrets. The platform installs dependencies from `package-lock.json`.

Avoid deployments, restarts, or instance replacement while a large bulk sort is running. If a restart occurs, the persisted job can be resumed after its worker lease expires.

## Security Checklist

- Never commit `.env`, access tokens, passwords, or `DATABASE_URL`.
- Limit the deployed URL to trusted staff only.
- Use HTTPS in production.
- Give Shopify only `read_products` and `write_products` unless a new feature requires more.
- Rotate Shopify tokens and database credentials if they are exposed.
- Disable a departed user's access by setting `app_users.is_active` to `false` and revoking their `auth_sessions` rows in Neon.

## Project Structure

```text
public/                  Frontend pages, scripts, styles, and favicon
src/auth/                Password and session handling
src/controllers/         HTTP request handlers
src/database/            Neon client and migrations
src/routes/              Express route definitions
src/services/            Shopify, preview, bulk-job, and recovery services
src/sorting/             Rule validation and custom order logic
test/                    Automated unit, controller, and integration tests
```
