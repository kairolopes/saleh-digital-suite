import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Estoque from "./pages/Estoque";
import Compras from "./pages/Compras";
import Fornecedores from "./pages/Fornecedores";
import HistoricoPrecos from "./pages/HistoricoPrecos";
import FichasTecnicas from "./pages/FichasTecnicas";
import Cardapio from "./pages/Cardapio";
import Pedidos from "./pages/Pedidos";
import Cozinha from "./pages/Cozinha";
import Financeiro from "./pages/Financeiro";
import Cliente from "./pages/Cliente";
import QRCodeMesas from "./pages/QRCodeMesas";
import Usuarios from "./pages/Usuarios";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import Reservas from "./pages/Reservas";
import ReservaPublica from "./pages/ReservaPublica";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/fornecedores" element={<Fornecedores />} />
            <Route path="/historico-precos" element={<HistoricoPrecos />} />
            <Route path="/fichas-tecnicas" element={<FichasTecnicas />} />
            <Route path="/cardapio" element={<Cardapio />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/cozinha" element={<Cozinha />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/cliente" element={<Cliente />} />
            <Route path="/qrcodes" element={<QRCodeMesas />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/reservas" element={<Reservas />} />
            <Route path="/reservar" element={<ReservaPublica />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;