# Garapan Dashboard — Supabase Schema

Run this SQL in your Supabase [SQL Editor](https://supabase.com/dashboard/project/_/sql/new):

```sql
-- Garapan table — raw scraped airdrop tasks
CREATE TABLE IF NOT EXISTS garapan (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  text TEXT NOT NULL,
  flags TEXT[] DEFAULT '{}',
  links TEXT[] DEFAULT '{}',
  telegram_url TEXT,
  posted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_garapan_posted_at ON garapan(posted_at DESC);
CREATE INDEX idx_garapan_flags ON garapan USING GIN(flags);

-- Tracked garapan — user bookmarks
CREATE TABLE IF NOT EXISTS tracked (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  garapan_id INTEGER NOT NULL REFERENCES garapan(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  deadline DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, garapan_id)
);

CREATE INDEX idx_tracked_user ON tracked(user_id);

-- Enable RLS
ALTER TABLE garapan ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked ENABLE ROW LEVEL SECURITY;

-- Public can read garapan
CREATE POLICY "Public read garapan" ON garapan FOR SELECT USING (true);

-- Users manage their own tracked items
CREATE POLICY "Users CRUD own tracked" ON tracked
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

## Environment Variables

Set these in Vercel:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_URL` | Same as above (server-side) |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key (for server) |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
