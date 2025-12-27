-- ========================================
-- FASE 1: SALEH DIGITAL - FUNDAÇÃO RBAC
-- ========================================

-- 1. Criar enum para roles do sistema
CREATE TYPE public.app_role AS ENUM (
  'admin',
  'financeiro', 
  'estoque',
  'cozinha',
  'garcom',
  'cliente'
);

-- 2. Tabela de perfis de usuários
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de roles (RBAC seguro)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- 4. Tabela de fornecedores
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabela de insumos/produtos
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL, -- kg, g, un, l, ml
  current_quantity DECIMAL(10,3) DEFAULT 0,
  average_price DECIMAL(10,2) DEFAULT 0,
  last_price DECIMAL(10,2) DEFAULT 0,
  min_quantity DECIMAL(10,3) DEFAULT 0, -- estoque mínimo
  default_supplier_id UUID REFERENCES public.suppliers(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Histórico de compras
CREATE TABLE public.purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  quantity DECIMAL(10,3) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(10,4) GENERATED ALWAYS AS (total_price / NULLIF(quantity, 0)) STORED,
  purchase_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Movimentações de estoque
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  movement_type TEXT NOT NULL, -- 'entrada', 'saida', 'ajuste'
  quantity DECIMAL(10,3) NOT NULL,
  reference_type TEXT, -- 'compra', 'pedido', 'ajuste_manual'
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Tabela de fichas técnicas (receitas)
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  recipe_type TEXT NOT NULL DEFAULT 'prato_final', -- 'prato_final', 'subproduto'
  yield_quantity DECIMAL(10,2) NOT NULL DEFAULT 1, -- rendimento em porções
  yield_unit TEXT DEFAULT 'porção',
  preparation_time INTEGER, -- minutos
  instructions TEXT,
  image_url TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Itens das fichas técnicas
CREATE TABLE public.recipe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id), -- insumo
  subrecipe_id UUID REFERENCES public.recipes(id), -- subproduto
  quantity DECIMAL(10,4) NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT check_ingredient CHECK (
    (product_id IS NOT NULL AND subrecipe_id IS NULL) OR
    (product_id IS NULL AND subrecipe_id IS NOT NULL)
  )
);

-- 10. Cardápio
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL UNIQUE,
  category TEXT NOT NULL, -- 'entrada', 'prato_principal', 'sobremesa', 'bebida'
  sell_price DECIMAL(10,2) NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Pedidos
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  customer_name TEXT,
  customer_phone TEXT,
  table_number TEXT,
  order_type TEXT NOT NULL DEFAULT 'local', -- 'local', 'delivery', 'takeout'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled'
  notes TEXT,
  subtotal DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  waiter_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Itens do pedido
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  menu_item_id UUID REFERENCES public.menu_items(id) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'preparing', 'ready'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Entradas financeiras
CREATE TABLE public.financial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type TEXT NOT NULL, -- 'receita', 'despesa'
  category TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  reference_type TEXT, -- 'pedido', 'compra', 'manual'
  reference_id UUID,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. Logs de auditoria
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- HABILITAR RLS EM TODAS AS TABELAS
-- ========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ========================================
-- FUNÇÃO AUXILIAR PARA VERIFICAR ROLES
-- ========================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Função para verificar se tem qualquer role de staff
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'financeiro', 'estoque', 'cozinha', 'garcom')
  )
$$;

-- Função para obter roles do usuário
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;

-- ========================================
-- POLÍTICAS RLS
-- ========================================

-- PROFILES: Usuários podem ver e editar seu próprio perfil
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin pode ver todos os perfis
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES: Usuários podem ver suas próprias roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Admin pode gerenciar todas as roles
CREATE POLICY "Admin can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- SUPPLIERS: Staff pode ver, admin/estoque pode editar
CREATE POLICY "Staff can view suppliers" ON public.suppliers
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Admin/Estoque can manage suppliers" ON public.suppliers
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'estoque')
  );

