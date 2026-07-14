import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { createOrUpdateUser } from '../auth/auth-service.js';
import { runMigrations } from './migrations.js';

const username = process.argv[2];
if (!username) {
  throw new Error('Usage: npm run users:create -- <username>');
}

const prompt = readline.createInterface({ input, output });
try {
  const password = await prompt.question(`Password for ${username}: `);
  const confirmPassword = await prompt.question('Confirm password: ');
  if (password !== confirmPassword) throw new Error('Passwords do not match.');
  await runMigrations();
  const user = await createOrUpdateUser({ username, password });
  console.log(`User ${user.username} is ready with ${user.role} access.`);
} finally {
  prompt.close();
}
