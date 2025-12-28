import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  TrendingUp,
  Package,
  DollarSign,
  Calendar,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (date: string) =>
  format(new Date(date), "dd/MM/yyyy", { locale: ptBR });

// Export to CSV
const exportToCSV = (data: any[], filename: string, headers: string[]) => {
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const value = row[h.toLowerCase().replace(/ /g, "_")] ?? "";
        return typeof value === "string" && value.includes(",")
          ? `"${value}"`
          : value;
      }).join(",")
    ),
  ].join("\n");

  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  toast.success("Relatório exportado com sucesso!");
};

export default function Relatorios() {
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  });
  const [selectedPeriod, setSelectedPeriod] = useState("month");

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    const now = new Date();
    let start: Date;
    let end = now;

    switch (period) {
      case "today":
        start = now;
        break;
      case "week":
        start = new Date(now.setDate(now.getDate() - 7));
        end = new Date();
        break;
      case "month":
        start = startOfMonth(new Date());
        end = endOfMonth(new Date());
        break;
      case "quarter":
        start = subMonths(new Date(), 3);
        break;
      case "year":
        start = new Date(new Date().getFullYear(), 0, 1);
        break;
      default:
        start = startOfMonth(new Date());
    }

    setDateRange({
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    });
  };

  // Sales Report
  const { data: salesReport, isLoading: loadingSales } = useQuery({
    queryKey: ["sales-report", dateRange],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          total,
          status,
          created_at,
          table_number,
          customer_name,
          order_items (
            quantity,
            total_price,
            menu_items (
              category,
              recipes (name)
            )
          )
        `)
        .gte("created_at", dateRange.start)
        .lte("created_at", dateRange.end + "T23:59:59")
        .in("status", ["delivered", "ready", "completed"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Calculate totals
      const totalRevenue = orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
      const totalOrders = orders?.length || 0;
      const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Sales by category
      const categoryMap: Record<string, { quantity: number; revenue: number }> = {};
      orders?.forEach((order) => {
        order.order_items?.forEach((item: any) => {
          const cat = item.menu_items?.category || "Outros";
          if (!categoryMap[cat]) categoryMap[cat] = { quantity: 0, revenue: 0 };
          categoryMap[cat].quantity += item.quantity;
          categoryMap[cat].revenue += item.total_price;
        });
      });

      // Top products
      const productMap: Record<string, { quantity: number; revenue: number }> = {};
      orders?.forEach((order) => {
        order.order_items?.forEach((item: any) => {
          const name = item.menu_items?.recipes?.name || "Produto";
          if (!productMap[name]) productMap[name] = { quantity: 0, revenue: 0 };
          productMap[name].quantity += item.quantity;
          productMap[name].revenue += item.total_price;
        });
      });

      const topProducts = Object.entries(productMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const salesByCategory = Object.entries(categoryMap)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.revenue - a.revenue);

      return {
        orders: orders || [],
        totalRevenue,
        totalOrders,
        avgTicket,
        topProducts,
        salesByCategory,
      };
    },
  });

  // Stock Report
  const { data: stockReport, isLoading: loadingStock } = useQuery({
    queryKey: ["stock-report"],
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select(`
          id,
          name,
          unit,
          current_quantity,
          min_quantity,
          average_price,
          last_price,
          suppliers:default_supplier_id (name)
        `)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      const totalValue = products?.reduce(
        (sum, p) => sum + (p.current_quantity || 0) * (p.average_price || 0),
        0
      ) || 0;

      const lowStock = products?.filter(
        (p) => (p.current_quantity || 0) <= (p.min_quantity || 0)
      ) || [];

      const outOfStock = products?.filter((p) => (p.current_quantity || 0) === 0) || [];

      return {
        products: products || [],
        totalValue,
        lowStock,
        outOfStock,
        totalProducts: products?.length || 0,
      };
    },
  });

  // Financial Report
  const { data: financialReport, isLoading: loadingFinancial } = useQuery({
    queryKey: ["financial-report", dateRange],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("financial_entries")
        .select("*")
        .gte("entry_date", dateRange.start)
        .lte("entry_date", dateRange.end)
        .order("entry_date", { ascending: false });

      if (error) throw error;

      const income = entries?.filter((e) => e.entry_type === "receita") || [];
      const expenses = entries?.filter((e) => e.entry_type === "despesa") || [];

      const totalIncome = income.reduce((sum, e) => sum + e.amount, 0);
      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
      const balance = totalIncome - totalExpenses;

      // Group by category
      const incomeByCategory: Record<string, number> = {};
      const expensesByCategory: Record<string, number> = {};

      income.forEach((e) => {
        incomeByCategory[e.category] = (incomeByCategory[e.category] || 0) + e.amount;
      });

      expenses.forEach((e) => {
        expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount;
      });

      return {
        entries: entries || [],
        totalIncome,
        totalExpenses,
        balance,
        incomeByCategory: Object.entries(incomeByCategory).map(([category, amount]) => ({
          category,
          amount,
        })),
        expensesByCategory: Object.entries(expensesByCategory).map(([category, amount]) => ({
          category,
          amount,
        })),
      };
    },
  });

  const exportSalesReport = () => {
    if (!salesReport?.orders) return;
    const data = salesReport.orders.map((o) => ({
      pedido: o.order_number,
      data: formatDate(o.created_at),
      mesa: o.table_number || "-",
      cliente: o.customer_name || "-",
      total: o.total,
      status: o.status,
    }));
    exportToCSV(data, "relatorio_vendas", ["Pedido", "Data", "Mesa", "Cliente", "Total", "Status"]);
  };

  const exportStockReport = () => {
    if (!stockReport?.products) return;
    const data = stockReport.products.map((p: any) => ({
      produto: p.name,
      unidade: p.unit,
      quantidade: p.current_quantity,
      estoque_minimo: p.min_quantity,
      preco_medio: p.average_price,
      valor_total: (p.current_quantity || 0) * (p.average_price || 0),
    }));
    exportToCSV(data, "relatorio_estoque", [
      "Produto",
      "Unidade",
      "Quantidade",
      "Estoque_Minimo",
      "Preco_Medio",
      "Valor_Total",
    ]);
  };

  const exportFinancialReport = () => {
    if (!financialReport?.entries) return;
    const data = financialReport.entries.map((e) => ({
      data: formatDate(e.entry_date),
      tipo: e.entry_type === "receita" ? "Receita" : "Despesa",
      categoria: e.category,
      descricao: e.description || "-",
      valor: e.amount,
    }));
    exportToCSV(data, "relatorio_financeiro", ["Data", "Tipo", "Categoria", "Descricao", "Valor"]);
  };

  return (
    <AppLayout requiredRoles={["admin", "financeiro"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <BarChart3 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Relatórios</h1>
              <p className="text-muted-foreground">
                Visualize e exporte relatórios do sistema
              </p>
            </div>
          </div>
        </div>

        {/* Period Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>Período Rápido</Label>
                <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="week">Últimos 7 dias</SelectItem>
                    <SelectItem value="month">Este mês</SelectItem>
                    <SelectItem value="quarter">Últimos 3 meses</SelectItem>
                    <SelectItem value="year">Este ano</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data Início</Label>
                <Input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) =>
                    setDateRange((prev) => ({ ...prev, start: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Data Fim</Label>
                <Input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) =>
                    setDateRange((prev) => ({ ...prev, end: e.target.value }))
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reports Tabs */}
        <Tabs defaultValue="sales" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Vendas
            </TabsTrigger>
            <TabsTrigger value="stock" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Estoque
            </TabsTrigger>
            <TabsTrigger value="financial" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Financeiro
            </TabsTrigger>
          </TabsList>

          {/* Sales Report */}
          <TabsContent value="sales" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={exportSalesReport} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Receita Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(salesReport?.totalRevenue || 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total de Pedidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{salesReport?.totalOrders || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Ticket Médio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(salesReport?.avgTicket || 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Top Products */}
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Produtos Mais Vendidos</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSales ? (
                  <p className="text-center py-4">Carregando...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesReport?.topProducts?.map((product, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell className="text-right">{product.quantity}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Sales by Category */}
            <Card>
              <CardHeader>
                <CardTitle>Vendas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesReport?.salesByCategory?.map((cat, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium capitalize">
                          {cat.category.replace("_", " ")}
                        </TableCell>
                        <TableCell className="text-right">{cat.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(cat.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stock Report */}
          <TabsContent value="stock" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={exportStockReport} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total de Produtos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{stockReport?.totalProducts || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Valor em Estoque
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(stockReport?.totalValue || 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Estoque Baixo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-yellow-600">
                    {stockReport?.lowStock?.length || 0}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Sem Estoque
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-red-600">
                    {stockReport?.outOfStock?.length || 0}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Stock Table */}
            <Card>
              <CardHeader>
                <CardTitle>Posição de Estoque</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingStock ? (
                  <p className="text-center py-4">Carregando...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead className="text-right">Qtd Atual</TableHead>
                        <TableHead className="text-right">Qtd Mínima</TableHead>
                        <TableHead className="text-right">Preço Médio</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockReport?.products?.map((product: any) => (
                        <TableRow
                          key={product.id}
                          className={
                            (product.current_quantity || 0) <= (product.min_quantity || 0)
                              ? "bg-red-50 dark:bg-red-950/20"
                              : ""
                          }
                        >
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.unit}</TableCell>
                          <TableCell className="text-right">
                            {product.current_quantity?.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.min_quantity?.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.average_price || 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(
                              (product.current_quantity || 0) * (product.average_price || 0)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Financial Report */}
          <TabsContent value="financial" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={exportFinancialReport} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Receitas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(financialReport?.totalIncome || 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Despesas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(financialReport?.totalExpenses || 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Saldo do Período
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-2xl font-bold ${
                      (financialReport?.balance || 0) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(financialReport?.balance || 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Income by Category */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Receitas por Categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financialReport?.incomeByCategory?.map((cat, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium capitalize">
                            {cat.category}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(cat.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Despesas por Categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financialReport?.expensesByCategory?.map((cat, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium capitalize">
                            {cat.category}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(cat.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Financial Entries */}
            <Card>
              <CardHeader>
                <CardTitle>Lançamentos do Período</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFinancial ? (
                  <p className="text-center py-4">Carregando...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financialReport?.entries?.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDate(entry.entry_date)}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                entry.entry_type === "receita"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              }`}
                            >
                              {entry.entry_type === "receita" ? "Receita" : "Despesa"}
                            </span>
                          </TableCell>
                          <TableCell className="capitalize">{entry.category}</TableCell>
                          <TableCell>{entry.description || "-"}</TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              entry.entry_type === "receita"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {entry.entry_type === "receita" ? "+" : "-"}
                            {formatCurrency(entry.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
