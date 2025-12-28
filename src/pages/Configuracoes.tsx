import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Settings, 
  Building2, 
  Clock, 
  Palette,
  Save,
  Loader2,
  Webhook
} from 'lucide-react';

interface OperatingHours {
  open: string;
  close: string;
  closed: boolean;
}

interface RestaurantSettings {
  id: string;
  name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  cnpj: string | null;
  description: string | null;
  primary_color: string | null;
  operating_hours: Record<string, OperatingHours>;
  accept_reservations: boolean;
  max_tables: number;
  default_order_type: string;
  reservation_webhook_url: string | null;
}

const dayNames: Record<string, string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function Configuracoes() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<RestaurantSettings>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return {
        ...data,
        operating_hours: data.operating_hours as unknown as Record<string, OperatingHours>,
      } as RestaurantSettings;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<RestaurantSettings>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = { ...updates };
      const { error } = await supabase
        .from('restaurant_settings')
        .update(payload)
        .eq('id', settings?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
      toast.success('Configurações salvas com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao salvar configurações');
    },
  });

  const handleInputChange = (field: keyof RestaurantSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleHoursChange = (day: string, field: keyof OperatingHours, value: any) => {
    const currentHours = formData.operating_hours || settings?.operating_hours || {};
    const updatedHours = {
      ...currentHours,
      [day]: {
        ...currentHours[day],
        [field]: value,
      },
    };
    setFormData(prev => ({ ...prev, operating_hours: updatedHours }));
  };

  const handleSave = () => {
    if (Object.keys(formData).length === 0) {
      toast.info('Nenhuma alteração para salvar');
      return;
    }
    updateMutation.mutate(formData);
    setFormData({});
  };

  const getValue = <T extends keyof RestaurantSettings>(field: T): RestaurantSettings[T] | undefined => {
    return formData[field] !== undefined ? formData[field] as RestaurantSettings[T] : settings?.[field];
  };

  const getHours = (day: string): OperatingHours => {
    const hours = formData.operating_hours || settings?.operating_hours || {};
    return hours[day] || { open: '08:00', close: '22:00', closed: false };
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              Configurações
            </h1>
            <p className="text-muted-foreground">
              Personalize seu restaurante e configure o sistema
            </p>
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Alterações
          </Button>
        </div>

        <Tabs defaultValue="dados" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="dados" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Dados do Estabelecimento</span>
              <span className="sm:hidden">Dados</span>
            </TabsTrigger>
            <TabsTrigger value="horarios" className="gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Horário de Funcionamento</span>
              <span className="sm:hidden">Horários</span>
            </TabsTrigger>
            <TabsTrigger value="sistema" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurações do Sistema</span>
              <span className="sm:hidden">Sistema</span>
            </TabsTrigger>
          </TabsList>

          {/* Dados do Estabelecimento */}
          <TabsContent value="dados" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Informações Básicas</CardTitle>
                  <CardDescription>
                    Dados principais do restaurante
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Restaurante</Label>
                    <Input
                      id="name"
                      value={getValue('name') || ''}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Nome do restaurante"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={getValue('description') || ''}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="Breve descrição do restaurante"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input
                      id="cnpj"
                      value={getValue('cnpj') || ''}
                      onChange={(e) => handleInputChange('cnpj', e.target.value)}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Contato</CardTitle>
                  <CardDescription>
                    Informações de contato
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={getValue('phone') || ''}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={getValue('email') || ''}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="contato@restaurante.com"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Endereço</CardTitle>
                  <CardDescription>
                    Localização do estabelecimento
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="address">Endereço</Label>
                      <Input
                        id="address"
                        value={getValue('address') || ''}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        placeholder="Rua, número, bairro"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        value={getValue('city') || ''}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">Estado</Label>
                      <Input
                        id="state"
                        value={getValue('state') || ''}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        placeholder="UF"
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zip_code">CEP</Label>
                      <Input
                        id="zip_code"
                        value={getValue('zip_code') || ''}
                        onChange={(e) => handleInputChange('zip_code', e.target.value)}
                        placeholder="00000-000"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Horário de Funcionamento */}
          <TabsContent value="horarios">
            <Card>
              <CardHeader>
                <CardTitle>Horário de Funcionamento</CardTitle>
                <CardDescription>
                  Configure os horários de abertura e fechamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {dayOrder.map((day) => {
                    const hours = getHours(day);
                    return (
                      <div
                        key={day}
                        className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-card"
                      >
                        <div className="flex items-center justify-between sm:w-40">
                          <span className="font-medium">{dayNames[day]}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!hours.closed}
                            onCheckedChange={(checked) => handleHoursChange(day, 'closed', !checked)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {hours.closed ? 'Fechado' : 'Aberto'}
                          </span>
                        </div>

                        {!hours.closed && (
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`${day}-open`} className="text-sm text-muted-foreground whitespace-nowrap">
                                Abre:
                              </Label>
                              <Input
                                id={`${day}-open`}
                                type="time"
                                value={hours.open}
                                onChange={(e) => handleHoursChange(day, 'open', e.target.value)}
                                className="w-32"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`${day}-close`} className="text-sm text-muted-foreground whitespace-nowrap">
                                Fecha:
                              </Label>
                              <Input
                                id={`${day}-close`}
                                type="time"
                                value={hours.close}
                                onChange={(e) => handleHoursChange(day, 'close', e.target.value)}
                                className="w-32"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configurações do Sistema */}
          <TabsContent value="sistema" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Operação</CardTitle>
                  <CardDescription>
                    Configurações operacionais do restaurante
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Aceitar Reservas</Label>
                      <p className="text-sm text-muted-foreground">
                        Permitir que clientes façam reservas
                      </p>
                    </div>
                    <Switch
                      checked={getValue('accept_reservations') ?? true}
                      onCheckedChange={(checked) => handleInputChange('accept_reservations', checked)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_tables">Número Máximo de Mesas</Label>
                    <Input
                      id="max_tables"
                      type="number"
                      value={getValue('max_tables') || 20}
                      onChange={(e) => handleInputChange('max_tables', parseInt(e.target.value) || 0)}
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reservation_webhook_url" className="flex items-center gap-2">
                      <Webhook className="h-4 w-4" />
                      Webhook de Reservas
                    </Label>
                    <Input
                      id="reservation_webhook_url"
                      value={getValue('reservation_webhook_url') || ''}
                      onChange={(e) => handleInputChange('reservation_webhook_url', e.target.value)}
                      placeholder="https://sua-plataforma.com/webhook"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL para receber notificações quando reservas forem confirmadas ou canceladas.
                      Os campos enviados são: customer_name, customer_phone, customer_email, table_number, 
                      party_size, reservation_date, reservation_time, status, notes, restaurant_name, action.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Personalização
                  </CardTitle>
                  <CardDescription>
                    Aparência do sistema
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="logo_url">URL do Logo</Label>
                    <Input
                      id="logo_url"
                      value={getValue('logo_url') || ''}
                      onChange={(e) => handleInputChange('logo_url', e.target.value)}
                      placeholder="https://exemplo.com/logo.png"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="primary_color">Cor Principal</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primary_color"
                        type="color"
                        value={getValue('primary_color') || '#ea580c'}
                        onChange={(e) => handleInputChange('primary_color', e.target.value)}
                        className="w-16 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={getValue('primary_color') || '#ea580c'}
                        onChange={(e) => handleInputChange('primary_color', e.target.value)}
                        placeholder="#ea580c"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
