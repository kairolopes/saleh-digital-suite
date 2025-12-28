import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Clock, Users, Phone, User, Mail, MessageSquare, CheckCircle } from "lucide-react";

interface RestaurantSettings {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  primary_color: string | null;
  accept_reservations: boolean | null;
  max_tables: number | null;
  logo_url: string | null;
}

const timeSlots = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"
];

export default function ReservaPublica() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["public-restaurant-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_settings")
        .select("id, name, phone, address, city, state, primary_color, accept_reservations, max_tables, logo_url")
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as RestaurantSettings | null;
    },
  });

  const createReservation = useMutation({
    mutationFn: async () => {
      if (!selectedDate || !selectedTime || !customerName || !customerPhone) {
        throw new Error("Preencha todos os campos obrigatórios");
      }

      const maxTables = settings?.max_tables || 20;
      const tableNumber = Math.floor(Math.random() * maxTables) + 1;

      const { data, error } = await supabase
        .from("reservations")
        .insert({
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail || null,
          table_number: tableNumber.toString(),
          party_size: parseInt(partySize),
          reservation_date: format(selectedDate, "yyyy-MM-dd"),
          reservation_time: selectedTime,
          notes: notes || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      // Send webhook for new reservation
      try {
        await supabase.functions.invoke("send-reservation-webhook", {
          body: { reservationId: data.id, action: "created" },
        });
      } catch (webhookError) {
        console.log("Webhook não configurado ou erro ao enviar");
      }

      return data;
    },
    onSuccess: () => {
      setIsSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar reserva");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDate) {
      toast.error("Selecione uma data");
      return;
    }
    if (!selectedTime) {
      toast.error("Selecione um horário");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Digite seu nome");
      return;
    }
    if (!customerPhone.trim()) {
      toast.error("Digite seu telefone");
      return;
    }

    createReservation.mutate();
  };

  if (settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (settings?.accept_reservations === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-orange-600">Reservas Indisponíveis</CardTitle>
            <CardDescription>
              No momento, o restaurante não está aceitando reservas online.
              Entre em contato pelo telefone para mais informações.
            </CardDescription>
          </CardHeader>
          {settings?.phone && (
            <CardContent className="text-center">
              <a href={`tel:${settings.phone}`} className="text-lg font-medium text-orange-600 hover:underline">
                {settings.phone}
              </a>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Reserva Enviada!</CardTitle>
            <CardDescription className="text-base mt-2">
              Sua solicitação de reserva foi recebida com sucesso. 
              Entraremos em contato para confirmar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span>{selectedDate && format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{selectedTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{partySize} {parseInt(partySize) === 1 ? "pessoa" : "pessoas"}</span>
              </div>
            </div>
            <Button 
              onClick={() => {
                setIsSuccess(false);
                setSelectedDate(undefined);
                setSelectedTime("");
                setCustomerName("");
                setCustomerPhone("");
                setCustomerEmail("");
                setNotes("");
              }} 
              variant="outline" 
              className="w-full"
            >
              Fazer nova reserva
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryColor = settings?.primary_color || "#ea580c";

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          {settings?.logo_url && (
            <img 
              src={settings.logo_url} 
              alt={settings?.name || "Restaurante"} 
              className="h-20 mx-auto mb-4 object-contain"
            />
          )}
          <h1 className="text-3xl font-bold text-gray-900" style={{ color: primaryColor }}>
            {settings?.name || "Reservas"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Faça sua reserva online de forma rápida e fácil
          </p>
          {settings?.address && (
            <p className="text-sm text-muted-foreground mt-1">
              {settings.address}{settings.city && `, ${settings.city}`}{settings.state && ` - ${settings.state}`}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" style={{ color: primaryColor }} />
                Dados da Reserva
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Date Selection */}
              <div className="space-y-2">
                <Label className="text-base font-medium">Data *</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    locale={ptBR}
                    disabled={(date) => date < new Date() || date < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="rounded-md border"
                  />
                </div>
              </div>

              {/* Time and Party Size */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Horário *
                  </Label>
                  <Select value={selectedTime} onValueChange={setSelectedTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o horário" />
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
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Pessoas *
                  </Label>
                  <Select value={partySize} onValueChange={setPartySize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} {num === 1 ? "pessoa" : "pessoas"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium flex items-center gap-2">
                  <User className="h-4 w-4" style={{ color: primaryColor }} />
                  Seus Dados
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Seu nome completo"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Telefone *
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    E-mail (opcional)
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Observações (opcional)
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Alergias, preferências, ocasião especial..."
                    rows={3}
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-lg"
                style={{ backgroundColor: primaryColor }}
                disabled={createReservation.isPending}
              >
                {createReservation.isPending ? "Enviando..." : "Solicitar Reserva"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Ao solicitar a reserva, você receberá uma confirmação em breve.
              </p>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
