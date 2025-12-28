-- Add reminder hour configuration to restaurant settings
ALTER TABLE public.restaurant_settings 
ADD COLUMN reminder_hour integer DEFAULT 10;