-- PRODUCTS: Staff pode ver, admin/estoque pode editar
CREATE POLICY "Staff can view products" ON public.products
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Admin/Estoque can manage products" ON public.products
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'estoque')
  );

-- PURCHASE_HISTORY: Staff pode ver, admin/estoque pode criar
CREATE POLICY "Staff can view purchase history" ON public.purchase_history
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Admin/Estoque can manage purchase history" ON public.purchase_history
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'estoque')
  );

-- STOCK_MOVEMENTS: Staff pode ver
CREATE POLICY "Staff can view stock movements" ON public.stock_movements
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert stock movements" ON public.stock_movements
  FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- RECIPES: Staff pode ver, admin/cozinha pode editar
CREATE POLICY "Staff can view recipes" ON public.recipes
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Admin/Cozinha can manage recipes" ON public.recipes
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'cozinha')
  );

-- RECIPE_ITEMS
CREATE POLICY "Staff can view recipe items" ON public.recipe_items
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Admin/Cozinha can manage recipe items" ON public.recipe_items
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'cozinha')
  );

-- MENU_ITEMS: Todos podem ver (cardápio público)
CREATE POLICY "Anyone can view menu" ON public.menu_items
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage menu" ON public.menu_items
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ORDERS: Staff pode ver e gerenciar, cliente pode ver seus próprios
CREATE POLICY "Staff can view all orders" ON public.orders
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage orders" ON public.orders
  FOR ALL USING (public.is_staff(auth.uid()));

CREATE POLICY "Anyone can create orders" ON public.orders
  FOR INSERT WITH CHECK (true);

-- ORDER_ITEMS
CREATE POLICY "Staff can view order items" ON public.order_items
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage order items" ON public.order_items
  FOR ALL USING (public.is_staff(auth.uid()));

CREATE POLICY "Anyone can insert order items" ON public.order_items
  FOR INSERT WITH CHECK (true);

-- FINANCIAL_ENTRIES: Admin/Financeiro
CREATE POLICY "Admin/Financeiro can view financial" ON public.financial_entries
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'financeiro')
  );

CREATE POLICY "Admin/Financeiro can manage financial" ON public.financial_entries
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'financeiro')
  );

-- AUDIT_LOGS: Apenas admin
CREATE POLICY "Admin can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- ========================================
-- TRIGGERS PARA ATUALIZAÇÃO AUTOMÁTICA
-- ========================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- TRIGGER PARA CRIAR PERFIL AUTOMATICAMENTE
-- ========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  -- Atribuir role 'cliente' por padrão
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'cliente');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- TRIGGER PARA ATUALIZAR ESTOQUE APÓS COMPRA
-- ========================================

CREATE OR REPLACE FUNCTION public.update_stock_after_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_qty DECIMAL(10,3);
  current_avg DECIMAL(10,2);
  new_avg DECIMAL(10,2);
BEGIN
  -- Obter quantidade e preço médio atuais
  SELECT current_quantity, average_price 
  INTO current_qty, current_avg
  FROM public.products 
  WHERE id = NEW.product_id;
  
  -- Calcular novo preço médio ponderado
  IF current_qty + NEW.quantity > 0 THEN
    new_avg := ((current_qty * current_avg) + NEW.total_price) / (current_qty + NEW.quantity);
  ELSE
    new_avg := NEW.unit_price;
  END IF;
  
  -- Atualizar produto
  UPDATE public.products
  SET 
    current_quantity = current_quantity + NEW.quantity,
    average_price = new_avg,
    last_price = NEW.unit_price
  WHERE id = NEW.product_id;
  
  -- Registrar movimentação
  INSERT INTO public.stock_movements (
    product_id, movement_type, quantity, reference_type, reference_id, created_by
  ) VALUES (
    NEW.product_id, 'entrada', NEW.quantity, 'compra', NEW.id, NEW.created_by
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_purchase_insert
  AFTER INSERT ON public.purchase_history
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_after_purchase();

-- ========================================
-- HABILITAR REALTIME
-- ========================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;