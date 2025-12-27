import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingCart, ChefHat, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';

export default function Index() {
  const { user } = useAuth();

  const stats = [
    { title: 'Produtos', value: '0', icon: Package, color: 'text-primary' },
    { title: 'Pedidos Hoje', value: '0', icon: ShoppingCart, color: 'text-info' },
    { title: 'Em Preparo', value: '0', icon: ChefHat, color: 'text-warning' },
    { title: 'Faturamento', value: 'R$ 0', icon: DollarSign, color: 'text-success' },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Olá, {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário'}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Bem-vindo ao Saleh Digital. Aqui está o resumo do seu restaurante.
          </p>
        </div>

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
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Vendas Recentes
              </CardTitle>
              <CardDescription>Últimos pedidos finalizados</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                Nenhum pedido ainda. Comece adicionando itens ao cardápio!
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Alertas de Estoque
              </CardTitle>
              <CardDescription>Produtos com estoque baixo</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                Nenhum alerta no momento.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}