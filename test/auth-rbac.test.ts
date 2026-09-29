import './setup';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { hashPassword } from '../src/utils/password';

const HDRS = { 'x-requested-with': 'XMLHttpRequest' };
const agent = () => request.agent(app);

async function registerAndLogin(email: string, password = 'CorrectHorse123') {
  const a = agent();
  await a.post('/api/auth/register').set(HDRS).send({ name: 'Test User', email, password });
  return a;
}

async function makeAdmin(email: string, password = 'AdminPass123456') {
  await User.create({ name: 'Admin', email, passwordHash: await hashPassword(password), role: 'admin' });
  const a = agent();
  await a.post('/api/auth/login').set(HDRS).send({ email, password });
  return a;
}

describe('auth', () => {
  it('registers, sets cookies, and returns the user without the password hash', async () => {
    const res = await agent().post('/api/auth/register').set(HDRS).send({ name: 'Abir', email: 'a@example.com', password: 'CorrectHorse123' });
    expect(res.status).toBe(201);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'].some((c: string) => c.startsWith('access_token='))).toBe(true);
  });

  it('rejects a self-assigned admin role at registration', async () => {
    const res = await agent().post('/api/auth/register').set(HDRS)
      .send({ name: 'Hacker', email: 'h@example.com', password: 'CorrectHorse123', role: 'admin' });
    expect(res.status).toBe(400); // strict schema rejects the unknown "role" field
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await agent().post('/api/auth/register').set(HDRS).send({ name: 'A', email: 'known@example.com', password: 'CorrectHorse123' });
    const wrongPw = await agent().post('/api/auth/login').set(HDRS).send({ email: 'known@example.com', password: 'WrongPassword1' });
    const unknown = await agent().post('/api/auth/login').set(HDRS).send({ email: 'nobody@example.com', password: 'WrongPassword1' });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(unknown.body.error.message);
  });

  it('rejects requests without the anti-CSRF header', async () => {
    const res = await agent().post('/api/auth/login').send({ email: 'a@example.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('blocks all endpoints without a valid session', async () => {
    const res = await request(app).get('/api/notes');
    expect(res.status).toBe(401);
  });
});

describe('notes ownership (IDOR)', () => {
  it("prevents user B from reading, editing or deleting user A's note", async () => {
    const alice = await registerAndLogin('alice@example.com');
    const bob = await registerAndLogin('bob@example.com');
    const created = await alice.post('/api/notes').set(HDRS).send({ title: 'Secret', content: 'shh' });
    const noteId = created.body.note._id;

    expect((await bob.get(`/api/notes/${noteId}`)).status).toBe(404);
    expect((await bob.patch(`/api/notes/${noteId}`).set(HDRS).send({ title: 'pwned' })).status).toBe(404);
    expect((await bob.delete(`/api/notes/${noteId}`).set(HDRS))).toHaveProperty('status', 404);

    const stillThere = await alice.get(`/api/notes/${noteId}`);
    expect(stillThere.body.note.title).toBe('Secret');
  });

  it('only lists notes belonging to the requester', async () => {
    const alice = await registerAndLogin('alice2@example.com');
    const bob = await registerAndLogin('bob2@example.com');
    await alice.post('/api/notes').set(HDRS).send({ title: "Alice's", content: '' });
    const bobList = await bob.get('/api/notes');
    expect(bobList.body.items).toHaveLength(0);
  });
});

describe('role-based access control', () => {
  it('blocks a regular user from admin user-management routes', async () => {
    const bob = await registerAndLogin('bob3@example.com');
    expect((await bob.get('/api/users')).status).toBe(403);
    expect((await bob.get('/api/insight')).status).toBe(403);
  });

  it('lets an admin see every note and manage users', async () => {
    const admin = await makeAdmin('root@example.com');
    const alice = await registerAndLogin('alice3@example.com');
    await alice.post('/api/notes').set(HDRS).send({ title: 'A note', content: '' });

    const all = await admin.get('/api/notes/all');
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThan(0);

    const users = await admin.get('/api/users');
    expect(users.status).toBe(200);
  });

  it('refuses to demote the last remaining admin', async () => {
    const admin = await makeAdmin('onlyadmin@example.com');
    const me = await admin.get('/api/auth/me');
    const res = await admin.patch(`/api/users/${me.body.user._id}`).set(HDRS).send({ role: 'user' });
    expect(res.status).toBe(400);
  });
});

describe('validation', () => {
  it('rejects unknown fields (mass-assignment guard)', async () => {
    const res = await agent().post('/api/auth/register').set(HDRS)
      .send({ name: 'X', email: 'x@example.com', password: 'CorrectHorse123', isAdmin: true });
    expect(res.status).toBe(400);
  });

  it('rejects a NoSQL operator injected as a login field', async () => {
    const res = await agent().post('/api/auth/login').set(HDRS).send({ email: { $gt: '' }, password: 'CorrectHorse123' });
    expect(res.status).toBe(400);
  });
});
