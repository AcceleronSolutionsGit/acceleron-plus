"use client";

import React, { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WBSItem, Sprint } from "@/lib/types";
import { ColorBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";

interface Props {
  sprints: Sprint[];
  wbsItems: WBSItem[];
  onWbsUpdate: (wbsId: string, updates: Partial<WBSItem>) => Promise<void>;
}

const COLUMNS = [
  { id: "not_started", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "completed", title: "Done" },
];

export function TaskKanbanBoard({ sprints, wbsItems, onWbsUpdate }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localWbs, setLocalWbs] = useState(wbsItems);
  
  // Keep local state in sync when parent updates
  React.useEffect(() => setLocalWbs(wbsItems), [wbsItems]);

  const [selectedFilter, setSelectedFilter] = useState<string>("all");

  const filteredWbs = useMemo(() => {
    if (selectedFilter === "all") return localWbs;
    if (selectedFilter === "backlog") return localWbs.filter((w) => !w.sprintId);
    return localWbs.filter((w) => w.sprintId === selectedFilter);
  }, [localWbs, selectedFilter]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const draggedItem = useMemo(() => localWbs.find((w) => w.id === activeId), [activeId, localWbs]);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;

    const activeItem = localWbs.find((w) => w.id === active.id);
    if (!activeItem) return;
    
    const activeStatus = activeItem.status || "not_started";
    const overId = over.id as string;
    
    // Check if dragging over a column
    if (COLUMNS.some((c) => c.id === overId)) {
      if (activeStatus !== overId) {
        setLocalWbs((prev) =>
          prev.map((w) => (w.id === active.id ? { ...w, status: overId as any } : w))
        );
      }
      return;
    }

    // Dragging over another item
    const overItem = localWbs.find((w) => w.id === over.id);
    if (overItem) {
      const overStatus = overItem.status || "not_started";
      if (activeStatus !== overStatus) {
        setLocalWbs((prev) =>
          prev.map((w) => (w.id === active.id ? { ...w, status: overStatus as any } : w))
        );
      }
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) {
      // Revert if dropped nowhere
      setLocalWbs(wbsItems);
      return;
    }

    const activeItem = localWbs.find((w) => w.id === active.id);
    if (!activeItem) return;
    
    const originalItem = wbsItems.find((w) => w.id === active.id);
    const newStatus = activeItem.status || "not_started";

    if (originalItem?.status !== newStatus) {
      // Persist the status change
      await onWbsUpdate(activeItem.id, { status: newStatus });
    } else {
      // For reordering logic within the same column if implemented
      // (Simplified: just snap back localWbs to order if arrayMove is needed, but we don't persist sequence here yet)
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Header */}
      <div className="flex items-center gap-4 bg-white px-4 py-3 border-b border-neutral-100 rounded-t-xl shadow-sm">
        <span className="text-sm font-semibold text-navy-900">View Board For:</span>
        <select
          value={selectedFilter}
          onChange={(e) => setSelectedFilter(e.target.value)}
          className="text-sm border-neutral-200 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Tasks (Project)</option>
          <option value="backlog">Backlog (Unassigned)</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.status})
            </option>
          ))}
        </select>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 h-[600px]">
          {COLUMNS.map((col) => {
            const colItems = filteredWbs.filter((w) => (w.status || "not_started") === col.id);
            return (
              <KanbanColumn key={col.id} id={col.id} title={col.title} items={colItems} />
            );
          })}
        </div>
        
        <DragOverlay>
          {draggedItem ? <TaskCard item={draggedItem} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanColumn({ id, title, items }: { id: string; title: string; items: WBSItem[] }) {
  const { setNodeRef } = useSortable({
    id,
    data: { type: "Column", id },
  });

  return (
    <div className="flex-shrink-0 w-80 flex flex-col bg-neutral-50/50 rounded-xl border border-neutral-200 shadow-sm max-h-full">
      <div className="p-3 border-b border-neutral-200/60 bg-white/50 rounded-t-xl flex items-center justify-between">
        <h3 className="font-semibold text-navy-900 text-sm">{title}</h3>
        <span className="bg-neutral-200 text-navy-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 p-3 overflow-y-auto space-y-3 min-h-[150px]"
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableTaskCard key={item.id} item={item} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableTaskCard({ item }: { item: WBSItem }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "Task", item },
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing">
      <TaskCard item={item} />
    </div>
  );
}

function TaskCard({ item, isOverlay = false }: { item: WBSItem; isOverlay?: boolean }) {
  return (
    <div
      className={`bg-white p-3 rounded-lg border border-neutral-200 text-left w-full transition-shadow ${
        isOverlay ? "shadow-xl rotate-2 ring-2 ring-blue-500/20" : "shadow-sm hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-navy-900 leading-tight">
          {item.name}
        </h4>
      </div>
      
      {item.description && (
        <p className="text-xs text-navy-500 line-clamp-2 mb-3 leading-relaxed">
          {item.description}
        </p>
      )}

      <div className="flex items-center justify-between mt-auto">
        {item.estimatedHours ? (
          <span className="text-[10px] font-medium px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
            {item.estimatedHours}h
          </span>
        ) : (
          <span />
        )}
        
        {item.ownerUserId ? (
          <Avatar name={item.ownerUserId} size="xs" />
        ) : (
          <span className="text-[10px] text-red-500 font-medium">Unassigned</span>
        )}
      </div>
    </div>
  );
}
