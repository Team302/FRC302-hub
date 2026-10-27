-- When the week-before reminder for a trip went out (routes/trips.js sendTripReminders), so the
-- hourly job sends it once.
ALTER TABLE events ADD COLUMN trip_reminded_at TEXT;
