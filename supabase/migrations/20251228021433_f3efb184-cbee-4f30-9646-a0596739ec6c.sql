-- Add column to track if reminder was sent
ALTER TABLE public.reservations 
ADD COLUMN reminder_sent_at timestamp with time zone DEFAULT NULL;