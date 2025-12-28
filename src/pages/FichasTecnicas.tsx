import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, ChefHat, Eye, Pencil, Trash2, Package } from "lucide-react";
import { Link } from "react-router-dom";

type RecipeType = "prato_final" | "subproduto" | "preparo_base";

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  recipe_type: string;
  yield_quantity: number;
  yield_unit: string | null;
  preparation_time: number | null;
  is_available: boolean;
  created_at: string;
}

export default function FichasTecnicas() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    recipe_type: "prato_final" as RecipeType,
    yield_quantity: 1,
    yield_unit: "porção",
    preparation_time: 0,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recipes, isLoading } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Recipe[];
    },
  });

  const { data: recipeCosts } = useQuery({
    queryKey: ["recipe-costs"],
    queryFn: async () => {
      const { data: recipeItems, error } = await supabase
        .from("recipe_items")
        .select(`
          recipe_id,
          quantity,
          product_id,
          subrecipe_id
        `);
      if (error) throw error;

      const { data: products } = await supabase
        .from("products")
        .select("id, average_price");

      const productPrices = new Map(products?.map(p => [p.id, p.average_price]) || []);
      
      // Calculate costs per recipe
      const costs = new Map<string, number>();
      recipeItems?.forEach(item => {
        const currentCost = costs.get(item.recipe_id) || 0;
        if (item.product_id) {
          const price = productPrices.get(item.product_id) || 0;
          costs.set(item.recipe_id, currentCost + (Number(item.quantity) * Number(price)));
        }
      });
      
      return costs;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("recipes").insert({
        name: data.name.trim(),
        description: data.description.trim() || null,
        recipe_type: data.recipe_type,
        yield_quantity: data.yield_quantity,
        yield_unit: data.yield_unit,
        preparation_time: data.preparation_time || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast({ title: "Ficha técnica criada com sucesso!" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro ao criar ficha técnica", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("recipes")
        .update({
          name: data.name.trim(),
          description: data.description.trim() || null,
          recipe_type: data.recipe_type,
          yield_quantity: data.yield_quantity,
          yield_unit: data.yield_unit,
          preparation_time: data.preparation_time || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast({ title: "Ficha técnica atualizada!" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar ficha técnica", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast({ title: "Ficha técnica excluída!" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir ficha técnica", variant: "destructive" });
    },
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      const { error } = await supabase
        .from("recipes")
        .update({ is_available })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      recipe_type: "prato_final",
      yield_quantity: 1,
      yield_unit: "porção",
      preparation_time: 0,
    });
    setEditingRecipe(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setFormData({
      name: recipe.name,
      description: recipe.description || "",
      recipe_type: recipe.recipe_type as RecipeType,
      yield_quantity: recipe.yield_quantity,
      yield_unit: recipe.yield_unit || "porção",
      preparation_time: recipe.preparation_time || 0,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (editingRecipe) {
      updateMutation.mutate({ id: editingRecipe.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredRecipes = recipes?.filter((recipe) => {
    const matchesSearch = recipe.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || recipe.recipe_type === filterType;
    return matchesSearch && matchesType;
  });

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      prato_final: "Prato Final",
      subproduto: "Subproduto",
      preparo_base: "Preparo Base",
    };
    return labels[type] || type;
  };

  const getTypeBadgeVariant = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      prato_final: "default",
      subproduto: "secondary",
      preparo_base: "outline",
    };
    return variants[type] || "default";
  };

  const stats = {
    total: recipes?.length || 0,
    pratosFinal: recipes?.filter(r => r.recipe_type === "prato_final").length || 0,
    subprodutos: recipes?.filter(r => r.recipe_type === "subproduto").length || 0,
    ativos: recipes?.filter(r => r.is_available).length || 0,
  };

  return (
    <AppLayout requiredRoles={["admin", "cozinha"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Fichas Técnicas</h1>
            <p className="text-muted-foreground">
              Gerencie receitas, custos e fichas técnicas
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Ficha
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingRecipe ? "Editar Ficha Técnica" : "Nova Ficha Técnica"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Molho Bolonhesa"
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição da receita..."
                    maxLength={500}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipe_type">Tipo</Label>
                    <Select
                      value={formData.recipe_type}
                      onValueChange={(value: RecipeType) =>
                        setFormData({ ...formData, recipe_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prato_final">Prato Final</SelectItem>
                        <SelectItem value="subproduto">Subproduto</SelectItem>
                        <SelectItem value="preparo_base">Preparo Base</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preparation_time">Tempo (min)</Label>
                    <Input
                      id="preparation_time"
                      type="number"
                      min={0}
                      value={formData.preparation_time}
                      onChange={(e) =>
                        setFormData({ ...formData, preparation_time: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="yield_quantity">Rendimento</Label>
                    <Input
                      id="yield_quantity"
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={formData.yield_quantity}
                      onChange={(e) =>
                        setFormData({ ...formData, yield_quantity: parseFloat(e.target.value) || 1 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="yield_unit">Unidade</Label>
                    <Input
                      id="yield_unit"
                      value={formData.yield_unit}
                      onChange={(e) => setFormData({ ...formData, yield_unit: e.target.value })}
                      placeholder="porção, kg, L..."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingRecipe ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Fichas</CardTitle>
              <ChefHat className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pratos Finais</CardTitle>
              <ChefHat className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pratosFinal}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Subprodutos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.subprodutos}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ativos</CardTitle>
              <ChefHat className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.ativos}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="prato_final">Pratos Finais</SelectItem>
                  <SelectItem value="subproduto">Subprodutos</SelectItem>
                  <SelectItem value="preparo_base">Preparos Base</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Recipes Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Rendimento</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead className="text-right">Custo Total</TableHead>
                  <TableHead className="text-right">Custo/Porção</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filteredRecipes?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma ficha técnica encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecipes?.map((recipe) => {
                    const totalCost = recipeCosts?.get(recipe.id) || 0;
                    const costPerPortion = recipe.yield_quantity > 0 
                      ? totalCost / recipe.yield_quantity 
                      : 0;
                    
                    return (
                      <TableRow key={recipe.id}>
                        <TableCell className="font-medium">{recipe.name}</TableCell>
                        <TableCell>
                          <Badge variant={getTypeBadgeVariant(recipe.recipe_type)}>
                            {getTypeLabel(recipe.recipe_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {recipe.yield_quantity} {recipe.yield_unit}
                        </TableCell>
                        <TableCell>
                          {recipe.preparation_time ? `${recipe.preparation_time} min` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          R$ {totalCost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-primary">
                          R$ {costPerPortion.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={recipe.is_available ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={() =>
                              toggleAvailability.mutate({
                                id: recipe.id,
                                is_available: !recipe.is_available,
                              })
                            }
                          >
                            {recipe.is_available ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/fichas-tecnicas/${recipe.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(recipe)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(recipe.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
