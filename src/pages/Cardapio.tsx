import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, UtensilsCrossed } from "lucide-react";
import { SortableCategorySection } from "@/components/cardapio/SortableCategorySection";

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  recipe_type: string;
  yield_quantity: number;
  preparation_time: number | null;
  image_url: string | null;
}

interface MenuItem {
  id: string;
  recipe_id: string;
  sell_price: number;
  category: string;
  is_available: boolean;
  display_order: number | null;
  recipes?: Recipe;
}

const categories = [
  "Entradas",
  "Pratos Principais",
  "Massas",
  "Carnes",
  "Peixes",
  "Sobremesas",
  "Bebidas",
  "Porções",
  "Acompanhamentos",
];

export default function Cardapio() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState({
    recipe_id: "",
    sell_price: 0,
    category: "Pratos Principais",
    is_available: true,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch menu items with recipe details
  const { data: menuItems, isLoading } = useQuery({
    queryKey: ["menu-items-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select(`
          *,
          recipes (
            id,
            name,
            description,
            recipe_type,
            yield_quantity,
            preparation_time,
            image_url
          )
        `)
        .order("category")
        .order("display_order");
      if (error) throw error;
      return data as MenuItem[];
    },
  });

  // Fetch recipes for adding new menu items
  const { data: recipes } = useQuery({
    queryKey: ["recipes-for-menu"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, recipe_type")
        .eq("recipe_type", "prato_final")
        .order("name");
      if (error) throw error;
      return data as Recipe[];
    },
  });

  // Get recipes not already in menu
  const availableRecipes = recipes?.filter(
    (recipe) => !menuItems?.some((item) => item.recipe_id === recipe.id)
  );

  // Create menu item
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("menu_items").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items-full"] });
      toast({ title: "Item adicionado ao cardápio!" });
      resetForm();
    },
    onError: (error) => {
      console.error(error);
      toast({ title: "Erro ao adicionar item", variant: "destructive" });
    },
  });

  // Update menu item
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MenuItem> }) => {
      const { error } = await supabase
        .from("menu_items")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items-full"] });
      toast({ title: "Item atualizado!" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar item", variant: "destructive" });
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; display_order: number }[]) => {
      const promises = updates.map(({ id, display_order }) =>
        supabase.from("menu_items").update({ display_order }).eq("id", id)
      );
      const results = await Promise.all(promises);
      const error = results.find((r) => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items-full"] });
      toast({ title: "Ordem atualizada!" });
    },
    onError: () => {
      toast({ title: "Erro ao reordenar", variant: "destructive" });
    },
  });

  // Delete menu item
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items-full"] });
      toast({ title: "Item removido do cardápio!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover item", variant: "destructive" });
    },
  });

  // Toggle availability
  const toggleAvailability = (item: MenuItem) => {
    updateMutation.mutate({
      id: item.id,
      data: { is_available: !item.is_available },
    });
  };

  // Handle reorder within category
  const handleReorder = (category: string, activeId: string, overId: string) => {
    const categoryItems = menuItems?.filter((item) => item.category === category) || [];
    const oldIndex = categoryItems.findIndex((item) => item.id === activeId);
    const newIndex = categoryItems.findIndex((item) => item.id === overId);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedItems = [...categoryItems];
    const [movedItem] = reorderedItems.splice(oldIndex, 1);
    reorderedItems.splice(newIndex, 0, movedItem);

    const updates = reorderedItems.map((item, index) => ({
      id: item.id,
      display_order: index,
    }));

    reorderMutation.mutate(updates);
  };

  const resetForm = () => {
    setFormData({
      recipe_id: "",
      sell_price: 0,
      category: "Pratos Principais",
      is_available: true,
    });
    setEditingItem(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      recipe_id: item.recipe_id,
      sell_price: item.sell_price,
      category: item.category,
      is_available: item.is_available,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.recipe_id && !editingItem) {
      toast({ title: "Selecione uma receita", variant: "destructive" });
      return;
    }
    if (editingItem) {
      updateMutation.mutate({
        id: editingItem.id,
        data: {
          sell_price: formData.sell_price,
          category: formData.category,
          is_available: formData.is_available,
        },
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Filter items
  const filteredItems = menuItems?.filter((item) => {
    const matchesSearch = item.recipes?.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedItems = filteredItems?.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  return (
    <AppLayout requiredRoles={["admin", "garcom", "cozinha"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Cardápio</h1>
            <p className="text-muted-foreground">
              Gerencie os itens disponíveis para venda. Arraste para reordenar.
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Item
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Menu Items */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando...
          </div>
        ) : !filteredItems?.length ? (
          <div className="text-center py-12">
            <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              {search || selectedCategory !== "all"
                ? "Nenhum item encontrado"
                : "Nenhum item no cardápio. Adicione receitas primeiro."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedItems || {}).map(([category, items]) => (
              <SortableCategorySection
                key={category}
                category={category}
                items={items}
                onReorder={handleReorder}
                onEdit={handleEdit}
                onDelete={(id) => deleteMutation.mutate(id)}
                onToggleAvailability={toggleAvailability}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            if (!open) resetForm();
            setIsDialogOpen(open);
          }}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? "Editar Item" : "Adicionar ao Cardápio"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingItem && (
                <div className="space-y-2">
                  <Label>Receita</Label>
                  <Select
                    value={formData.recipe_id}
                    onValueChange={(v) =>
                      setFormData({ ...formData, recipe_id: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma receita" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRecipes?.map((recipe) => (
                        <SelectItem key={recipe.id} value={recipe.id}>
                          {recipe.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!availableRecipes?.length && (
                    <p className="text-sm text-muted-foreground">
                      Todas as receitas já estão no cardápio ou não há receitas
                      cadastradas.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Preço de Venda (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sell_price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sell_price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) =>
                    setFormData({ ...formData, category: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="is_available"
                  checked={formData.is_available}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_available: checked })
                  }
                />
                <Label htmlFor="is_available">Disponível para venda</Label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {editingItem ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
