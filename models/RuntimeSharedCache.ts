import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const RuntimeSharedCacheSchema = new Schema(
  {
    _id: { type: String, required: true },
    scope: { type: String, required: true, trim: true },
    cacheKey: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    freshUntil: { type: Date, required: true },
    staleUntil: { type: Date, required: true },
    expireAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    collection: 'runtime_shared_cache',
    strict: false,
    versionKey: false,
  },
);

RuntimeSharedCacheSchema.index({ scope: 1, cacheKey: 1 }, { unique: true });
RuntimeSharedCacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type RuntimeSharedCacheDoc = InferSchemaType<typeof RuntimeSharedCacheSchema>;

export const RuntimeSharedCache =
  (mongoose.models.RuntimeSharedCache as mongoose.Model<RuntimeSharedCacheDoc>) ||
  mongoose.model<RuntimeSharedCacheDoc>('RuntimeSharedCache', RuntimeSharedCacheSchema);
