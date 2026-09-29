import { Schema, model, type InferSchemaType } from 'mongoose';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user' },
    interests: { type: [String], default: [] },
    // Bumped on logout-all / password change / role change to invalidate every issued token.
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true, versionKey: false },
);

// Serves: login lookup, duplicate-email check (unique).
userSchema.index({ email: 1 }, { unique: true });
// Serves: Scenario 1 aggregation ($match on interests). Multikey.
userSchema.index({ interests: 1 });
// Not needed (default _id index): get profile by id, admin user list (sorted by _id desc, cursor on _id).

// Safety net: secrets can never be serialised even if a query forgets to exclude them.
userSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    return ret;
  },
});

export type UserAttrs = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
