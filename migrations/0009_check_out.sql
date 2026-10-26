-- Check-in and check-out times, so hours count when each person was actually there instead of
-- the whole meeting. Marks set by whoever runs the meeting have neither and count the meeting.
ALTER TABLE attendance ADD COLUMN checked_in_at TEXT;
ALTER TABLE attendance ADD COLUMN checked_out_at TEXT;
UPDATE attendance SET checked_in_at = recorded_at WHERE via IS NOT NULL;
