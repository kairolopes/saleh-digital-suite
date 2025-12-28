import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format, parseISO, isToday, isTomorrow, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Users,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Bell,
} from 'lucide-react';

interface Reservation {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  table_number: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
  created_at: string;
  reminder_sent_at: string | null;
}

const statusConfig = {
  pending: { label: 'Pendente', color: 'bg-yellow-500', icon: AlertCircle },
  confirmed: { label: 'Confirmada', color: 'bg-green-500', icon: CheckCircle },
  cancelled: { label: 'Cancelada', color: 'bg-red-500', icon: XCircle },
  completed: { label: 'Concluída', color: 'bg-gray-500', icon: CheckCircle },
  no_show: { label: 'Não Compareceu', color: 'bg-orange-500', icon: XCircle },
};

const timeSlots = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'
];

export default function Reservas() {
  const queryClient = useQueryClient();
  const [isNewReservationOpen, setIsNewReservationOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState('upcoming');
  const [filterNoReminder, setFilterNoReminder] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    table_number: '',
    party_size: 2,
    reservation_date: format(new Date(), 'yyyy-MM-dd'),
    reservation_time: '19:00',
    notes: '',
  });

  // Fetch restaurant settings
  const { data: settings } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_settings')
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch reservations
  const { data: reservations, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true });
      if (error) throw error;
      return data as Reservation[];
    },
  });

  // Create reservation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('reservations').insert({
        ...data,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Reserva criada com sucesso!');
      setIsNewReservationOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error('Erro ao criar reserva');
    },
  });

  // Send webhook notification
  const sendWebhook = async (reservationId: string, action: 'confirmed' | 'cancelled' | 'created') => {
    try {
      const { error } = await supabase.functions.invoke('send-reservation-webhook', {
        body: { reservation_id: reservationId, action },
      });
      if (error) {
        console.error('Webhook error:', error);
      } else {
        console.log('Webhook sent successfully');
      }
    } catch (err) {
      console.error('Failed to send webhook:', err);
    }
  };

  // Update reservation status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === 'confirmed') {
        updates.confirmed_at = new Date().toISOString();
      } else if (status === 'cancelled') {
        updates.cancelled_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('reservations')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      return { id, status };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Status atualizado!');
      
      // Send webhook for confirmed or cancelled reservations
      if (data.status === 'confirmed' || data.status === 'cancelled') {
        sendWebhook(data.id, data.status as 'confirmed' | 'cancelled');
      }
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    },
  });

  const resetForm = () => {
    setFormData({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      table_number: '',
      party_size: 2,
      reservation_date: format(new Date(), 'yyyy-MM-dd'),
      reservation_time: '19:00',
      notes: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.customer_phone || !formData.table_number) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    createMutation.mutate(formData);
  };

  // Filter reservations
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const upcomingReservations = reservations?.filter(
    (r) => r.reservation_date >= todayStr && !['cancelled', 'completed', 'no_show'].includes(r.status)
  );
  const filteredUpcomingReservations = filterNoReminder 
    ? upcomingReservations?.filter((r) => !r.reminder_sent_at)
    : upcomingReservations;
  const pastReservations = reservations?.filter(
    (r) => r.reservation_date < todayStr || ['cancelled', 'completed', 'no_show'].includes(r.status)
  );

  // Reservations for selected date
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const reservationsForDate = reservations?.filter(
    (r) => r.reservation_date === selectedDateStr
  );

  // Generate table options based on settings
  const tableOptions = Array.from({ length: settings?.max_tables || 20 }, (_, i) => String(i + 1));

  const formatDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Hoje';
    if (isTomorrow(date)) return 'Amanhã';
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  };

  if (!settings?.accept_reservations) {
    return (
      <AppLayout requiredRoles={['admin', 'garcom']}>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <AlertCircle className="h-16 w-16 text-muted-foreground" />
          <h2 className="text-2xl font-bold text-foreground">Reservas Desabilitadas</h2>
          <p className="text-muted-foreground text-center max-w-md">
            O sistema de reservas está desabilitado nas configurações do restaurante.
            Acesse Configurações para habilitá-lo.
          </p>
          <Button onClick={() => window.location.href = '/configuracoes'}>
            Ir para Configurações
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout requiredRoles={['admin', 'garcom']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Reservas</h1>
            <p className="text-muted-foreground">
              Gerencie as reservas de mesas do restaurante
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={async () => {
                toast.info('Enviando lembretes de teste...');
                try {
                  const { data, error } = await supabase.functions.invoke('send-reservation-reminder', {
                    body: { forceRun: true },
                  });
                  if (error) throw error;
                  if (data?.message === "No reservations to remind") {
                    toast.info('Nenhuma reserva confirmada para amanhã');
                  } else if (data?.message === "No webhook URL configured") {
                    toast.warning('URL de webhook não configurada nas configurações');
                  } else {
                    toast.success(`Lembretes enviados: ${data?.success || 0} sucesso, ${data?.errors || 0} erros`);
                  }
                } catch (err) {
                  console.error('Erro ao testar lembretes:', err);
                  toast.error('Erro ao enviar lembretes de teste');
                }
              }}
            >
              <Bell className="mr-2 h-4 w-4" />
              Testar Lembretes
            </Button>
            <Button onClick={() => setIsNewReservationOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Reserva
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {reservations?.filter((r) => r.reservation_date === todayStr && r.status !== 'cancelled').length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {reservations?.filter((r) => r.status === 'pending').length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Confirmadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {upcomingReservations?.filter((r) => r.status === 'confirmed').length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mesas Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {(settings?.max_tables || 20) - (reservationsForDate?.filter((r) => r.status !== 'cancelled').length || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Bell className="h-3 w-3" />
                Lembretes Enviados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {reservations?.filter((r) => r.reminder_sent_at !== null).length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendar */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Calendário
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                locale={ptBR}
                className="rounded-md border"
                modifiers={{
                  hasReservation: reservations?.map((r) => parseISO(r.reservation_date)) || [],
                }}
                modifiersStyles={{
                  hasReservation: {
                    fontWeight: 'bold',
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                  },
                }}
              />
              <div className="mt-4 space-y-2">
                <h4 className="font-medium">
                  {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                </h4>
                {reservationsForDate?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma reserva</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {reservationsForDate?.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between p-2 rounded bg-muted text-sm"
                      >
                        <div>
                          <span className="font-medium">{r.reservation_time}</span>
                          <span className="mx-2">-</span>
                          <span>{r.customer_name}</span>
                        </div>
                        <Badge className={`${statusConfig[r.status as keyof typeof statusConfig]?.color} text-white`}>
                          Mesa {r.table_number}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reservations List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="upcoming">
                      Próximas ({filteredUpcomingReservations?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="past">
                      Histórico ({pastReservations?.length || 0})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {activeTab === 'upcoming' && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterNoReminder}
                        onChange={(e) => setFilterNoReminder(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span className="text-muted-foreground">Sem lembrete</span>
                    </label>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Tabs value={activeTab}>
                  <TabsContent value="upcoming" className="mt-0">
                    {!filteredUpcomingReservations?.length ? (
                      <p className="text-center py-8 text-muted-foreground">
                        {filterNoReminder ? 'Todas as reservas já receberam lembrete' : 'Nenhuma reserva próxima'}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data/Hora</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead>Mesa</TableHead>
                              <TableHead>Pessoas</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredUpcomingReservations.map((reservation) => (
                              <TableRow key={reservation.id}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {formatDateLabel(reservation.reservation_date)}
                                    </span>
                                    <span className="text-sm text-muted-foreground flex items-center">
                                      <Clock className="h-3 w-3 mr-1" />
                                      {reservation.reservation_time}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{reservation.customer_name}</span>
                                    <span className="text-sm text-muted-foreground flex items-center">
                                      <Phone className="h-3 w-3 mr-1" />
                                      {reservation.customer_phone}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">Mesa {reservation.table_number}</Badge>
                                </TableCell>
                                <TableCell>
                                  <span className="flex items-center">
                                    <Users className="h-4 w-4 mr-1" />
                                    {reservation.party_size}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      className={`${statusConfig[reservation.status as keyof typeof statusConfig]?.color} text-white`}
                                    >
                                      {statusConfig[reservation.status as keyof typeof statusConfig]?.label}
                                    </Badge>
                                    {reservation.reminder_sent_at && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 cursor-help">
                                              <Bell className="h-3 w-3 mr-1" />
                                              Lembrado
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Lembrete enviado em {format(parseISO(reservation.reminder_sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    {(reservation.status === 'pending' || reservation.status === 'confirmed') && (
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-blue-600 hover:bg-blue-50"
                                            title="Enviar lembrete"
                                          >
                                            <Bell className="h-4 w-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Enviar lembrete?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Será enviado um lembrete para {reservation.customer_name} sobre a reserva 
                                              em {format(parseISO(reservation.reservation_date), "dd/MM/yyyy", { locale: ptBR })} às {reservation.reservation_time}.
                                              {reservation.reminder_sent_at && (
                                                <span className="block mt-2 text-amber-600">
                                                  ⚠️ Um lembrete já foi enviado em {format(parseISO(reservation.reminder_sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
                                                </span>
                                              )}
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={async () => {
                                                toast.info('Enviando lembrete...');
                                                try {
                                                  const { data, error } = await supabase.functions.invoke('send-reservation-reminder', {
                                                    body: { reservationId: reservation.id },
                                                  });
                                                  if (error) throw error;
                                                  if (data?.error) {
                                                    toast.error(data.error === 'No webhook URL configured' 
                                                      ? 'URL de webhook não configurada' 
                                                      : data.error);
                                                  } else {
                                                    toast.success('Lembrete enviado com sucesso!');
                                                    queryClient.invalidateQueries({ queryKey: ['reservations'] });
                                                  }
                                                } catch (err) {
                                                  console.error('Error sending reminder:', err);
                                                  toast.error('Erro ao enviar lembrete');
                                                }
                                              }}
                                            >
                                              Enviar
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    )}
                                    {reservation.status === 'pending' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-green-600 hover:bg-green-50"
                                          onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: 'confirmed' })}
                                        >
                                          <CheckCircle className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-red-600 hover:bg-red-50"
                                          onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: 'cancelled' })}
                                        >
                                          <XCircle className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                    {reservation.status === 'confirmed' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: 'completed' })}
                                      >
                                        Concluir
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="past" className="mt-0">
                    {!pastReservations?.length ? (
                      <p className="text-center py-8 text-muted-foreground">
                        Nenhum histórico
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data/Hora</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead>Mesa</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pastReservations.slice(0, 20).map((reservation) => (
                              <TableRow key={reservation.id} className="opacity-75">
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span>{format(parseISO(reservation.reservation_date), 'dd/MM/yyyy')}</span>
                                    <span className="text-sm text-muted-foreground">
                                      {reservation.reservation_time}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>{reservation.customer_name}</TableCell>
                                <TableCell>Mesa {reservation.table_number}</TableCell>
                                <TableCell>
                                  <Badge
                                    className={`${statusConfig[reservation.status as keyof typeof statusConfig]?.color} text-white`}
                                  >
                                    {statusConfig[reservation.status as keyof typeof statusConfig]?.label}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        {/* New Reservation Dialog */}
        <Dialog open={isNewReservationOpen} onOpenChange={setIsNewReservationOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Nova Reserva</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customer_name">Nome do Cliente *</Label>
                  <Input
                    id="customer_name"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    placeholder="Nome completo"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer_phone">Telefone *</Label>
                  <Input
                    id="customer_phone"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer_email">E-mail</Label>
                <Input
                  id="customer_email"
                  type="email"
                  value={formData.customer_email}
                  onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="reservation_date">Data *</Label>
                  <Input
                    id="reservation_date"
                    type="date"
                    value={formData.reservation_date}
                    onChange={(e) => setFormData({ ...formData, reservation_date: e.target.value })}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reservation_time">Horário *</Label>
                  <Select
                    value={formData.reservation_time}
                    onValueChange={(value) => setFormData({ ...formData, reservation_time: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="party_size">Pessoas *</Label>
                  <Select
                    value={String(formData.party_size)}
                    onValueChange={(value) => setFormData({ ...formData, party_size: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} {n === 1 ? 'pessoa' : 'pessoas'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="table_number">Mesa *</Label>
                <Select
                  value={formData.table_number}
                  onValueChange={(value) => setFormData({ ...formData, table_number: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a mesa" />
                  </SelectTrigger>
                  <SelectContent>
                    {tableOptions.map((table) => (
                      <SelectItem key={table} value={table}>
                        Mesa {table}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Preferências, ocasiões especiais, etc."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsNewReservationOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Reserva
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
