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
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, X } from "lucide-react";

interface Product {
  id: string;
  name: string;
  unit: string;
  average_price: number;
}

interface Recipe {
  id: string;
  name: string;
  recipe_type: string;
  yield_quantity: number;
  yield_unit: string | null;
  is_available: boolean;
  created_at: string;
}

interface RecipeItem {
  id: string;
  recipe_id: string;
  product_id: string | null;
  subrecipe_id: string | null;
  quantity: number;
  unit: string;
}

interface RecipeFormData {
  is_subproduct: boolean;
  name: string;
  yield_quantity: number;
  profit_percent: number;
  ingredients: {
    product_id: string | null;
    subrecipe_id: string | null;
    quantity: number;
    unit: string;
  }[];
}

// Helper to parse decimal input (accepts both . and ,)
const parseDecimal = (value: string): number => {
  const normalized = value.replace(",", ".");
  return parseFloat(normalized) || 0;
};

export default function FichasTecnicas() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [formData, setFormData] = useState<RecipeFormData>({
    is_subproduct: false,
    name: "",
    yield_quantity: 1,
    profit_percent: 0,
    ingredients: [],
  });
  const [ingredientType, setIngredientType] = useState<"product" | "subrecipe">("product");
  const [currentIngredient, setCurrentIngredient] = useState({
    item_id: "",
    quantity: "",
    unit: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch recipes
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

  // Fetch subproducts (SP recipes that can be used as ingredients)
  const subproducts = recipes?.filter((r) => r.recipe_type === "subproduto") || [];

  // Fetch products (insumos)
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, average_price")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  // Fetch recipe items for all recipes
  const { data: allRecipeItems } = useQuery({
    queryKey: ["all-recipe-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipe_items").select("*");
      if (error) throw error;
      return data as RecipeItem[];
    },
  });

  // Fetch menu items for sell prices
  const { data: menuItems } = useQuery({
    queryKey: ["menu-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("recipe_id, sell_price");
      if (error) throw error;
      return data;
    },
  });

  // Calculate recipe cost
  const calculateRecipeCost = (recipeId: string): number => {
    const items = allRecipeItems?.filter((i) => i.recipe_id === recipeId) || [];
    let totalCost = 0;

    items.forEach((item) => {
      if (item.product_id) {
        const product = products?.find((p) => p.id === item.product_id);
        if (product) {
          totalCost += Number(item.quantity) * Number(product.average_price);
        }
      } else if (item.subrecipe_id) {
        const subCost = calculateRecipeCost(item.subrecipe_id);
        const subRecipe = recipes?.find((r) => r.id === item.subrecipe_id);
        if (subRecipe && subRecipe.yield_quantity > 0) {
          totalCost += (subCost / subRecipe.yield_quantity) * Number(item.quantity);
        }
      }
    });

    return totalCost;
  };

  // Create recipe mutation
  const createMutation = useMutation({
    mutationFn: async (data: RecipeFormData) => {
      const { data: newRecipe, error: recipeError } = await supabase
        .from("recipes")
        .insert({
          name: data.is_subproduct ? `SP ${data.name}` : data.name,
          recipe_type: data.is_subproduct ? "subproduto" : "prato_final",
          yield_quantity: data.yield_quantity,
          yield_unit: "porções",
        })
        .select()
        .single();

      if (recipeError) throw recipeError;

      if (data.ingredients.length > 0) {
        const items = data.ingredients.map((ing) => ({
          recipe_id: newRecipe.id,
          product_id: ing.product_id || null,
          subrecipe_id: ing.subrecipe_id || null,
          quantity: ing.quantity,
          unit: ing.unit,
        }));

        const { error: itemsError } = await supabase
          .from("recipe_items")
          .insert(items);
        if (itemsError) throw itemsError;
      }

      // Calculate sell price based on cost + profit%
      const totalCost = data.ingredients.reduce((sum, ing) => {
        if (ing.product_id) {
          const product = products?.find((p) => p.id === ing.product_id);
          return sum + (product ? Number(product.average_price) * ing.quantity : 0);
        } else if (ing.subrecipe_id) {
          const subCost = calculateRecipeCostTemp(ing.subrecipe_id);
          const sub = recipes?.find((r) => r.id === ing.subrecipe_id);
          return sum + (sub ? (subCost / sub.yield_quantity) * ing.quantity : 0);
        }
        return sum;
      }, 0);
      const costPerPortion = totalCost / data.yield_quantity;
      const sellPrice = costPerPortion * (1 + data.profit_percent / 100);
      
      // Helper function to calculate subrecipe cost
      function calculateRecipeCostTemp(recipeId: string): number {
        const items = allRecipeItems?.filter((i) => i.recipe_id === recipeId) || [];
        let cost = 0;
        items.forEach((item) => {
          if (item.product_id) {
            const product = products?.find((p) => p.id === item.product_id);
            if (product) cost += Number(item.quantity) * Number(product.average_price);
          }
        });
        return cost;
      }

      if (sellPrice > 0) {
        const { error: menuError } = await supabase.from("menu_items").insert({
          recipe_id: newRecipe.id,
          sell_price: sellPrice,
          category: "Pratos",
        });
        if (menuError) throw menuError;
      }

      return newRecipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["all-recipe-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      toast({ title: "Ficha técnica criada com sucesso!" });
      resetForm();
    },
    onError: (error) => {
      console.error(error);
      toast({ title: "Erro ao criar ficha técnica", variant: "destructive" });
    },
  });

  // Update recipe mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RecipeFormData }) => {
      const { error: recipeError } = await supabase
        .from("recipes")
        .update({
          name: data.is_subproduct ? `SP ${data.name.replace(/^SP\s*/i, "")}` : data.name.replace(/^SP\s*/i, ""),
          recipe_type: data.is_subproduct ? "subproduto" : "prato_final",
          yield_quantity: data.yield_quantity,
        })
        .eq("id", id);

      if (recipeError) throw recipeError;

      await supabase.from("recipe_items").delete().eq("recipe_id", id);

      if (data.ingredients.length > 0) {
        const items = data.ingredients.map((ing) => ({
          recipe_id: id,
          product_id: ing.product_id || null,
          subrecipe_id: ing.subrecipe_id || null,
          quantity: ing.quantity,
          unit: ing.unit,
        }));

        const { error: itemsError } = await supabase
          .from("recipe_items")
          .insert(items);
        if (itemsError) throw itemsError;
      }

      // Calculate sell price based on cost + profit%
      const totalCost = data.ingredients.reduce((sum, ing) => {
        if (ing.product_id) {
          const product = products?.find((p) => p.id === ing.product_id);
          return sum + (product ? Number(product.average_price) * ing.quantity : 0);
        } else if (ing.subrecipe_id) {
          const subCost = calculateRecipeCost(ing.subrecipe_id);
          const sub = recipes?.find((r) => r.id === ing.subrecipe_id);
          return sum + (sub ? (subCost / sub.yield_quantity) * ing.quantity : 0);
        }
        return sum;
      }, 0);
      const costPerPortion = totalCost / data.yield_quantity;
      const sellPrice = costPerPortion * (1 + data.profit_percent / 100);

      const existingMenuItem = menuItems?.find((m) => m.recipe_id === id);
      if (existingMenuItem) {
        await supabase
          .from("menu_items")
          .update({ sell_price: sellPrice })
          .eq("recipe_id", id);
      } else if (sellPrice > 0) {
        await supabase.from("menu_items").insert({
          recipe_id: id,
          sell_price: sellPrice,
          category: "Pratos",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["all-recipe-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      toast({ title: "Ficha técnica atualizada!" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar ficha técnica", variant: "destructive" });
    },
  });

  // Delete recipe mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("recipe_items").delete().eq("recipe_id", id);
      await supabase.from("menu_items").delete().eq("recipe_id", id);
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["all-recipe-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      toast({ title: "Ficha técnica excluída!" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir ficha técnica", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      is_subproduct: false,
      name: "",
      yield_quantity: 1,
      profit_percent: 0,
      ingredients: [],
    });
    setIngredientType("product");
    setCurrentIngredient({ item_id: "", quantity: "", unit: "" });
    setEditingRecipe(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (recipe: Recipe) => {
    const recipeItems = allRecipeItems?.filter((i) => i.recipe_id === recipe.id) || [];
    const menuItem = menuItems?.find((m) => m.recipe_id === recipe.id);
    const isSubproduct = recipe.recipe_type === "subproduto" || recipe.name.startsWith("SP ");

    // Map all ingredients including subrecipes
    const ingredients = recipeItems.map((i) => ({
      product_id: i.product_id,
      subrecipe_id: i.subrecipe_id,
      quantity: Number(i.quantity),
      unit: i.unit,
    }));

    // Calculate total cost including subrecipes
    const totalCost = ingredients.reduce((sum, ing) => {
      if (ing.product_id) {
        const product = products?.find((p) => p.id === ing.product_id);
        return sum + (product ? Number(product.average_price) * ing.quantity : 0);
      } else if (ing.subrecipe_id) {
        const subCost = calculateRecipeCost(ing.subrecipe_id);
        const sub = recipes?.find((r) => r.id === ing.subrecipe_id);
        return sum + (sub ? (subCost / sub.yield_quantity) * ing.quantity : 0);
      }
      return sum;
    }, 0);
    const costPerPortion = totalCost / recipe.yield_quantity;
    const sellPrice = menuItem?.sell_price || 0;
    const profitPercent = costPerPortion > 0 ? ((sellPrice - costPerPortion) / costPerPortion) * 100 : 0;

    setEditingRecipe(recipe);
    setFormData({
      is_subproduct: isSubproduct,
      name: recipe.name.replace(/^SP\s*/i, ""),
      yield_quantity: recipe.yield_quantity,
      profit_percent: Math.round(profitPercent * 100) / 100,
      ingredients,
    });
    setIngredientType("product");
    setCurrentIngredient({ item_id: "", quantity: "", unit: "" });
    setIsDialogOpen(true);
  };

  const handleAddIngredient = () => {
    const qty = parseDecimal(currentIngredient.quantity);
    if (!currentIngredient.item_id || qty <= 0) {
      toast({ title: "Selecione um insumo e quantidade válida", variant: "destructive" });
      return;
    }

    let unit = currentIngredient.unit;
    let product_id: string | null = null;
    let subrecipe_id: string | null = null;

    if (ingredientType === "product") {
      const product = products?.find((p) => p.id === currentIngredient.item_id);
      unit = unit || product?.unit || "";
      product_id = currentIngredient.item_id;
    } else {
      const sub = recipes?.find((r) => r.id === currentIngredient.item_id);
      unit = unit || sub?.yield_unit || "porção";
      subrecipe_id = currentIngredient.item_id;
    }

    setFormData({
      ...formData,
      ingredients: [
        ...formData.ingredients,
        {
          product_id,
          subrecipe_id,
          quantity: qty,
          unit,
        },
      ],
    });
    setCurrentIngredient({ item_id: "", quantity: "", unit: "" });
  };

  const handleRemoveIngredient = (index: number) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter((_, i) => i !== index),
    });
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

  // Calculate ingredient cost based on average price * quantity (for products or subrecipes)
  const getIngredientCost = (productId: string | null, subrecipeId: string | null, quantity: number): number => {
    if (productId) {
      const product = products?.find((p) => p.id === productId);
      if (!product) return 0;
      return Number(product.average_price) * quantity;
    } else if (subrecipeId) {
      const subCost = calculateRecipeCost(subrecipeId);
      const sub = recipes?.find((r) => r.id === subrecipeId);
      if (!sub) return 0;
      return (subCost / sub.yield_quantity) * quantity;
    }
    return 0;
  };

  // Get current ingredient cost for form display
  const getCurrentIngredientCost = (): number => {
    const qty = parseDecimal(currentIngredient.quantity);
    if (ingredientType === "product") {
      return getIngredientCost(currentIngredient.item_id, null, qty);
    } else {
      return getIngredientCost(null, currentIngredient.item_id, qty);
    }
  };

  // Get total cost of form ingredients
  const getFormTotalCost = (): number => {
    return formData.ingredients.reduce((total, ing) => {
      return total + getIngredientCost(ing.product_id, ing.subrecipe_id, ing.quantity);
    }, 0);
  };

  // Calculate sell price: cost + profit%
  const getFormSellPrice = (): number => {
    const costPerPortion = getFormTotalCost() / formData.yield_quantity;
    return costPerPortion * (1 + formData.profit_percent / 100);
  };

  const filteredRecipes = recipes?.filter((recipe) =>
    recipe.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout requiredRoles={["admin", "cozinha"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Fichas técnicas de pratos</h1>
            <p className="text-muted-foreground">
              Monte o prato usando os insumos do estoque para ver custo e CMV.
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Ficha
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Recipe Cards */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredRecipes?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma ficha técnica encontrada
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {filteredRecipes?.map((recipe) => {
              const totalCost = calculateRecipeCost(recipe.id);
              const costPerPortion = recipe.yield_quantity > 0 ? totalCost / recipe.yield_quantity : 0;
              const menuItem = menuItems?.find((m) => m.recipe_id === recipe.id);
              const sellPrice = menuItem?.sell_price || 0;
              const profit = sellPrice - costPerPortion;
              const profitPercent = costPerPortion > 0 ? (profit / costPerPortion) * 100 : 0;
              const cmvPercent = sellPrice > 0 ? (costPerPortion / sellPrice) * 100 : 0;
              const markup = costPerPortion > 0 ? sellPrice / costPerPortion : 0;
              const recipeIngredients = allRecipeItems?.filter((i) => i.recipe_id === recipe.id) || [];

              // CMV suggestions (price = cost / CMV%)
              const price30 = costPerPortion / 0.3;
              const price40 = costPerPortion / 0.4;
              const price50 = costPerPortion / 0.5;

              return (
                <Card key={recipe.id} className="bg-card border-border">
                  <CardContent className="p-6">
                    {/* Header with name and actions */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-foreground">{recipe.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Rendimento: {recipe.yield_quantity} porções
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(recipe)}
                          className="text-primary hover:text-primary/80"
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(recipe.id)}
                          className="text-destructive hover:text-destructive/80"
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>

                    {/* Cost and Price Section */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Custo total da receita</p>
                        <p className="text-2xl font-bold text-primary">
                          R$ {totalCost.toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Custo por porção: R$ {costPerPortion.toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          CMV sobre venda: {cmvPercent.toFixed(1)}%
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Markup real: {markup.toFixed(2)}x
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Preço de venda</p>
                        <p className="text-2xl font-bold text-foreground">
                          R$ {sellPrice.toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Lucro unitário: R$ {profit.toFixed(2)}
                        </p>
                        <p className="text-sm text-green-600">
                          Lucro: {profitPercent.toFixed(1)}%
                        </p>
                        <div className="mt-2">
                          <p className="text-sm text-muted-foreground">Sugestão de preço por CMV:</p>
                          <p className="text-sm text-muted-foreground">
                            30% CMV: R$ {price30.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            40% CMV: R$ {price40.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            50% CMV: R$ {price50.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Ingredients Table */}
                    <div className="border-t border-border pt-4">
                      <p className="text-sm text-muted-foreground mb-2">Ingredientes da ficha</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 text-muted-foreground font-medium">Insumo</th>
                              <th className="text-center py-2 text-muted-foreground font-medium">Qtd.</th>
                              <th className="text-center py-2 text-muted-foreground font-medium">Unid.</th>
                              <th className="text-right py-2 text-muted-foreground font-medium">Custo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recipeIngredients.map((item) => {
                              const product = products?.find((p) => p.id === item.product_id);
                              const subrecipe = recipes?.find((r) => r.id === item.subrecipe_id);
                              const name = product?.name || (subrecipe ? `SB ${subrecipe.name}` : "N/A");
                              
                              let itemCost = 0;
                              if (item.product_id && product) {
                                itemCost = Number(item.quantity) * Number(product.average_price);
                              } else if (item.subrecipe_id && subrecipe) {
                                const subCost = calculateRecipeCost(item.subrecipe_id);
                                itemCost = (subCost / subrecipe.yield_quantity) * Number(item.quantity);
                              }

                              return (
                                <tr key={item.id} className="border-b border-border/50">
                                  <td className="py-2 text-primary">{name}</td>
                                  <td className="text-center py-2">{Number(item.quantity).toFixed(2)}</td>
                                  <td className="text-center py-2">{item.unit}</td>
                                  <td className="text-right py-2">R$ {itemCost.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRecipe ? "Editar Ficha Técnica" : "Nova Ficha Técnica"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* SP Toggle */}
              <div className="flex items-center gap-4">
                <Switch
                  id="is_subproduct"
                  checked={formData.is_subproduct}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_subproduct: checked })
                  }
                />
                <Label htmlFor="is_subproduct" className="flex flex-col">
                  <span>É Subproduto (SP)</span>
                  <span className="text-xs text-muted-foreground">
                    Marque se este prato pode ser usado como insumo em outros pratos
                  </span>
                </Label>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Prato *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Arroz Branco Cozido"
                  maxLength={100}
                />
              </div>

              {/* Yield and Profit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="yield">Rendimento (porções)</Label>
                  <Input
                    id="yield"
                    type="text"
                    inputMode="decimal"
                    value={formData.yield_quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, yield_quantity: parseDecimal(e.target.value) || 1 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profit_percent">Lucro (%)</Label>
                  <Input
                    id="profit_percent"
                    type="text"
                    inputMode="decimal"
                    value={formData.profit_percent}
                    onChange={(e) =>
                      setFormData({ ...formData, profit_percent: parseDecimal(e.target.value) })
                    }
                    placeholder="Ex: 10 para 10%"
                  />
                  <p className="text-xs text-muted-foreground">
                    Preço = Custo + {formData.profit_percent}%
                  </p>
                </div>
              </div>

              {/* Ingredients Section */}
              <div className="space-y-4">
                <Label>Ingredientes da Ficha Técnica</Label>
                
                {/* Add ingredient row */}
                <div className="space-y-2">
                  {/* Ingredient type selector */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={ingredientType === "product" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setIngredientType("product");
                        setCurrentIngredient({ item_id: "", quantity: "", unit: "" });
                      }}
                    >
                      Insumo do Estoque
                    </Button>
                    <Button
                      type="button"
                      variant={ingredientType === "subrecipe" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setIngredientType("subrecipe");
                        setCurrentIngredient({ item_id: "", quantity: "", unit: "" });
                      }}
                      disabled={subproducts.length === 0}
                    >
                      Subproduto (SP)
                    </Button>
                  </div>

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">
                        {ingredientType === "product" ? "Insumo" : "Subproduto (SP)"}
                      </Label>
                      <Select
                        value={currentIngredient.item_id}
                        onValueChange={(value) => {
                          if (ingredientType === "product") {
                            const product = products?.find((p) => p.id === value);
                            setCurrentIngredient({
                              item_id: value,
                              quantity: currentIngredient.quantity,
                              unit: product?.unit || "",
                            });
                          } else {
                            const sub = recipes?.find((r) => r.id === value);
                            setCurrentIngredient({
                              item_id: value,
                              quantity: currentIngredient.quantity,
                              unit: sub?.yield_unit || "porção",
                            });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredientType === "product"
                            ? products?.map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name}
                                </SelectItem>
                              ))
                            : subproducts
                                .filter((sp) => sp.id !== editingRecipe?.id) // Exclude self
                                .map((sp) => (
                                  <SelectItem key={sp.id} value={sp.id}>
                                    {sp.name}
                                  </SelectItem>
                                ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <Label className="text-xs text-muted-foreground">Qtd.</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={currentIngredient.quantity}
                        onChange={(e) =>
                          setCurrentIngredient({
                            ...currentIngredient,
                            quantity: e.target.value,
                          })
                        }
                        placeholder="0,05"
                      />
                    </div>
                    <div className="w-20">
                      <Label className="text-xs text-muted-foreground">Unid.</Label>
                      <Input
                        value={currentIngredient.unit}
                        onChange={(e) =>
                          setCurrentIngredient({ ...currentIngredient, unit: e.target.value })
                        }
                        placeholder="kg"
                      />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs text-muted-foreground">Custo Est.</Label>
                      <div className="h-10 flex items-center text-sm">
                        R$ {getCurrentIngredientCost().toFixed(2)}
                      </div>
                    </div>
                    <Button type="button" size="icon" onClick={handleAddIngredient}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Ingredients list */}
                {formData.ingredients.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium">Insumo</th>
                          <th className="text-center py-2 px-3 font-medium">Qtd.</th>
                          <th className="text-center py-2 px-3 font-medium">Unid.</th>
                          <th className="text-right py-2 px-3 font-medium">Custo</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.ingredients.map((ing, index) => {
                          const product = ing.product_id ? products?.find((p) => p.id === ing.product_id) : null;
                          const subrecipe = ing.subrecipe_id ? recipes?.find((r) => r.id === ing.subrecipe_id) : null;
                          const name = product?.name || (subrecipe ? `SP ${subrecipe.name}` : "N/A");
                          const cost = getIngredientCost(ing.product_id, ing.subrecipe_id, ing.quantity);
                          return (
                            <tr key={index} className="border-t border-border">
                              <td className="py-2 px-3">{name}</td>
                              <td className="text-center py-2 px-3">{ing.quantity.toFixed(3)}</td>
                              <td className="text-center py-2 px-3">{ing.unit}</td>
                              <td className="text-right py-2 px-3">R$ {cost.toFixed(2)}</td>
                              <td className="py-2 px-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleRemoveIngredient(index)}
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t border-border bg-muted/30">
                          <td colSpan={3} className="py-2 px-3 font-medium">Custo Total</td>
                          <td className="text-right py-2 px-3 font-bold text-primary">
                            R$ {getFormTotalCost().toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Calculated values */}
                {formData.ingredients.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Custo por Porção:</span>
                      <span>R$ {(getFormTotalCost() / formData.yield_quantity).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lucro ({formData.profit_percent}%):</span>
                      <span>R$ {((getFormTotalCost() / formData.yield_quantity) * (formData.profit_percent / 100)).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-primary">
                      <span>Preço de Venda por Porção:</span>
                      <span>R$ {getFormSellPrice().toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormData({ ...formData, ingredients: [] })}
                >
                  Limpar
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
