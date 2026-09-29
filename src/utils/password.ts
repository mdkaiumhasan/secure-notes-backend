import argon2 from 'argon2';

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations, 1 lane).
const opts = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => argon2.hash(plain, opts);

// Verified against when the email is unknown so response time doesn't reveal which emails exist.
let dummy: Promise<string> | undefined;
export async function verifyPassword(hash: string | undefined, plain: string): Promise<boolean> {
  dummy ??= argon2.hash('timing-equalisation-dummy', opts);
  const target = hash ?? (await dummy);
  const ok = await argon2.verify(target, plain).catch(() => false);
  return hash ? ok : false;
}
