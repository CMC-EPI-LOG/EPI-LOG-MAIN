import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const SessionSummarySchema = new Schema(
  {
    session_id: { type: String, required: true, unique: true, index: true },
    source: { type: String, default: null, index: true },
    shared_by: { type: String, default: null, index: true },
    entry_source: { type: String, default: 'unknown', index: true },
    deployment_id: { type: String, default: null, index: true },
    toss_app_version: { type: String, default: null, index: true },
    first_client_ts: { type: Date, index: true },
    last_client_ts: { type: Date, index: true },
    first_server_ts: { type: Date, index: true },
    last_server_ts: { type: Date, index: true },
    last_event_name: { type: String, default: null },
    event_count: { type: Number, default: 0 },
    dropped_event_count: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export type SessionSummaryDoc = InferSchemaType<typeof SessionSummarySchema>;

export const SessionSummary =
  (mongoose.models.SessionSummary as mongoose.Model<SessionSummaryDoc>) ||
  mongoose.model<SessionSummaryDoc>('SessionSummary', SessionSummarySchema);
