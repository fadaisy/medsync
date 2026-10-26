-- 0187 — Voice notes as wav (Tide v1, ADR 0346).
--
-- A development or release build records a voice note with the on-device speech recogniser, which keeps the
-- sound as a wav file. 0186's bucket did not take wav. This adds audio/wav and audio/x-wav to its list and
-- changes nothing else.
--
-- ADDITIVE and re-runnable. Owner-applied after 0186 (`npm run db:migrate -- 0187`).
-- Reverse: set allowed_mime_types back to 0186's list.

UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT array_agg(DISTINCT m ORDER BY m)
  FROM unnest(allowed_mime_types || ARRAY['audio/wav', 'audio/x-wav']) AS m
)
WHERE id = 'appointment-attachments';
