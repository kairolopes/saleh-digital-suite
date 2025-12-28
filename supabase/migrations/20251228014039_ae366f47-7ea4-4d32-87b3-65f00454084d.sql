-- Create restaurant settings table
CREATE TABLE public.restaurant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Meu Restaurante',
  logo_url text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  cnpj text,
  description text,
  primary_color text DEFAULT '#ea580c',
  
  -- Operating hours (JSON format for flexibility)
  operating_hours jsonb DEFAULT '{
    "monday": {"open": "08:00", "close": "22:00", "closed": false},
    "tuesday": {"open": "08:00", "close": "22:00", "closed": false},
    "wednesday": {"open": "08:00", "close": "22:00", "closed": false},
    "thursday": {"open": "08:00", "close": "22:00", "closed": false},
    "friday": {"open": "08:00", "close": "23:00", "closed": false},
    "saturday": {"open": "08:00", "close": "23:00", "closed": false},
    "sunday": {"open": "08:00", "close": "22:00", "closed": false}
  }'::jsonb,
  
  -- Additional settings
  accept_reservations boolean DEFAULT true,
  max_tables integer DEFAULT 20,
  default_order_type text DEFAULT 'local',
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;

-- Admin can manage settings
CREATE POLICY "Admin can manage restaurant settings"
ON public.restaurant_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Staff can view settings
CREATE POLICY "Staff can view restaurant settings"
ON public.restaurant_settings
FOR SELECT
USING (is_staff(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_restaurant_settings_updated_at
BEFORE UPDATE ON public.restaurant_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.restaurant_settings (name) VALUES ('Meu Restaurante');