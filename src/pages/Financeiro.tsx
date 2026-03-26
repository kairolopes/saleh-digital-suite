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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Plus, TrendingUp, TrendingDown, DollarSign, ArrowUpCircle, ArrowDownCircle, 
  Calendar, Filter, Search, Eye, Edit2, Receipt, ChevronLeft, ChevronRight,
  FileText, Package
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { EntryDetailsDialog } from '@/components/financeiro/EntryDetailsDialog';
import { EntryEditDialog } from '@/components/financeiro/EntryEditDialog';

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
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Details and Edit dialogs
  const [detailsEntry, setDetailsEntry] = useState<any>(null);
  const [editEntry, setEditEntry] = useState<any>(null);

  const [newEntry, setNewEntry] = useState({
    amount: '',
    category: '',
    description: '',
    entry_date: format(new Date(), 'yyyy-MM-dd')
  });

  // Fetch financial entries with enriched data
  const { data: entries, isLoading } = useQuery({
    queryKey: ['financial-entries', selectedMonth, filterCategory, filterType],
    queryFn: async () => {
      let query = supabase
        .from('financial_entries')
        .select('*')
        .gte('entry_date', format(startOfMonth(selectedMonth), 'yyyy-MM-dd'))
        .lte('entry_date', format(endOfMonth(selectedMonth), 'yyyy-MM-dd'))
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }

      if (filterType !== 'all') {
        query = query.eq('entry_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Summary calculations with more context
  const { data: summary } = useQuery({
    queryKey: ['financial-summary', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .gte('entry_date', format(startOfMonth(selectedMonth), 'yyyy-MM-dd'))
        .lte('entry_date', format(endOfMonth(selectedMonth), 'yyyy-MM-dd'));

      if (error) throw error;

      const incomeEntries = data?.filter(e => e.entry_type === 'receita') || [];
      const expenseEntries = data?.filter(e => e.entry_type === 'despesa') || [];
      
      const income = incomeEntries.reduce((acc, e) => acc + e.amount, 0);
      const expenses = expenseEntries.reduce((acc, e) => acc + e.amount, 0);
      const balance = income - expenses;

      // Calculate daily average
      const daysInMonth = endOfMonth(selectedMonth).getDate();
      const currentDay = selectedMonth.getMonth() === new Date().getMonth() 
        ? new Date().getDate() 
        : daysInMonth;
      const avgDailyIncome = income / currentDay;
      const avgDailyExpenses = expenses / currentDay;

      // Find max values
      const maxIncome = incomeEntries.length > 0 
        ? Math.max(...incomeEntries.map(e => e.amount)) 
        : 0;
      const maxExpense = expenseEntries.length > 0 
        ? Math.max(...expenseEntries.map(e => e.amount)) 
        : 0;

      return { 
        income, 
        expenses, 
        balance,
        incomeCount: incomeEntries.length,
        expenseCount: expenseEntries.length,
        avgDailyIncome,
        avgDailyExpenses,
        maxIncome,
        maxExpense
      };
    }
  });

  // Previous month comparison
  const { data: previousSummary } = useQuery({
    queryKey: ['financial-summary-previous', selectedMonth],
    queryFn: async () => {
      const prevMonth = subMonths(selectedMonth, 1);
      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .gte('entry_date', format(startOfMonth(prevMonth), 'yyyy-MM-dd'))
        .lte('entry_date', format(endOfMonth(prevMonth), 'yyyy-MM-dd'));

      if (error) throw error;

      const income = data?.filter(e => e.entry_type === 'receita').reduce((acc, e) => acc + e.amount, 0) || 0;
      const expenses = data?.filter(e => e.entry_type === 'despesa').reduce((acc, e) => acc + e.amount, 0) || 0;

      return { income, expenses };
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

      const incomeByCategory: Record<string, { total: number; count: number }> = {};
      const expensesByCategory: Record<string, { total: number; count: number }> = {};

      data?.forEach(entry => {
        if (entry.entry_type === 'receita') {
          if (!incomeByCategory[entry.category]) {
            incomeByCategory[entry.category] = { total: 0, count: 0 };
          }
          incomeByCategory[entry.category].total += entry.amount;
          incomeByCategory[entry.category].count += 1;
        } else {
          if (!expensesByCategory[entry.category]) {
            expensesByCategory[entry.category] = { total: 0, count: 0 };
          }
          expensesByCategory[entry.category].total += entry.amount;
          expensesByCategory[entry.category].count += 1;
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
    setCurrentPage(1);
  };

  const handleNextMonth = () => {
    const next = new Date(selectedMonth);
    next.setMonth(next.getMonth() + 1);
    if (next <= new Date()) {
      setSelectedMonth(next);
      setCurrentPage(1);
    }
  };

  // Calculate percentage change
  const getPercentageChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const incomeChange = previousSummary ? getPercentageChange(summary?.income || 0, previousSummary.income) : 0;
  const expenseChange = previousSummary ? getPercentageChange(summary?.expenses || 0, previousSummary.expenses) : 0;

  // Filter entries by search term
  const filteredEntries = entries?.filter(entry => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      entry.description?.toLowerCase().includes(search) ||
      categoryLabels[entry.category]?.toLowerCase().includes(search) ||
      entry.amount.toString().includes(search)
    );
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[180px] text-center">
            {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleNextMonth}
            disabled={selectedMonth.getMonth() === new Date().getMonth() && selectedMonth.getFullYear() === new Date().getFullYear()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Enhanced Summary Cards */}
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
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-muted-foreground">
                  {summary?.incomeCount || 0} lançamentos
                </span>
                {previousSummary && (
                  <span className={`flex items-center gap-1 ${incomeChange >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {incomeChange >= 0 ? '↑' : '↓'} {Math.abs(incomeChange).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Média diária: {formatCurrency(summary?.avgDailyIncome || 0)}
              </p>
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
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-muted-foreground">
                  {summary?.expenseCount || 0} lançamentos
                </span>
                {previousSummary && (
                  <span className={`flex items-center gap-1 ${expenseChange <= 0 ? 'text-success' : 'text-destructive'}`}>
                    {expenseChange <= 0 ? '↓' : '↑'} {Math.abs(expenseChange).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Média diária: {formatCurrency(summary?.avgDailyExpenses || 0)}
              </p>
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
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-muted-foreground">
                  {(summary?.incomeCount || 0) + (summary?.expenseCount || 0)} movimentações
                </span>
                <Badge variant={(summary?.balance || 0) >= 0 ? 'default' : 'destructive'}>
                  {(summary?.balance || 0) >= 0 ? 'Positivo' : 'Negativo'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Tabs */}
        <Tabs defaultValue="lancamentos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="lancamentos" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Lançamentos
            </TabsTrigger>
            <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
            <TabsTrigger value="categorias">Por Categoria</TabsTrigger>
          </TabsList>

          {/* Lançamentos Tab - Now Primary */}
          <TabsContent value="lancamentos">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <CardTitle>Lançamentos do Mês</CardTitle>
                    <CardDescription>
                      {filteredEntries.length} registro(s) encontrado(s)
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="pl-9 w-[200px]"
                      />
                    </div>
                    
                    {/* Type Filter */}
                    <Select value={filterType} onValueChange={(v) => { setFilterType(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="receita">Entradas</SelectItem>
                        <SelectItem value="despesa">Saídas</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Category Filter */}
                    <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as Categorias</SelectItem>
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
                ) : paginatedEntries.length > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Data</TableHead>
                          <TableHead className="w-[80px]">Tipo</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="w-[100px] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedEntries.map((entry) => (
                          <TableRow 
                            key={entry.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setDetailsEntry(entry)}
                          >
                            <TableCell className="font-medium">
                              {format(new Date(entry.entry_date), 'dd/MM/yyyy')}
                            </TableCell>
                            <TableCell>
                              {entry.entry_type === 'receita' ? (
                                <Badge className="bg-success/20 text-success border-0">
                                  <ArrowUpCircle className="h-3 w-3 mr-1" />
                                  Entrada
                                </Badge>
                              ) : (
                                <Badge className="bg-destructive/20 text-destructive border-0">
                                  <ArrowDownCircle className="h-3 w-3 mr-1" />
                                  Saída
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {categoryLabels[entry.category] || entry.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[250px] truncate text-muted-foreground">
                              {entry.description || '-'}
                            </TableCell>
                            <TableCell>
                              {entry.reference_type === 'pedido' ? (
                                <Badge variant="secondary" className="text-xs">
                                  <Package className="h-3 w-3 mr-1" />
                                  Pedido
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  <FileText className="h-3 w-3 mr-1" />
                                  Manual
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${
                              entry.entry_type === 'receita' ? 'text-success' : 'text-destructive'
                            }`}>
                              {entry.entry_type === 'receita' ? '+' : '-'}{formatCurrency(entry.amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => setDetailsEntry(entry)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => setEditEntry(entry)}
                                  disabled={entry.reference_type === 'pedido'}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredEntries.length)} de {filteredEntries.length}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                          >
                            Anterior
                          </Button>
                          <span className="flex items-center px-3 text-sm">
                            Página {currentPage} de {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum lançamento encontrado.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fluxo de Caixa Tab */}
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
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e0dbd4',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="entradas" stackId="1" stroke="#22c55e" fill="rgba(34, 197, 94, 0.3)" name="Entradas" />
                      <Area type="monotone" dataKey="saidas" stackId="2" stroke="#ef4444" fill="rgba(239, 68, 68, 0.3)" name="Saídas" />
                      <Area type="monotone" dataKey="saldo" stroke="#e07b20" fill="rgba(224, 123, 32, 0.1)" name="Saldo Acumulado" />
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

          {/* Por Categoria Tab */}
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
                      {Object.entries(categoryBreakdown.incomeByCategory)
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([cat, data]) => {
                          const percentage = ((data.total / (summary?.income || 1)) * 100);
                          return (
                            <div key={cat} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                  {categoryLabels[cat] || cat}
                                  <Badge variant="secondary" className="text-xs">
                                    {data.count} lanç.
                                  </Badge>
                                </span>
                                <span className="font-medium text-success">{formatCurrency(data.total)}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-success rounded-full transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground text-right">{percentage.toFixed(1)}%</p>
                            </div>
                          );
                        })}
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
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([cat, data]) => {
                          const percentage = ((data.total / (summary?.expenses || 1)) * 100);
                          return (
                            <div key={cat} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                  {categoryLabels[cat] || cat}
                                  <Badge variant="secondary" className="text-xs">
                                    {data.count} lanç.
                                  </Badge>
                                </span>
                                <span className="font-medium text-destructive">{formatCurrency(data.total)}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-destructive rounded-full transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground text-right">{percentage.toFixed(1)}%</p>
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

      {/* Details Dialog */}
      <EntryDetailsDialog
        entry={detailsEntry}
        open={!!detailsEntry}
        onOpenChange={(open) => !open && setDetailsEntry(null)}
        categoryLabels={categoryLabels}
      />

      {/* Edit Dialog */}
      <EntryEditDialog
        entry={editEntry}
        open={!!editEntry}
        onOpenChange={(open) => !open && setEditEntry(null)}
        categoryLabels={categoryLabels}
        incomeCategories={INCOME_CATEGORIES}
        expenseCategories={EXPENSE_CATEGORIES}
      />
    </AppLayout>
  );
}
