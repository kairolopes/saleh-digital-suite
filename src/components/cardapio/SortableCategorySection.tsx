import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableMenuCard } from "./SortableMenuCard";

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

interface SortableCategorySectionProps {
  category: string;
  items: MenuItem[];
  onReorder: (category: string, activeId: string, overId: string) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (item: MenuItem) => void;
  formatCurrency: (value: number) => string;
}

export function SortableCategorySection({
  category,
  items,
  onReorder,
  onEdit,
  onDelete,
  onToggleAvailability,
  formatCurrency,
}: SortableCategorySectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(category, active.id as string, over.id as string);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground mb-4 border-b pb-2">
        {category}
      </h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <SortableMenuCard
                key={item.id}
                item={item}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleAvailability={onToggleAvailability}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
