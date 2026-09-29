import { Schema, model } from 'mongoose';

const noteSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    content: { type: String, default: '', maxlength: 10000 },
  },
  { timestamps: true, versionKey: false },
);

// Serves: "my notes" list (equality on owner + _id-desc keyset pagination), admin "notes of user X",
// and the cascade delete when a user is removed. Prefix { owner } covers equality-only lookups.
noteSchema.index({ owner: 1, _id: -1 });
// Not needed (default _id index): get note by id, admin "all notes" list.

export const Note = model('Note', noteSchema);
