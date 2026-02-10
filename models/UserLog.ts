import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const UserLogEventSchema = new Schema(
  {
    event_name: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const UserLogSchema = new Schema(
  {
    session_id: { type: String, required: true, unique: true, index: true },
    source: { type: String, default: null, index: true },
    events: { type: [UserLogEventSchema], default: [] },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export type UserLogDoc = InferSchemaType<typeof UserLogSchema>;

export const UserLog =
  (mongoose.models.UserLog as mongoose.Model<UserLogDoc>) ||
  mongoose.model<UserLogDoc>('UserLog', UserLogSchema);

