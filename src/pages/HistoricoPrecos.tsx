import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Minus } from 'lucide-react';

const normalizeAnchor = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\s*(ml|l|kg|g|cm|m|un|lt|lts|mg)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseLocalDate = (d: string) => new Date(`${d}T12:00:00`);

const brandColors = [
  '#e07b20', '#3b82f6', '#10b981', '#ef4444',
  '#8b5cf6', '#f59e0b', '#06b6d4', '#db2777', '#65a30d',
];

export default function HistoricoPrecos() {
  const [selectedGroup, setSelectedGroup] = useState<string>('');

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

  // Agrupar produtos por nome-base + unidade (cada marca é um registro separado)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; unit: string; ids: string[] }>();
    (products || []).forEach(p => {
      const key = `${normalizeAnchor(p.name)}|${p.unit}`;
      if (!map.has(key)) {
        map.set(key, { key, label: p.name, unit: p.unit, ids: [] });
      }
      map.get(key)!.ids.push(p.id);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [products]);

  const currentGroup = groups.find(g => g.key === selectedGroup);
  const productBrandById = useMemo(() => {
    const m: Record<string, string | null> = {};
    (products || []).forEach(p => { m[p.id] = (p as any).brand ?? null; });
    return m;
  }, [products]);

  const { data: priceHistory, isLoading } = useQuery({
    queryKey: ['price-history-group', selectedGroup, currentGroup?.ids],
    queryFn: async () => {
      if (!currentGroup) return [];
      const { data, error } = await supabase
        .from('purchase_history')
        .select(`*, suppliers(name)`)
        .in('product_id', currentGroup.ids)
        .order('purchase_date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!currentGroup,
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const rows = useMemo(() => (priceHistory || []).map(p => ({
    ...p,
    brandLabel: (p as any).brand || productBrandById[p.product_id] || 'Sem Marca',
    price: Number(p.unit_price),
  })), [priceHistory, productBrandById]);

  const unit = currentGroup?.unit || '';

  // Estatísticas gerais
  const stats = rows.length > 0 ? (() => {
    const prices = rows.map(r => r.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const lastPrice = prices[prices.length - 1];
    const prevPrice = prices.length > 1 ? prices[prices.length - 2] : lastPrice;
    const priceChange = lastPrice - prevPrice;
    const priceChangePercent = prevPrice > 0 ? (priceChange / prevPrice) * 100 : 0;
    const last4 = prices.slice(-4);
    const movingAvg = last4.reduce((a, b) => a + b, 0) / last4.length;

    const monthPrices: Record<string, number[]> = {};
    rows.forEach(r => {
      const month = format(parseLocalDate(r.purchase_date), 'MMMM', { locale: ptBR });
      (monthPrices[month] ||= []).push(r.price);
    });
    let bestMonth = '', bestMonthAvg = Infinity;
    Object.entries(monthPrices).forEach(([month, ps]) => {
      const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
      if (avg < bestMonthAvg) { bestMonthAvg = avg; bestMonth = month; }
    });

    const supplierPrices: Record<string, number[]> = {};
    rows.forEach(r => {
      const s = r.suppliers?.name || 'Sem fornecedor';
      (supplierPrices[s] ||= []).push(r.price);
    });
    let cheapestSupplier = '', cheapestSupplierAvg = Infinity;
    Object.entries(supplierPrices).forEach(([s, ps]) => {
      const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
      if (avg < cheapestSupplierAvg) { cheapestSupplierAvg = avg; cheapestSupplier = s; }
    });

    return { avgPrice, minPrice, maxPrice, lastPrice, priceChange, priceChangePercent, movingAvg, bestMonth, cheapestSupplier, cheapestSupplierAvg, isAboveAverage: lastPrice > avgPrice };
  })() : null;

  const uniqueBrands = useMemo(
    () => Array.from(new Set(rows.map(r => r.brandLabel))),
    [rows]
  );

  // Análise comparativa por marca
  const brandStats = useMemo(() => {
    const map = new Map<string, typeof rows>();
    rows.forEach(r => {
      if (!map.has(r.brandLabel)) map.set(r.brandLabel, [] as any);
      map.get(r.brandLabel)!.push(r);
    });
    const list = Array.from(map.entries()).map(([brand, items]) => {
      const prices = items.map(i => i.price);
      const totalQty = items.reduce((a, i) => a + Number(i.quantity), 0);
      const totalSpent = items.reduce((a, i) => a + Number(i.total_price), 0);
      const avg = totalQty > 0 ? totalSpent / totalQty : prices.reduce((a, b) => a + b, 0) / prices.length;
      const first = prices[0];
      const last = prices[prices.length - 1];
      const variation = first > 0 ? ((last - first) / first) * 100 : 0;
      const suppliers = Array.from(new Set(items.map(i => i.suppliers?.name).filter(Boolean))) as string[];
      return {
        brand,
        purchases: items.length,
        avg,
        min: Math.min(...prices),
        max: Math.max(...prices),
        last,
        variation,
        totalQty,
        totalSpent,
        lastDate: items[items.length - 1].purchase_date,
        suppliers,
      };
    });
    return list.sort((a, b) => a.avg - b.avg);
  }, [rows]);

  const bestBrand = brandStats[0];
  const worstBrand = brandStats.length > 1 ? brandStats[brandStats.length - 1] : null;
  const savingsPercent = bestBrand && worstBrand && worstBrand.avg > 0
    ? ((worstBrand.avg - bestBrand.avg) / worstBrand.avg) * 100
    : 0;

  // Série do gráfico: uma linha por marca, cruzando por data
  const sortedChartData = useMemo(() => {
    const byDate = new Map<string, any>();
    rows.forEach(r => {
      if (!byDate.has(r.purchase_date)) {
        byDate.set(r.purchase_date, {
          rawDate: r.purchase_date,
          date: format(parseLocalDate(r.purchase_date), 'dd/MM', { locale: ptBR }),
          fullDate: format(parseLocalDate(r.purchase_date), 'dd/MM/yyyy', { locale: ptBR }),
          ...Object.fromEntries(uniqueBrands.map(b => [b, null])),
        });
      }
      byDate.get(r.purchase_date)[r.brandLabel] = r.price;
    });
    return Array.from(byDate.values()).sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [rows, uniqueBrands]);

  return (
    <AppLayout requiredRoles={['admin', 'estoque', 'financeiro']}>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Histórico de Preços</h1>
          <p className="text-muted-foreground">Comparativo analítico de marcas e evolução de preços</p>
        </div>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>Selecione um Produto</CardTitle>
            <CardDescription>Todas as marcas do item são analisadas em conjunto</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.label} ({g.unit}){g.ids.length > 1 ? ` — ${g.ids.length} marcas` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {currentGroup && (
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

                <Card className="border-0 shadow-md border-l-4 border-l-warning">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      Inteligência de Compras
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {bestBrand && brandStats.length > 1 && (
                      <div className="flex items-start gap-2 p-3 bg-success/10 rounded-lg">
                        <Badge className="bg-success shrink-0">Melhor marca</Badge>
                        <span>
                          <strong>{bestBrand.brand}</strong> tem o menor custo médio: {formatCurrency(bestBrand.avg)}/{unit}
                          {worstBrand && savingsPercent > 0 && (
                            <> — economia de <strong>{savingsPercent.toFixed(1)}%</strong> frente a {worstBrand.brand} ({formatCurrency(worstBrand.avg)}/{unit}).</>
                          )}
                        </span>
                      </div>
                    )}
                    {stats.isAboveAverage && (
                      <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
                        <Badge variant="destructive">Alerta</Badge>
                        <span>Último preço está <strong>acima da média</strong>. Considere negociar ou trocar de marca/fornecedor.</span>
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
                          <strong>{stats.cheapestSupplier}</strong> oferece o melhor preço médio: {formatCurrency(stats.cheapestSupplierAvg)}/{unit}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Comparativo por marca */}
            {brandStats.length > 0 && (
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <CardTitle>Comparativo por Marca</CardTitle>
                  <CardDescription>Desempenho de cada marca deste item, da mais barata para a mais cara</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Marca</TableHead>
                          <TableHead>Compras</TableHead>
                          <TableHead>Preço médio</TableHead>
                          <TableHead>Mín.</TableHead>
                          <TableHead>Máx.</TableHead>
                          <TableHead>Último</TableHead>
                          <TableHead>Variação</TableHead>
                          <TableHead>Volume</TableHead>
                          <TableHead>Total gasto</TableHead>
                          <TableHead>Fornecedores</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {brandStats.map((b, i) => (
                          <TableRow key={b.brand} className={i === 0 && brandStats.length > 1 ? 'bg-success/5' : ''}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: brandColors[uniqueBrands.indexOf(b.brand) % brandColors.length] }}
                                />
                                {b.brand}
                                {i === 0 && brandStats.length > 1 && (
                                  <Badge className="bg-success">Melhor custo</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{b.purchases}</TableCell>
                            <TableCell className="font-semibold">{formatCurrency(b.avg)}/{unit}</TableCell>
                            <TableCell className="text-success">{formatCurrency(b.min)}</TableCell>
                            <TableCell className="text-destructive">{formatCurrency(b.max)}</TableCell>
                            <TableCell>{formatCurrency(b.last)}</TableCell>
                            <TableCell>
                              <span className={`flex items-center gap-1 ${b.variation > 0 ? 'text-destructive' : b.variation < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                {b.variation > 0 ? <TrendingUp className="h-4 w-4" /> : b.variation < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                                {b.variation > 0 ? '+' : ''}{b.variation.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell>{b.totalQty.toFixed(3)} {unit}</TableCell>
                            <TableCell>{formatCurrency(b.totalSpent)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {b.suppliers.length ? b.suppliers.join(', ') : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Gráfico de Evolução */}
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Evolução de Preços por Marca</CardTitle>
                <CardDescription>Cruzamento das marcas ao longo do tempo (preço por {unit})</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Carregando...</p>
                ) : sortedChartData.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Nenhum histórico de compras para este produto.</p>
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sortedChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0dbd4" />
                        <XAxis dataKey="date" stroke="#7a7168" fontSize={12} />
                        <YAxis
                          stroke="#7a7168"
                          fontSize={12}
                          tickFormatter={(v) => `R$${Number(v).toFixed(2)}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #e0dbd4',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number, name: string) => [`${formatCurrency(value)}/${unit}`, name]}
                          labelFormatter={(label, payload) => `Data: ${payload?.[0]?.payload?.fullDate || label}`}
                        />
                        <Legend />
                        {uniqueBrands.map((brand, index) => (
                          <Line
                            key={brand}
                            type="monotone"
                            dataKey={brand}
                            name={brand}
                            stroke={brandColors[index % brandColors.length]}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabela de Histórico */}
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Detalhes das Compras</CardTitle>
                <CardDescription>Histórico completo de todas as marcas deste item</CardDescription>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Nenhuma compra registrada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Marca</TableHead>
                          <TableHead>Quantidade</TableHead>
                          <TableHead>Valor Total</TableHead>
                          <TableHead>Preço Unitário</TableHead>
                          <TableHead>Fornecedor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.slice().reverse().map((purchase) => (
                          <TableRow key={purchase.id}>
                            <TableCell>
                              {format(parseLocalDate(purchase.purchase_date), 'dd/MM/yyyy', { locale: ptBR })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: brandColors[uniqueBrands.indexOf(purchase.brandLabel) % brandColors.length] }}
                                />
                                {purchase.brandLabel}
                              </div>
                            </TableCell>
                            <TableCell>
                              {Number(purchase.quantity).toFixed(3)} {unit}
                            </TableCell>
                            <TableCell>{formatCurrency(Number(purchase.total_price))}</TableCell>
                            <TableCell>
                              <span className={
                                stats && purchase.price > stats.avgPrice
                                  ? 'text-destructive font-medium'
                                  : 'text-success font-medium'
                              }>
                                {formatCurrency(purchase.price)}/{unit}
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
