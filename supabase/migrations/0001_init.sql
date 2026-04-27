-- Source: CONTEXT.md schema (locked) + supabase.com/docs realtime
CREATE TABLE signups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+91',
  city TEXT,
  referrer_id UUID REFERENCES signups(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE squads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id UUID REFERENCES signups(id) NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE squad_members (
  squad_id UUID REFERENCES squads(id) NOT NULL,
  signup_id UUID REFERENCES signups(id) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (squad_id, signup_id)
);

CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'city',
  city TEXT,
  squad_id UUID REFERENCES squads(id),
  youtube_video_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime postgres_changes for tables consumed by the Phase 5 live counter
-- and Phase 3/6 room/squad UIs. Without these lines, postgres_changes subscriptions
-- will silently return zero events. (RESEARCH.md Topic 2)
ALTER PUBLICATION supabase_realtime ADD TABLE signups;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE squad_members;

-- Helpful indexes for hot paths (city aggregates, referrer counts, room lookup)
CREATE INDEX idx_signups_city ON signups(city);
CREATE INDEX idx_signups_country_code ON signups(country_code);
CREATE INDEX idx_signups_referrer ON signups(referrer_id);
CREATE INDEX idx_rooms_city_active ON rooms(city, is_active);
CREATE INDEX idx_rooms_squad ON rooms(squad_id);
