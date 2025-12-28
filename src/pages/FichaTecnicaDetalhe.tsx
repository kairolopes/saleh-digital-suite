import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Plus, Trash2, Calculator, DollarSign, 
  Clock, Package, ChefHat, TrendingUp, AlertTriangle 
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  unit: string;
  average_price: number;
}

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  recipe_type: string;
  yield_quantity: number;
  yield_unit: string | null;
  preparation_time: number | null;
  instructions: string | null;
  is_available: boolean;
}

interface RecipeItem {
  id: string;
  recipe_id: string;
  product_id: string | null;
  subrecipe_id: string | null;
  quantity: number;
  unit: string;
}

export default function FichaTecnicaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddIngredientOpen, setIsAddIngredientOpen] = useState(false);
  const [ingredientForm, setIngredientForm] = useState({
    type: "product" as "product" | "subrecipe",
    product_id: "",
    subrecipe_id: "",
    quantity: 1,
    unit: "",
  });
  const [instructions, setInstructions] = useState("");
  const [cmvTarget, setCmvTarget] = useState(30); // Default 30% CMV

  // Fetch recipe details
  const { data: recipe, isLoading: recipeLoading } = useQuery({
    queryKey: ["recipe", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (data) setInstructions(data.instructions || "");
      return data as Recipe | null;
    },
    enabled: !!id,
  });

  // Fetch recipe items
  const { data: recipeItems } = useQuery({
    queryKey: ["recipe-items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_items")
        .select("*")
        .eq("recipe_id", id);
      if (error) throw error;
      return data as RecipeItem[];
    },
    enabled: !!id,
  });

  // Fetch all products
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

  // Fetch subrecipes (other recipes that can be used as ingredients)
  const { data: subrecipes } = useQuery({
    queryKey: ["subrecipes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, yield_quantity, yield_unit")
        .neq("id", id) // Exclude current recipe
        .in("recipe_type", ["subproduto", "preparo_base"])
        .eq("is_available", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Calculate costs for subrecipes
  const { data: subrecipeCosts } = useQuery({
    queryKey: ["subrecipe-costs"],
    queryFn: async () => {
      const { data: allItems, error } = await supabase
        .from("recipe_items")
        .select("recipe_id, quantity, product_id");
      if (error) throw error;

      const { data: allProducts } = await supabase
        .from("products")
        .select("id, average_price");

      const productPrices = new Map(allProducts?.map(p => [p.id, Number(p.average_price)]) || []);
      
      const costs = new Map<string, number>();
      allItems?.forEach(item => {
        if (item.product_id) {
          const price = productPrices.get(item.product_id) || 0;
          const currentCost = costs.get(item.recipe_id) || 0;
          costs.set(item.recipe_id, currentCost + (Number(item.quantity) * price));
        }
      });
      
      return costs;
    },
  });

  // Add ingredient mutation
  const addIngredientMutation = useMutation({
    mutationFn: async (data: typeof ingredientForm) => {
      const { error } = await supabase.from("recipe_items").insert({
        recipe_id: id,
        product_id: data.type === "product" ? data.product_id : null,
        subrecipe_id: data.type === "subrecipe" ? data.subrecipe_id : null,
        quantity: data.quantity,
        unit: data.unit,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe-items", id] });
      queryClient.invalidateQueries({ queryKey: ["recipe-costs"] });
      toast({ title: "Ingrediente adicionado!" });
      setIsAddIngredientOpen(false);
      setIngredientForm({
        type: "product",
        product_id: "",
        subrecipe_id: "",
        quantity: 1,
        unit: "",
      });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar ingrediente", variant: "destructive" });
    },
  });

  // Remove ingredient mutation
  const removeIngredientMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("recipe_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe-items", id] });
      queryClient.invalidateQueries({ queryKey: ["recipe-costs"] });
      toast({ title: "Ingrediente removido!" });
    },
  });

  // Update instructions mutation
  const updateInstructionsMutation = useMutation({
    mutationFn: async (newInstructions: string) => {
      const { error } = await supabase
        .from("recipes")
        .update({ instructions: newInstructions })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      toast({ title: "Instruções salvas!" });
    },
  });

  // Calculate costs
  const calculateCosts = () => {
    let totalCost = 0;
    
    recipeItems?.forEach(item => {
      if (item.product_id) {
        const product = products?.find(p => p.id === item.product_id);
        if (product) {
          totalCost += Number(item.quantity) * Number(product.average_price);
        }
      } else if (item.subrecipe_id) {
        const subrecipeCost = subrecipeCosts?.get(item.subrecipe_id) || 0;
        const subrecipe = subrecipes?.find(s => s.id === item.subrecipe_id);
        if (subrecipe && subrecipe.yield_quantity > 0) {
          const costPerUnit = subrecipeCost / subrecipe.yield_quantity;
          totalCost += Number(item.quantity) * costPerUnit;
        }
      }
    });
    
    return totalCost;
  };

  const totalCost = calculateCosts();
  const yieldQty = recipe?.yield_quantity || 1;
  const costPerPortion = totalCost / yieldQty;
  const suggestedPrice = cmvTarget > 0 ? costPerPortion / (cmvTarget / 100) : 0;
  const profitMargin = suggestedPrice - costPerPortion;

  const handleAddIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (ingredientForm.type === "product" && !ingredientForm.product_id) {
      toast({ title: "Selecione um produto", variant: "destructive" });
      return;
    }
    if (ingredientForm.type === "subrecipe" && !ingredientForm.subrecipe_id) {
      toast({ title: "Selecione um subproduto", variant: "destructive" });
      return;
    }
    if (!ingredientForm.unit) {
      toast({ title: "Informe a unidade", variant: "destructive" });
      return;
    }
    addIngredientMutation.mutate(ingredientForm);
  };

  const handleProductSelect = (productId: string) => {
    const product = products?.find(p => p.id === productId);
    setIngredientForm({
      ...ingredientForm,
      product_id: productId,
      unit: product?.unit || "",
    });
  };

  if (recipeLoading) {
    return (
      <AppLayout requiredRoles={["admin", "cozinha"]}>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AppLayout>
    );
  }

  if (!recipe) {
    return (
      <AppLayout requiredRoles={["admin", "cozinha"]}>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">Ficha técnica não encontrada</p>
          <Button variant="outline" onClick={() => navigate("/fichas-tecnicas")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout requiredRoles={["admin", "cozinha"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/fichas-tecnicas")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{recipe.name}</h1>
              <Badge variant={recipe.is_available ? "default" : "secondary"}>
                {recipe.is_available ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {recipe.description || "Sem descrição"}
            </p>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rendimento</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {recipe.yield_quantity} {recipe.yield_unit}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tempo de Preparo</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {recipe.preparation_time ? `${recipe.preparation_time} min` : "-"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Custo Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {totalCost.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Custo por Porção</CardTitle>
              <Calculator className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                R$ {costPerPortion.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Price Suggestion Card */}
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Calculadora de Preço de Venda
            </CardTitle>
            <CardDescription>
              Defina seu CMV alvo para calcular o preço de venda sugerido
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="cmv">CMV Alvo (%)</Label>
                <Input
                  id="cmv"
                  type="number"
                  min={1}
                  max={100}
                  value={cmvTarget}
                  onChange={(e) => setCmvTarget(parseInt(e.target.value) || 30)}
                />
                <p className="text-xs text-muted-foreground">
                  Recomendado: 25-35%
                </p>
              </div>
              <div className="space-y-2">
                <Label>Custo por Porção</Label>
                <div className="text-2xl font-bold">R$ {costPerPortion.toFixed(2)}</div>
              </div>
              <div className="space-y-2">
                <Label>Preço Sugerido</Label>
                <div className="text-2xl font-bold text-primary">
                  R$ {suggestedPrice.toFixed(2)}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Lucro por Porção</Label>
                <div className="text-2xl font-bold text-green-600">
                  R$ {profitMargin.toFixed(2)}
                </div>
              </div>
            </div>
            {cmvTarget < 25 && (
              <div className="mt-4 flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  CMV muito baixo pode resultar em preços não competitivos
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Ingredients */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Ingredientes</CardTitle>
                <CardDescription>
                  {recipeItems?.length || 0} itens na receita
                </CardDescription>
              </div>
              <Dialog open={isAddIngredientOpen} onOpenChange={setIsAddIngredientOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Ingrediente</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddIngredient} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select
                        value={ingredientForm.type}
                        onValueChange={(value: "product" | "subrecipe") =>
                          setIngredientForm({ ...ingredientForm, type: value, product_id: "", subrecipe_id: "" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">Produto/Insumo</SelectItem>
                          <SelectItem value="subrecipe">Subproduto/Preparo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {ingredientForm.type === "product" ? (
                      <div className="space-y-2">
                        <Label>Produto</Label>
                        <Select
                          value={ingredientForm.product_id}
                          onValueChange={handleProductSelect}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um produto" />
                          </SelectTrigger>
                          <SelectContent>
                            {products?.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} ({product.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Subproduto</Label>
                        <Select
                          value={ingredientForm.subrecipe_id}
                          onValueChange={(value) =>
                            setIngredientForm({ ...ingredientForm, subrecipe_id: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um subproduto" />
                          </SelectTrigger>
                          <SelectContent>
                            {subrecipes?.map((sub) => (
                              <SelectItem key={sub.id} value={sub.id}>
                                {sub.name} ({sub.yield_quantity} {sub.yield_unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Quantidade</Label>
                        <Input
                          type="number"
                          min={0.001}
                          step={0.001}
                          value={ingredientForm.quantity}
                          onChange={(e) =>
                            setIngredientForm({
                              ...ingredientForm,
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unidade</Label>
                        <Input
                          value={ingredientForm.unit}
                          onChange={(e) =>
                            setIngredientForm({ ...ingredientForm, unit: e.target.value })
                          }
                          placeholder="kg, g, L, ml, un..."
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddIngredientOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={addIngredientMutation.isPending}>
                        Adicionar
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipeItems?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhum ingrediente adicionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    recipeItems?.map((item) => {
                      let itemName = "";
                      let itemCost = 0;

                      if (item.product_id) {
                        const product = products?.find((p) => p.id === item.product_id);
                        itemName = product?.name || "Produto não encontrado";
                        itemCost = Number(item.quantity) * Number(product?.average_price || 0);
                      } else if (item.subrecipe_id) {
                        const subrecipe = subrecipes?.find((s) => s.id === item.subrecipe_id);
                        itemName = `[Sub] ${subrecipe?.name || "Subproduto não encontrado"}`;
                        const subCost = subrecipeCosts?.get(item.subrecipe_id) || 0;
                        const subYield = subrecipe?.yield_quantity || 1;
                        itemCost = Number(item.quantity) * (subCost / subYield);
                      }

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{itemName}</TableCell>
                          <TableCell className="text-right">
                            {item.quantity} {item.unit}
                          </TableCell>
                          <TableCell className="text-right">
                            R$ {itemCost.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeIngredientMutation.mutate(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {(recipeItems?.length || 0) > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span>Total</span>
                    <span>R$ {totalCost.toFixed(2)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChefHat className="h-5 w-5" />
                Modo de Preparo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Descreva o passo a passo do preparo..."
                className="min-h-[300px]"
              />
              <Button
                onClick={() => updateInstructionsMutation.mutate(instructions)}
                disabled={updateInstructionsMutation.isPending}
              >
                Salvar Instruções
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
