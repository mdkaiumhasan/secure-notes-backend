import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from './config';
import { User } from './models/User';
import { hashPassword } from './utils/password';

/** Creates the first admin. Never exposed over the API - the only way to become admin is this script. */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');
  if (password.length < 10) throw new Error('SEED_ADMIN_PASSWORD must be at least 10 characters');

  await mongoose.connect(config.MONGODB_URI);
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    if (existing.role !== 'admin') { existing.role = 'admin'; await existing.save(); console.log(`Promoted ${email} to admin.`); }
    else console.log(`${email} is already an admin.`);
  } else {
    await User.create({ name: 'Admin', email, passwordHash: await hashPassword(password), role: 'admin' });
    console.log(`Admin created: ${email}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
