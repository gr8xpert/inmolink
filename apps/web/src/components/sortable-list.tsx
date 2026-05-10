"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

/**
 * Vertical sortable list backed by @dnd-kit. Used by every admin surface
 * where positions are user-editable.
 *
 * The drag handle is opt-in — `renderItem` receives a `dragHandle` JSX
 * fragment that the caller renders wherever they want (typically next to
 * the item label). Hiding the handle by not rendering it disables drag
 * for that row, which is useful for locked / inactive rows.
 *
 * `onReorder` fires once per drop with the new ordered ids. The caller
 * is expected to send that to a `reorder-all` endpoint that rewrites
 * positions atomically — chained single-step swaps were how the up/down
 * arrow UI worked, but that approach loses transactional safety on
 * multi-position drags.
 *
 * Drags are constrained to the vertical axis + the parent element so
 * the visual feedback stays inside the panel.
 */

export type SortableItem = { id: string };

export type SortableListProps<T extends SortableItem> = {
  items: T[];
  onReorder: (newIds: string[]) => void;
  renderItem: (item: T, dragHandle: ReactNode, isDragging: boolean) => ReactNode;
  disabled?: boolean;
  className?: string;
};

export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  disabled,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex).map((i) => i.id);
    onReorder(next);
  }

  if (disabled) {
    // Fallback: still render the items, just with a no-op handle.
    return (
      <ul className={className}>
        {items.map((item) => (
          <li key={item.id}>{renderItem(item, null, false)}</li>
        ))}
      </ul>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {items.map((item) => (
            <SortableRow key={item.id} item={item} renderItem={renderItem} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow<T extends SortableItem>({
  item,
  renderItem,
}: {
  item: T;
  renderItem: (item: T, dragHandle: ReactNode, isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const dragHandle = (
    // Drag handle: 6 dots glyph, button-styled. type="button" so it's
    // never treated as a form submit when nested inside a <form>.
    <button
      type="button"
      aria-label="Drag to reorder"
      className="cursor-grab touch-none rounded px-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      ⋮⋮
    </button>
  );

  return (
    <li ref={setNodeRef} style={style}>
      {renderItem(item, dragHandle, isDragging)}
    </li>
  );
}
