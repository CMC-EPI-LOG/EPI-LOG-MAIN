import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const EventLogSchema = new Schema(
  {
    event_id: { type: String, required: true, unique: true, index: true },
    schema_version: { type: String, required: true, index: true },
    event_name: { type: String, required: true, index: true },
    session_id: { type: String, required: true, index: true },
    client_ts: { type: Date, required: true, index: true },
    server_ts: { type: Date, required: true, index: true },
    entry_source: { type: String, default: 'unknown', index: true },
    deployment_id: { type: String, default: null, index: true },
    toss_app_version: { type: String, default: null, index: true },
    route: { type: String, default: '/', index: true },
    source: { type: String, default: null, index: true },
    shared_by: { type: String, default: null, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    request_id: { type: String, index: true },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export type EventLogDoc = InferSchemaType<typeof EventLogSchema>;

export const EventLog =
  (mongoose.models.EventLog as mongoose.Model<EventLogDoc>) ||
  mongoose.model<EventLogDoc>('EventLog', EventLogSchema);
