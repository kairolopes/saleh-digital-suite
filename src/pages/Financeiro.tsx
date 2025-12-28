import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, TrendingUp, TrendingDown, DollarSign, ArrowUpCircle, ArrowDownCircle, Calendar, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const INCOME_CATEGORIES = [
  'vendas',
  'servicos',
  'outros_receitas'
];

const EXPENSE_CATEGORIES = [
  'compras',
  'salarios',
  'aluguel',
  'utilities',
  'marketing',
  'manutencao',
  'impostos',
  'outros_despesas'
];

const categoryLabels: Record<string, string> = {
  vendas: 'Vendas',
  servicos: 'Serviços',
  outros_receitas: 'Outras Receitas',
  compras: 'Compras/Insumos',
  salarios: 'Salários',
  aluguel: 'Aluguel',
  utilities: 'Água/Luz/Internet',
  marketing: 'Marketing',
  manutencao: 'Manutenção',
  impostos: 'Impostos',
  outros_despesas: 'Outras Despesas'
};

export default function Financeiro() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [entryType, setEntryType] = useState<'receita' | 'despesa'>('receita');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const [newEntry, setNewEntry] = useState({
    amount: '',
    category: '',
    description: '',
    entry_date: format(new Date(), 'yyyy-MM-dd')
  });

  // Fetch financial entries
  const { data: entries, isLoading } = useQuery({
    queryKey: ['financial-entries', selectedMonth, filterCategory],
    queryFn: async () => {
      let query = supabase
        .from('financial_entries')
        .select('*')
        .gte('entry_date', format(startOfMonth(selectedMonth), 'yyyy-MM-dd'))
        .lte('entry_date', format(endOfMonth(selectedMonth), 'yyyy-MM-dd'))
        .order('entry_date', { ascending: false });

      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Summary calculations
  const { data: summary } = useQuery({
    queryKey: ['financial-summary', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .gte('entry_date', format(startOfMonth(selectedMonth), 'yyyy-MM-dd'))
        .lte('entry_date', format(endOfMonth(selectedMonth), 'yyyy-MM-dd'));

      if (error) throw error;

      const income = data?.filter(e => e.entry_type === 'receita').reduce((acc, e) => acc + e.amount, 0) || 0;
      const expenses = data?.filter(e => e.entry_type === 'despesa').reduce((acc, e) => acc + e.amount, 0) || 0;
      const balance = income - expenses;

      return { income, expenses, balance };
    }
  });

  // Cash flow data for chart
  const { data: cashFlowData } = useQuery({
    queryKey: ['cash-flow', selectedMonth],
    queryFn: async () => {
      const days: { date: string; entradas: number; saidas: number; saldo: number }[] = [];
      const daysInMonth = endOfMonth(selectedMonth).getDate();
      let runningBalance = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day);
        const { data, error } = await supabase
          .from('financial_entries')
          .select('*')
          .gte('entry_date', format(startOfDay(date), 'yyyy-MM-dd'))
          .lte('entry_date', format(endOfDay(date), 'yyyy-MM-dd'));

        if (error) throw error;

        const dayIncome = data?.filter(e => e.entry_type === 'receita').reduce((acc, e) => acc + e.amount, 0) || 0;
        const dayExpenses = data?.filter(e => e.entry_type === 'despesa').reduce((acc, e) => acc + e.amount, 0) || 0;
        runningBalance += dayIncome - dayExpenses;

        days.push({
          date: format(date, 'dd'),
          entradas: dayIncome,
          saidas: dayExpenses,
          saldo: runningBalance
        });
      }

      return days;
    }
  });

  // Category breakdown
  const { data: categoryBreakdown } = useQuery({
    queryKey: ['category-breakdown', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .gte('entry_date', format(startOfMonth(selectedMonth), 'yyyy-MM-dd'))
        .lte('entry_date', format(endOfMonth(selectedMonth), 'yyyy-MM-dd'));

      if (error) throw error;

      const incomeByCategory: Record<string, number> = {};
      const expensesByCategory: Record<string, number> = {};

      data?.forEach(entry => {
        if (entry.entry_type === 'receita') {
          incomeByCategory[entry.category] = (incomeByCategory[entry.category] || 0) + entry.amount;
        } else {
          expensesByCategory[entry.category] = (expensesByCategory[entry.category] || 0) + entry.amount;
        }
      });

      return { incomeByCategory, expensesByCategory };
    }
  });

  // Create entry mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('financial_entries').insert({
        entry_type: entryType,
        amount: parseFloat(newEntry.amount),
        category: newEntry.category,
        description: newEntry.description,
        entry_date: newEntry.entry_date
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['category-breakdown'] });
      toast.success(`${entryType === 'receita' ? 'Receita' : 'Despesa'} registrada com sucesso!`);
      setIsDialogOpen(false);
      setNewEntry({ amount: '', category: '', description: '', entry_date: format(new Date(), 'yyyy-MM-dd') });
    },
    onError: (error: any) => {
      toast.error('Erro ao registrar: ' + error.message);
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handlePreviousMonth = () => {
    setSelectedMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    const next = new Date(selectedMonth);
    next.setMonth(next.getMonth() + 1);
    if (next <= new Date()) {
      setSelectedMonth(next);
    }
  };

  return (
    <AppLayout requiredRoles={['admin', 'financeiro']}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Financeiro</h1>
            <p className="text-muted-foreground mt-1">Controle de entradas, saídas e fluxo de caixa</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEntryType('receita')} className="bg-success hover:bg-success/90">
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  Nova Entrada
                </Button>
              </DialogTrigger>
              <DialogTrigger asChild>
                <Button onClick={() => setEntryType('despesa')} variant="destructive">
                  <ArrowDownCircle className="h-4 w-4 mr-2" />
                  Nova Saída
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {entryType === 'receita' ? 'Registrar Receita' : 'Registrar Despesa'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Valor</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={newEntry.amount}
                      onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select
                      value={newEntry.category}
                      onValueChange={(value) => setNewEntry({ ...newEntry, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {(entryType === 'receita' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
                          <SelectItem key={cat} value={cat}>
                            {categoryLabels[cat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={newEntry.entry_date}
                      onChange={(e) => setNewEntry({ ...newEntry, entry_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Textarea
                      placeholder="Descrição opcional..."
                      value={newEntry.description}
                      onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => createMutation.mutate()}
                    disabled={!newEntry.amount || !newEntry.category || createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
            <Calendar className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[150px] text-center">
            {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleNextMonth}
            disabled={selectedMonth.getMonth() === new Date().getMonth() && selectedMonth.getFullYear() === new Date().getFullYear()}
          >
            <Calendar className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-md bg-gradient-to-br from-success/10 to-success/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                Total Entradas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">
                {formatCurrency(summary?.income || 0)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-gradient-to-br from-destructive/10 to-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                Total Saídas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">
                {formatCurrency(summary?.expenses || 0)}
              </div>
            </CardContent>
          </Card>

          <Card className={`border-0 shadow-md bg-gradient-to-br ${(summary?.balance || 0) >= 0 ? 'from-primary/10 to-primary/5' : 'from-destructive/10 to-destructive/5'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Saldo do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${(summary?.balance || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {formatCurrency(summary?.balance || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="fluxo" className="space-y-4">
          <TabsList>
            <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
            <TabsTrigger value="categorias">Por Categoria</TabsTrigger>
          </TabsList>

          <TabsContent value="fluxo">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Fluxo de Caixa - {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}</CardTitle>
                <CardDescription>Evolução diária de entradas, saídas e saldo acumulado</CardDescription>
              </CardHeader>
              <CardContent>
                {cashFlowData && cashFlowData.some(d => d.entradas > 0 || d.saidas > 0) ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={cashFlowData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis tickFormatter={(v) => `R$${v}`} className="text-xs" />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          formatCurrency(value), 
                          name === 'entradas' ? 'Entradas' : name === 'saidas' ? 'Saídas' : 'Saldo'
                        ]}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="entradas" stackId="1" stroke="hsl(var(--success))" fill="hsl(var(--success) / 0.3)" name="Entradas" />
                      <Area type="monotone" dataKey="saidas" stackId="2" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.3)" name="Saídas" />
                      <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" name="Saldo Acumulado" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-center py-16">
                    Nenhum lançamento neste mês.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lancamentos">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <CardTitle>Lançamentos</CardTitle>
                    <CardDescription>Todos os registros do mês</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filtrar categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {[...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map(cat => (
                          <SelectItem key={cat} value={cat}>
                            {categoryLabels[cat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-8">Carregando...</p>
                ) : entries && entries.length > 0 ? (
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
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{format(new Date(entry.entry_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              entry.entry_type === 'entrada' 
                                ? 'bg-success/10 text-success' 
                                : 'bg-destructive/10 text-destructive'
                            }`}>
                              {entry.entry_type === 'entrada' ? 'Entrada' : 'Saída'}
                            </span>
                          </TableCell>
                          <TableCell>{categoryLabels[entry.category] || entry.category}</TableCell>
                          <TableCell className="text-muted-foreground">{entry.description || '-'}</TableCell>
                          <TableCell className={`text-right font-medium ${
                            entry.entry_type === 'entrada' ? 'text-success' : 'text-destructive'
                          }`}>
                            {entry.entry_type === 'entrada' ? '+' : '-'}{formatCurrency(entry.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum lançamento encontrado.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categorias">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-success" />
                    Entradas por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryBreakdown?.incomeByCategory && Object.keys(categoryBreakdown.incomeByCategory).length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(categoryBreakdown.incomeByCategory).map(([cat, value]) => (
                        <div key={cat} className="flex items-center justify-between">
                          <span>{categoryLabels[cat] || cat}</span>
                          <span className="font-medium text-success">{formatCurrency(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">Sem entradas neste mês.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-destructive" />
                    Saídas por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryBreakdown?.expensesByCategory && Object.keys(categoryBreakdown.expensesByCategory).length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(categoryBreakdown.expensesByCategory)
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, value]) => {
                          const total = summary?.expenses || 1;
                          const percentage = (value / total) * 100;
                          return (
                            <div key={cat} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span>{categoryLabels[cat] || cat}</span>
                                <span className="font-medium text-destructive">{formatCurrency(value)}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-destructive rounded-full transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">Sem saídas neste mês.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
