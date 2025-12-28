import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingCart, ChefHat, DollarSign, TrendingUp, AlertTriangle, Users, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--info))', 'hsl(var(--warning))', 'hsl(var(--success))', 'hsl(var(--destructive))'];

export default function Index() {
  const { user } = useAuth();

  // Buscar estatísticas de produtos
  const { data: productsStats } = useQuery({
    queryKey: ['dashboard-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, current_quantity, min_quantity, average_price')
        .eq('is_active', true);
      if (error) throw error;
      
      const lowStock = data?.filter(p => (p.current_quantity || 0) <= (p.min_quantity || 0)) || [];
      const totalValue = data?.reduce((acc, p) => acc + ((p.current_quantity || 0) * (p.average_price || 0)), 0) || 0;
      
      return {
        total: data?.length || 0,
        lowStock: lowStock.length,
        totalValue
      };
    }
  });

  // Buscar pedidos do dia
  const { data: ordersToday } = useQuery({
    queryKey: ['dashboard-orders-today'],
    queryFn: async () => {
      const today = new Date();
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total, created_at')
        .gte('created_at', startOfDay(today).toISOString())
        .lte('created_at', endOfDay(today).toISOString());
      if (error) throw error;
      
      const pending = data?.filter(o => o.status === 'pending').length || 0;
      const preparing = data?.filter(o => o.status === 'preparing' || o.status === 'confirmed').length || 0;
      const completed = data?.filter(o => o.status === 'delivered').length || 0;
      const totalRevenue = data?.filter(o => o.status === 'delivered').reduce((acc, o) => acc + (o.total || 0), 0) || 0;
      
      return {
        total: data?.length || 0,
        pending,
        preparing,
        completed,
        totalRevenue
      };
    }
  });

  // Buscar vendas dos últimos 7 dias
  const { data: salesData } = useQuery({
    queryKey: ['dashboard-sales-week'],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const { data, error } = await supabase
          .from('orders')
          .select('total')
          .eq('status', 'delivered')
          .gte('created_at', startOfDay(date).toISOString())
          .lte('created_at', endOfDay(date).toISOString());
        
        if (error) throw error;
        
        const total = data?.reduce((acc, o) => acc + (o.total || 0), 0) || 0;
        days.push({
          day: format(date, 'EEE', { locale: ptBR }),
          vendas: total
        });
      }
      return days;
    }
  });

  // Buscar produtos com estoque baixo
  const { data: lowStockProducts } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, current_quantity, min_quantity, unit')
        .eq('is_active', true);
      if (error) throw error;
      
      return data?.filter(p => (p.current_quantity || 0) <= (p.min_quantity || 0)).slice(0, 5) || [];
    }
  });

  // Buscar pedidos recentes
  const { data: recentOrders } = useQuery({
    queryKey: ['dashboard-recent-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total, status, created_at, table_number, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    }
  });

  // Buscar vendas por categoria
  const { data: salesByCategory } = useQuery({
    queryKey: ['dashboard-sales-category'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          total_price,
          menu_items:menu_item_id (
            category
          )
        `);
      if (error) throw error;
      
      const categoryTotals: Record<string, number> = {};
      data?.forEach((item: any) => {
        const category = item.menu_items?.category || 'Outros';
        categoryTotals[category] = (categoryTotals[category] || 0) + (item.total_price || 0);
      });
      
      return Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));
    }
  });

  // Buscar compras (custos) dos últimos 7 dias
  const { data: costsData } = useQuery({
    queryKey: ['dashboard-costs-week'],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const { data, error } = await supabase
          .from('purchase_history')
          .select('total_price')
          .gte('purchase_date', format(date, 'yyyy-MM-dd'))
          .lte('purchase_date', format(date, 'yyyy-MM-dd'));
        
        if (error) throw error;
        
        const total = data?.reduce((acc, p) => acc + (p.total_price || 0), 0) || 0;
        days.push({
          day: format(date, 'EEE', { locale: ptBR }),
          custos: total
        });
      }
      return days;
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const stats = [
    { title: 'Produtos', value: productsStats?.total || 0, icon: Package, color: 'text-primary', subtitle: `${productsStats?.lowStock || 0} com estoque baixo` },
    { title: 'Pedidos Hoje', value: ordersToday?.total || 0, icon: ShoppingCart, color: 'text-info', subtitle: `${ordersToday?.preparing || 0} em preparo` },
    { title: 'Em Preparo', value: ordersToday?.preparing || 0, icon: ChefHat, color: 'text-warning', subtitle: `${ordersToday?.pending || 0} pendentes` },
    { title: 'Faturamento Hoje', value: formatCurrency(ordersToday?.totalRevenue || 0), icon: DollarSign, color: 'text-success', subtitle: `${ordersToday?.completed || 0} pedidos` },
  ];

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
    confirmed: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800' },
    preparing: { label: 'Preparando', color: 'bg-purple-100 text-purple-800' },
    ready: { label: 'Pronto', color: 'bg-green-100 text-green-800' },
    delivered: { label: 'Entregue', color: 'bg-gray-100 text-gray-800' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' }
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Olá, {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário'}! Aqui está o resumo do seu restaurante.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Vendas - Gráfico de Área */}
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Vendas (Últimos 7 dias)
              </CardTitle>
              <CardDescription>Faturamento diário do restaurante</CardDescription>
            </CardHeader>
            <CardContent>
              {salesData && salesData.some(d => d.vendas > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis tickFormatter={(v) => `R$${v}`} className="text-xs" />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), 'Vendas']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="vendas" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary) / 0.2)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-16">
                  Nenhuma venda registrada ainda.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Custos - Gráfico de Barras */}
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-destructive" />
                Custos (Últimos 7 dias)
              </CardTitle>
              <CardDescription>Compras e despesas diárias</CardDescription>
            </CardHeader>
            <CardContent>
              {costsData && costsData.some(d => d.custos > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={costsData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis tickFormatter={(v) => `R$${v}`} className="text-xs" />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), 'Custos']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="custos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-16">
                  Nenhuma compra registrada ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Second Row */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Vendas por Categoria */}
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-info" />
                Vendas por Categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesByCategory && salesByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={salesByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {salesByCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-12">
                  Sem dados de vendas.
                </p>
              )}
              {salesByCategory && salesByCategory.length > 0 && (
                <div className="mt-4 space-y-2">
                  {salesByCategory.map((cat, i) => (
                    <div key={cat.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span>{cat.name}</span>
                      </div>
                      <span className="font-medium">{formatCurrency(cat.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pedidos Recentes */}
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Pedidos Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentOrders && recentOrders.length > 0 ? (
                <div className="space-y-3">
                  {recentOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">#{order.order_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.table_number ? `Mesa ${order.table_number}` : order.customer_name || 'Cliente'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(order.total || 0)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusLabels[order.status]?.color || ''}`}>
                          {statusLabels[order.status]?.label || order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-12">
                  Nenhum pedido ainda.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Alertas de Estoque */}
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Alertas de Estoque
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowStockProducts && lowStockProducts.length > 0 ? (
                <div className="space-y-3">
                  {lowStockProducts.map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-2 rounded-lg bg-destructive/10">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Mín: {product.min_quantity} {product.unit}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-destructive">
                          {product.current_quantity} {product.unit}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-12">
                  Nenhum alerta no momento.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-md bg-gradient-to-br from-primary/10 to-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valor em Estoque
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {formatCurrency(productsStats?.totalValue || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {productsStats?.total || 0} produtos ativos
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-gradient-to-br from-success/10 to-success/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pedidos Concluídos Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">
                {ordersToday?.completed || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                de {ordersToday?.total || 0} pedidos no total
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-gradient-to-br from-warning/10 to-warning/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Produtos em Alerta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-warning">
                {productsStats?.lowStock || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                precisam de reposição
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
