-- Add webhook URL field to restaurant settings
ALTER TABLE public.restaurant_settings 
ADD COLUMN reservation_webhook_url text;