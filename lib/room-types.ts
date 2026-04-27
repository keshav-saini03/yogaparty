// Realtime event payloads. Channel name: `room:{roomId}` (C-005).

export type SyncPlay = {
  type: 'sync_play';
  timestamp: number;
};

export type SyncPause = {
  type: 'sync_pause';
  timestamp: number;
};

export type SyncSeek = {
  type: 'sync_seek';
  timestamp: number;
};

export type Heartbeat = {
  type: 'heartbeat';
  user_id: string;
  currentTime: number;
  sentAt: number;
};

export type SyncCorrect = {
  type: 'sync_correct';
  target_user_id: string;
  timestamp: number;
};

export type ChatMsg = {
  type: 'chat';
  user_id: string;
  user: string;
  text: string;
  timestamp: number;
};

export type Reaction = {
  type: 'reaction';
  user: string;
  emoji: string;
};

export type VideoChange = {
  type: 'video_change';
  videoId: string;
  timestamp: number;
};

export type SyncEvent =
  | SyncPlay
  | SyncPause
  | SyncSeek
  | Heartbeat
  | SyncCorrect
  | ChatMsg
  | Reaction
  | VideoChange;

export type Room = {
  id: string;
  type: 'city' | 'squad';
  city: string | null;
  squad_id: string | null;
  youtube_video_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type SignupRow = {
  id: string;
  name: string;
  phone: string;
  country_code: string;
  city: string | null;
  referrer_id: string | null;
  created_at: string;
};
