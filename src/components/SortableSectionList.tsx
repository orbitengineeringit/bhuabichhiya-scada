import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useCardOrder } from '@/hooks/useCardOrder';

interface SortableSectionItemProps {
  id: string;
  children: React.ReactNode;
}

const SortableSectionItem: React.FC<SortableSectionItemProps> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} className="group/section relative">
      <button
        {...attributes}
        {...listeners}
        className="hidden sm:flex absolute -top-1 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-md bg-muted/90 border border-border/50 opacity-0 group-hover/section:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing touch-none items-center gap-1"
        aria-label="Drag to reorder section"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground font-medium">Move Section</span>
      </button>
      {children}
    </div>
  );
};

interface SectionDef {
  id: string;
  content: React.ReactNode;
}

interface SortableSectionListProps {
  groupKey: string;
  sections: SectionDef[];
}

const SortableSectionList: React.FC<SortableSectionListProps> = ({ groupKey, sections }) => {
  const sectionIds = React.useMemo(() => sections.map(s => s.id), [sections.map(s => s.id).join(',')]);
  const [order, updateOrder] = useCardOrder(groupKey, sectionIds);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as string);
      const newIndex = order.indexOf(over.id as string);
      updateOrder(arrayMove(order, oldIndex, newIndex));
    }
  };

  const sectionMap = React.useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    sections.forEach(s => { map[s.id] = s.content; });
    return map;
  }, [sections]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        {order.map(id => {
          const content = sectionMap[id];
          if (!content) return null;
          return (
            <SortableSectionItem key={id} id={id}>
              {content}
            </SortableSectionItem>
          );
        })}
      </SortableContext>
    </DndContext>
  );
};

export default SortableSectionList;
