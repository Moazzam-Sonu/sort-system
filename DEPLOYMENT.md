# Deployment

This app makes Shopify Admin API changes. Do not deploy it as a public website.

Use a single always-on Node.js service that supports long-running requests. Serverless platforms are not suitable because bulk job progress currently lives in memory.

## Required environment variables

```env
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_admin_api_token
DATABASE_URL=postgresql://user:password@your-endpoint-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require
APP_SESSION_HOURS=12
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
```

After the first deployment, create each user's database account without putting the password in an environment variable:

```bash
npm run users:create -- owner
npm run users:create -- staff
```

The command prompts for the password and stores only a salted `scrypt` hash in Neon. To revoke access, set `is_active` to `false` for that user in the `app_users` table and revoke their records in `auth_sessions`.

## Start command

```bash
npm start
```

## Elastic Beanstalk

1. In Elastic Beanstalk, create a **Node.js 20** environment with one instance.
2. Upload `collection-sorter-elastic-beanstalk.zip` from this project folder.
3. Add `SHOPIFY_STORE`, `SHOPIFY_ACCESS_TOKEN`, `DATABASE_URL`, `APP_SESSION_HOURS=12`, and `NODE_ENV=production` in **Configuration > Updates, monitoring, and logging > Environment properties**.
4. Do not add `PORT`; Elastic Beanstalk supplies it automatically. The app now listens on `0.0.0.0` by default.

The ZIP deliberately excludes `.env`, `node_modules`, and `.git`. Elastic Beanstalk installs dependencies from `package-lock.json` during deployment.

The app runs database migrations automatically on startup. To run them manually, use `npm run db:migrate`.

## Operational limits

- Run exactly one application instance. Multiple instances do not share bulk-job state.
- Do not enable automatic sleeping or restarts while a batch sort is running.
- Use HTTPS from your hosting provider. The session cookie is marked `Secure` when `NODE_ENV=production`.
- User sessions are opaque random tokens; Neon stores only their SHA-256 hashes.
