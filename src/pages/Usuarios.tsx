import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Users, Shield, Search, Trash2, Edit, UserCog } from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
  estoque: "Estoque",
  cozinha: "Cozinha",
  garcom: "Garçom",
  cliente: "Cliente",
};

const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  financeiro: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  estoque: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cozinha: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  garcom: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  cliente: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

const ALL_ROLES: AppRole[] = ["admin", "financeiro", "estoque", "cozinha", "garcom", "cliente"];

interface UserWithRoles {
  id: string;
  full_name: string;
  phone: string | null;
  created_at: string | null;
  roles: AppRole[];
}

export default function Usuarios() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [deletingUser, setDeletingUser] = useState<UserWithRoles | null>(null);

  // Fetch all profiles
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch all user roles
  const { data: userRoles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (error) throw error;
      return data;
    },
  });

  // Combine profiles with roles
  const usersWithRoles: UserWithRoles[] = profiles.map((profile) => ({
    ...profile,
    roles: userRoles
      .filter((ur) => ur.user_id === profile.id)
      .map((ur) => ur.role as AppRole),
  }));

  // Filter by search
  const filteredUsers = usersWithRoles.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.phone?.includes(searchTerm)
  );

  // Update roles mutation
  const updateRoles = useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: AppRole[] }) => {
      // Get current roles
      const currentRoles = userRoles
        .filter((ur) => ur.user_id === userId)
        .map((ur) => ur.role as AppRole);

      // Roles to add
      const rolesToAdd = roles.filter((r) => !currentRoles.includes(r));
      // Roles to remove
      const rolesToRemove = currentRoles.filter((r) => !roles.includes(r));

      // Add new roles
      if (rolesToAdd.length > 0) {
        const { error } = await supabase.from("user_roles").insert(
          rolesToAdd.map((role) => ({ user_id: userId, role }))
        );
        if (error) throw error;
      }

      // Remove roles
      for (const role of rolesToRemove) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Permissões atualizadas");
      setEditingUser(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar permissões");
    },
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Usuário excluído");
      setDeletingUser(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir usuário");
    },
  });

  const handleEditRoles = (userToEdit: UserWithRoles) => {
    setEditingUser(userToEdit);
    setSelectedRoles(userToEdit.roles);
  };

  const handleSaveRoles = () => {
    if (editingUser) {
      updateRoles.mutate({ userId: editingUser.id, roles: selectedRoles });
    }
  };

  const toggleRole = (role: AppRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const isLoading = loadingProfiles || loadingRoles;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserCog className="w-6 h-6" />
              Gestão de Usuários
            </h1>
            <p className="text-muted-foreground">
              Gerencie usuários e suas permissões
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Usuários
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{usersWithRoles.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Administradores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {usersWithRoles.filter((u) => u.roles.includes("admin")).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Funcionários
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {
                  usersWithRoles.filter((u) =>
                    u.roles.some((r) =>
                      ["financeiro", "estoque", "cozinha", "garcom"].includes(r)
                    )
                  ).length
                }
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Clientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {
                  usersWithRoles.filter(
                    (u) => u.roles.length === 1 && u.roles.includes("cliente")
                  ).length
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((userItem) => (
                      <TableRow key={userItem.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Users className="w-4 h-4 text-primary" />
                            </div>
                            <span className="font-medium">{userItem.full_name}</span>
                            {userItem.id === user?.id && (
                              <Badge variant="outline" className="text-xs">
                                Você
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{userItem.phone || "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {userItem.roles.length === 0 ? (
                              <span className="text-muted-foreground text-sm">
                                Sem permissões
                              </span>
                            ) : (
                              userItem.roles.map((role) => (
                                <Badge
                                  key={role}
                                  variant="secondary"
                                  className={ROLE_COLORS[role]}
                                >
                                  {ROLE_LABELS[role]}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {userItem.created_at
                            ? new Date(userItem.created_at).toLocaleDateString("pt-BR")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditRoles(userItem)}
                              title="Editar permissões"
                            >
                              <Shield className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingUser(userItem)}
                              disabled={userItem.id === user?.id}
                              title="Excluir usuário"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Roles Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Editar Permissões
            </DialogTitle>
            <DialogDescription>
              {editingUser?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {ALL_ROLES.map((role) => (
              <div key={role} className="flex items-center space-x-3">
                <Checkbox
                  id={role}
                  checked={selectedRoles.includes(role)}
                  onCheckedChange={() => toggleRole(role)}
                />
                <label
                  htmlFor={role}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Badge variant="secondary" className={ROLE_COLORS[role]}>
                    {ROLE_LABELS[role]}
                  </Badge>
                </label>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRoles} disabled={updateRoles.isPending}>
              {updateRoles.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingUser?.full_name}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteUser.mutate(deletingUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
