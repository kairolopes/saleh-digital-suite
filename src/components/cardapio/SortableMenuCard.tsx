import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Clock, GripVertical } from "lucide-react";

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

interface SortableMenuCardProps {
  item: MenuItem;
  onEdit: (item: MenuItem) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (item: MenuItem) => void;
  formatCurrency: (value: number) => string;
}

export function SortableMenuCard({
  item,
  onEdit,
  onDelete,
  onToggleAvailability,
  formatCurrency,
}: SortableMenuCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`bg-card border-border transition-opacity overflow-hidden ${
        !item.is_available ? "opacity-60" : ""
      } ${isDragging ? "shadow-lg" : ""}`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center py-2 bg-muted/50 cursor-grab active:cursor-grabbing hover:bg-muted transition-colors"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Recipe Image */}
      {item.recipes?.image_url && (
        <div className="relative h-40 overflow-hidden">
          <img
            src={item.recipes.image_url}
            alt={item.recipes.name}
            className="w-full h-full object-cover"
          />
          {!item.is_available && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Badge variant="secondary" className="text-lg">
                Indisponível
              </Badge>
            </div>
          )}
          {item.recipes?.preparation_time && (
            <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-sm flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {item.recipes.preparation_time} min
            </div>
          )}
        </div>
      )}

      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">
              {item.recipes?.name}
            </h3>
            {item.recipes?.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {item.recipes.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-lg font-bold text-primary">
                {formatCurrency(item.sell_price)}
              </span>
              {!item.is_available && !item.recipes?.image_url && (
                <Badge variant="secondary">Indisponível</Badge>
              )}
            </div>
            {item.recipes?.preparation_time && !item.recipes?.image_url && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {item.recipes.preparation_time} min
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(item)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <span className="text-sm text-muted-foreground">Disponível</span>
          <Switch
            checked={item.is_available}
            onCheckedChange={() => onToggleAvailability(item)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
