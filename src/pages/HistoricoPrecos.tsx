import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign } from 'lucide-react';

export default function HistoricoPrecos() {
  const [selectedProduct, setSelectedProduct] = useState<string>('');

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: priceHistory, isLoading } = useQuery({
    queryKey: ['price-history', selectedProduct],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const { data, error } = await supabase
        .from('purchase_history')
        .select(`*, suppliers(name)`)
        .eq('product_id', selectedProduct)
        .order('purchase_date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProduct,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const selectedProductData = products?.find(p => p.id === selectedProduct);

  // Calcular estatísticas
  const stats = priceHistory && priceHistory.length > 0 ? (() => {
    const prices = priceHistory.map(p => Number(p.unit_price));
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const lastPrice = prices[prices.length - 1];
    const prevPrice = prices.length > 1 ? prices[prices.length - 2] : lastPrice;
    const priceChange = lastPrice - prevPrice;
    const priceChangePercent = prevPrice > 0 ? (priceChange / prevPrice) * 100 : 0;

    // Média móvel (últimas 4 compras)
    const last4 = prices.slice(-4);
    const movingAvg = last4.reduce((a, b) => a + b, 0) / last4.length;

    // Melhor momento para comprar (mês com menor preço médio)
    const monthPrices: { [key: string]: number[] } = {};
    priceHistory.forEach(p => {
      const month = format(new Date(p.purchase_date), 'MMMM', { locale: ptBR });
      if (!monthPrices[month]) monthPrices[month] = [];
      monthPrices[month].push(Number(p.unit_price));
    });
    
    let bestMonth = '';
    let bestMonthAvg = Infinity;
    Object.entries(monthPrices).forEach(([month, prices]) => {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      if (avg < bestMonthAvg) {
        bestMonthAvg = avg;
        bestMonth = month;
      }
    });

    // Fornecedor mais barato
    const supplierPrices: { [key: string]: number[] } = {};
    priceHistory.forEach(p => {
      const supplier = p.suppliers?.name || 'Sem fornecedor';
      if (!supplierPrices[supplier]) supplierPrices[supplier] = [];
      supplierPrices[supplier].push(Number(p.unit_price));
    });
    
    let cheapestSupplier = '';
    let cheapestSupplierAvg = Infinity;
    Object.entries(supplierPrices).forEach(([supplier, prices]) => {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      if (avg < cheapestSupplierAvg) {
        cheapestSupplierAvg = avg;
        cheapestSupplier = supplier;
      }
    });

    return {
      avgPrice,
      minPrice,
      maxPrice,
      lastPrice,
      priceChange,
      priceChangePercent,
      movingAvg,
      bestMonth,
      cheapestSupplier,
      cheapestSupplierAvg,
      isAboveAverage: lastPrice > avgPrice,
    };
  })() : null;

  // Dados para o gráfico
  const chartData = priceHistory?.map(p => ({
    date: format(new Date(p.purchase_date), 'dd/MM', { locale: ptBR }),
    fullDate: format(new Date(p.purchase_date), 'dd/MM/yyyy', { locale: ptBR }),
    price: Number(p.unit_price),
    quantity: Number(p.quantity),
    supplier: p.suppliers?.name || 'N/A',
  })) || [];

  return (
    <AppLayout requiredRoles={['admin', 'estoque', 'financeiro']}>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Histórico de Preços</h1>
          <p className="text-muted-foreground">Análise de evolução de preços e inteligência de compras</p>
        </div>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>Selecione um Produto</CardTitle>
            <CardDescription>Escolha o insumo para ver o histórico de preços</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {products?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedProduct && (
          <>
            {stats && (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <Card className="border-0 shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Último Preço</CardTitle>
                      {stats.priceChange >= 0 ? (
                        <TrendingUp className="h-5 w-5 text-destructive" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-success" />
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(stats.lastPrice)}</div>
                      <p className={`text-xs ${stats.priceChange >= 0 ? 'text-destructive' : 'text-success'}`}>
                        {stats.priceChange >= 0 ? '+' : ''}{stats.priceChangePercent.toFixed(1)}% vs anterior
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Preço Médio</CardTitle>
                      <DollarSign className="h-5 w-5 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(stats.avgPrice)}</div>
                      <p className="text-xs text-muted-foreground">
                        Média móvel: {formatCurrency(stats.movingAvg)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Menor Preço</CardTitle>
                      <TrendingDown className="h-5 w-5 text-success" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(stats.minPrice)}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Maior Preço</CardTitle>
                      <TrendingUp className="h-5 w-5 text-destructive" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(stats.maxPrice)}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Alertas e Sugestões */}
                <Card className="border-0 shadow-md border-l-4 border-l-warning">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      Inteligência de Compras
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stats.isAboveAverage && (
                      <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
                        <Badge variant="destructive">Alerta</Badge>
                        <span>Último preço está <strong>acima da média</strong>. Considere negociar ou buscar alternativas.</span>
                      </div>
                    )}
                    {stats.bestMonth && (
                      <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg">
                        <Badge className="bg-success">Dica</Badge>
                        <span>Melhor período para comprar: <strong>{stats.bestMonth}</strong> (menor preço médio histórico)</span>
                      </div>
                    )}
                    {stats.cheapestSupplier && (
                      <div className="flex items-center gap-2 p-3 bg-info/10 rounded-lg">
                        <Badge className="bg-info">Fornecedor</Badge>
                        <span>
                          <strong>{stats.cheapestSupplier}</strong> oferece o melhor preço médio: {formatCurrency(stats.cheapestSupplierAvg)}/{selectedProductData?.unit}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Gráfico de Evolução */}
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Evolução de Preços</CardTitle>
                <CardDescription>Histórico de preços ao longo do tempo</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Carregando...</p>
                ) : chartData.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Nenhum histórico de compras para este produto.</p>
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12}
                          tickFormatter={(v) => `R$${v.toFixed(2)}`}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [formatCurrency(value), 'Preço']}
                          labelFormatter={(label) => `Data: ${label}`}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="price" 
                          stroke="hsl(var(--primary))" 
                          fillOpacity={1} 
                          fill="url(#colorPrice)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabela de Histórico */}
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Detalhes das Compras</CardTitle>
                <CardDescription>Histórico completo de compras deste produto</CardDescription>
              </CardHeader>
              <CardContent>
                {priceHistory?.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Nenhuma compra registrada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Quantidade</TableHead>
                          <TableHead>Valor Total</TableHead>
                          <TableHead>Preço Unitário</TableHead>
                          <TableHead>Fornecedor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {priceHistory?.slice().reverse().map((purchase) => (
                          <TableRow key={purchase.id}>
                            <TableCell>
                              {format(new Date(purchase.purchase_date), 'dd/MM/yyyy', { locale: ptBR })}
                            </TableCell>
                            <TableCell>
                              {Number(purchase.quantity).toFixed(3)} {selectedProductData?.unit}
                            </TableCell>
                            <TableCell>{formatCurrency(Number(purchase.total_price))}</TableCell>
                            <TableCell>
                              <span className={
                                stats && Number(purchase.unit_price) > stats.avgPrice 
                                  ? 'text-destructive font-medium' 
                                  : 'text-success font-medium'
                              }>
                                {formatCurrency(Number(purchase.unit_price))}/{selectedProductData?.unit}
                              </span>
                            </TableCell>
                            <TableCell>{purchase.suppliers?.name || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}