import { Schema, model } from 'mongoose';

const postSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 5000 },
  },
  { timestamps: true, versionKey: false },
);

// Serves: Scenario 2 ($lookup foreignField), per-user posts sorted newest-first with limit, cascade delete.
postSchema.index({ author: 1, _id: -1 });
// Not needed (default _id index): public feed (sorted by _id desc), delete/get by id.

export const Post = model('Post', postSchema);
