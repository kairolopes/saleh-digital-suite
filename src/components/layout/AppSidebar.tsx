import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  UtensilsCrossed,
  LayoutDashboard,
  Package,
  ShoppingCart,
  BookOpen,
  ClipboardList,
  ChefHat,
  DollarSign,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Truck,
  QrCode,
} from 'lucide-react';

const menuItems = [
  { 
    title: 'Dashboard', 
    icon: LayoutDashboard, 
    path: '/', 
    roles: ['admin', 'financeiro', 'estoque', 'cozinha', 'garcom'] 
  },
  { 
    title: 'Estoque', 
    icon: Package, 
    path: '/estoque', 
    roles: ['admin', 'estoque'] 
  },
  { 
    title: 'Compras', 
    icon: ShoppingCart, 
    path: '/compras', 
    roles: ['admin', 'estoque'] 
  },
  { 
    title: 'Fornecedores', 
    icon: Truck, 
    path: '/fornecedores', 
    roles: ['admin', 'estoque'] 
  },
  { 
    title: 'Histórico Preços', 
    icon: BarChart3, 
    path: '/historico-precos', 
    roles: ['admin', 'estoque', 'financeiro'] 
  },
  { 
    title: 'Fichas Técnicas', 
    icon: BookOpen, 
    path: '/fichas-tecnicas', 
    roles: ['admin', 'cozinha'] 
  },
  { 
    title: 'Cardápio', 
    icon: ClipboardList, 
    path: '/cardapio', 
    roles: ['admin', 'garcom', 'cozinha'] 
  },
  { 
    title: 'Pedidos', 
    icon: ClipboardList, 
    path: '/pedidos', 
    roles: ['admin', 'garcom', 'cozinha'] 
  },
  { 
    title: 'Cozinha', 
    icon: ChefHat, 
    path: '/cozinha', 
    roles: ['admin', 'cozinha'] 
  },
  { 
    title: 'Financeiro', 
    icon: DollarSign, 
    path: '/financeiro', 
    roles: ['admin', 'financeiro'] 
  },
  { 
    title: 'Relatórios', 
    icon: BarChart3, 
    path: '/relatorios', 
    roles: ['admin', 'financeiro'] 
  },
  { 
    title: 'Usuários', 
    icon: Users, 
    path: '/usuarios', 
    roles: ['admin'] 
  },
  { 
    title: 'QR Codes Mesas', 
    icon: QrCode, 
    path: '/qrcodes', 
    roles: ['admin'] 
  },
  { 
    title: 'Configurações', 
    icon: Settings, 
    path: '/configuracoes', 
    roles: ['admin'] 
  },
];

export function AppSidebar() {
  const { user, roles, signOut, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const visibleItems = menuItems.filter(item => 
    item.roles.some(role => hasRole(role as any))
  );

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const userInitials = user?.email?.substring(0, 2).toUpperCase() || 'U';
  const roleBadge = roles.includes('admin') ? 'Admin' 
    : roles.includes('financeiro') ? 'Financeiro'
    : roles.includes('estoque') ? 'Estoque'
    : roles.includes('cozinha') ? 'Cozinha'
    : roles.includes('garcom') ? 'Garçom'
    : 'Cliente';

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
            <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-sidebar-foreground">
              Saleh Digital
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              Gestão de Restaurante
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.path)}
                    isActive={location.pathname === item.path}
                    className="transition-all duration-200"
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.email}
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              {roleBadge}
            </span>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}