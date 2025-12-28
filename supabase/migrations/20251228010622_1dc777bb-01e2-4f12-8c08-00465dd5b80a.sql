-- Tabela de notificações
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB,
  target_roles TEXT[] DEFAULT '{}',
  target_user_id UUID,
  is_read BOOLEAN DEFAULT false,
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de reclamações
CREATE TABLE public.complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID,
  order_number INTEGER,
  table_number TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  type TEXT NOT NULL DEFAULT 'other',
  message TEXT NOT NULL,
  urgency TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  response TEXT,
  responded_by UUID,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de sugestões
CREATE TABLE public.suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone TEXT,
  customer_name TEXT,
  table_number TEXT,
  type TEXT DEFAULT 'other',
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  response TEXT,
  responded_by UUID,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de avaliações
CREATE TABLE public.ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID,
  order_number INTEGER,
  customer_phone TEXT,
  customer_name TEXT,
  food_rating INTEGER CHECK (food_rating >= 1 AND food_rating <= 5),
  service_rating INTEGER CHECK (service_rating >= 1 AND service_rating <= 5),
  ambiance_rating INTEGER CHECK (ambiance_rating >= 1 AND ambiance_rating <= 5),
  overall_rating INTEGER NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de perguntas de clientes
CREATE TABLE public.customer_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone TEXT,
  customer_name TEXT,
  table_number TEXT,
  order_id UUID,
  category TEXT DEFAULT 'other',
  question TEXT NOT NULL,
  answer TEXT,
  answered_by UUID,
  answered_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_questions ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Staff can view notifications for their roles" ON public.notifications
  FOR SELECT USING (
    is_staff(auth.uid()) OR 
    target_user_id = auth.uid()
  );

CREATE POLICY "Staff can update notifications" ON public.notifications
  FOR UPDATE USING (is_staff(auth.uid()));

CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- RLS policies for complaints
CREATE POLICY "Admin can manage complaints" ON public.complaints
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view complaints" ON public.complaints
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "System can insert complaints" ON public.complaints
  FOR INSERT WITH CHECK (true);

-- RLS policies for suggestions
CREATE POLICY "Admin can manage suggestions" ON public.suggestions
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view suggestions" ON public.suggestions
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "System can insert suggestions" ON public.suggestions
  FOR INSERT WITH CHECK (true);

-- RLS policies for ratings
CREATE POLICY "Admin can manage ratings" ON public.ratings
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view ratings" ON public.ratings
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "System can insert ratings" ON public.ratings
  FOR INSERT WITH CHECK (true);

-- RLS policies for customer_questions
CREATE POLICY "Staff can manage customer questions" ON public.customer_questions
  FOR ALL USING (is_staff(auth.uid()));

CREATE POLICY "System can insert customer questions" ON public.customer_questions
  FOR INSERT WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;