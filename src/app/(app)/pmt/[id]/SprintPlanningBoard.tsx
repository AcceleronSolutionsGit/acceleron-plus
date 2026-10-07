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
  useDroppable,
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
import { cn } from "@/lib/utils";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface Props {
  sprints: Sprint[];
  wbsItems: WBSItem[];
  onSprintCreate: (sprint: Partial<Sprint>) => Promise<void>;
  onSprintUpdate: (id: string, sprint: Partial<Sprint>) => Promise<void>;
  onWbsAssignToSprint: (wbsId: string, sprintId: string | null) => Promise<void>;
  onWbsUpdate: (wbsId: string, updates: Partial<WBSItem>) => Promise<void>;
  onCreateWbsItem: (name: string) => Promise<void>;
}

export function SprintPlanningBoard({ sprints, wbsItems, onSprintCreate, onSprintUpdate, onWbsAssignToSprint, onWbsUpdate, onCreateWbsItem }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Sprints local state for fast UI
  const [localSprints, setLocalSprints] = useState(sprints);
  const [localWbs, setLocalWbs] = useState(wbsItems);

  React.useEffect(() => {
    setLocalSprints(sprints);
    setLocalWbs(wbsItems);
  }, [sprints, wbsItems]);

  const backlogItems = useMemo(() => localWbs.filter(w => !w.sprintId), [localWbs]);
  
  // Selected sprint for the right panel
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(
    sprints.find(s => s.status === "active")?.id || sprints[0]?.id || null
  );

  const activeSprint = useMemo(() => localSprints.find(s => s.id === selectedSprintId), [localSprints, selectedSprintId]);
  const activeSprintItems = useMemo(() => localWbs.filter(w => w.sprintId === selectedSprintId), [localWbs, selectedSprintId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const draggedItem = useMemo(() => localWbs.find(w => w.id === activeId), [activeId, localWbs]);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    
    // We only care about moving items between Backlog and Sprint columns
    const activeContainer = localWbs.find(w => w.id === active.id)?.sprintId || "backlog";
    const overId = over.id as string;
    
    // If hovering over a column container directly
    if (overId === "backlog" || overId === "sprint") {
      const targetSprintId = overId === "sprint" ? selectedSprintId : null;
      if (activeContainer !== targetSprintId && (targetSprintId || overId === "backlog")) {
        setLocalWbs(prev => prev.map(w => w.id === active.id ? { ...w, sprintId: targetSprintId || undefined } : w));
      }
      return;
    }

    // If hovering over another item
    const overContainer = localWbs.find(w => w.id === over.id)?.sprintId || "backlog";
    if (activeContainer !== overContainer) {
      setLocalWbs(prev => prev.map(w => w.id === active.id ? { ...w, sprintId: overContainer === "backlog" ? undefined : (overContainer as string) } : w));
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    
    const itemId = active.id as string;
    const item = localWbs.find(w => w.id === itemId);
    const originalItem = wbsItems.find(w => w.id === itemId);
    
    if (item && originalItem && item.sprintId !== originalItem.sprintId) {
      try {
        await onWbsAssignToSprint(itemId, item.sprintId || null);
      } catch (err) {
        setLocalWbs(wbsItems); // revert
      }
    }
  };

  const [isCreatingSprint, setIsCreatingSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");

  const handleCreateSprint = async () => {
    if (!newSprintName.trim()) return;
    setIsCreatingSprint(true);
    await onSprintCreate({ name: newSprintName });
    setNewSprintName("");
    setIsCreatingSprint(false);
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Sprint Planning
          </h2>
          <p className="text-sm text-navy-500">
            Drag items from the backlog into your active sprint
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input 
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="New sprint name..."
            value={newSprintName}
            onChange={(e) => setNewSprintName(e.target.value)}
          />
          <Button onClick={handleCreateSprint} disabled={isCreatingSprint || !newSprintName.trim()}>
            Create Sprint
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6 h-[600px]">
          {/* Backlog Column */}
          <div className="flex-1 flex flex-col bg-neutral-50 rounded-xl border border-neutral-200 overflow-hidden">
            <div className="p-3 border-b border-neutral-200 bg-white sticky top-0 flex flex-col gap-2 z-10 shadow-sm">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-navy-900 flex items-center gap-2">
                  <span className="text-lg">🗂️</span> Product Backlog
                </h3>
                <span className="bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full text-xs font-bold">
                  {backlogItems.length}
                </span>
              </div>
              <QuickCreateInput onSubmit={onCreateWbsItem} placeholder="Quick create WBS item..." />
            </div>
            
            <DroppableColumn id="backlog" items={backlogItems} />
          </div>

          {/* Sprint Column */}
          <div className="flex-1 flex flex-col bg-blue-50/30 rounded-xl border border-blue-200 overflow-hidden shadow-inner">
            <div className="p-3 border-b border-blue-200 bg-white sticky top-0 flex flex-col gap-2 z-10 shadow-sm">
              <div className="flex justify-between items-center">
                <select 
                  className="font-bold text-navy-900 bg-transparent border-none text-lg outline-none cursor-pointer focus:ring-0"
                  value={selectedSprintId || ""}
                  onChange={(e) => setSelectedSprintId(e.target.value)}
                >
                  {localSprints.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                  ))}
                  {localSprints.length === 0 && <option value="">No Sprints</option>}
                </select>
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-bold">
                  {activeSprintItems.length}
                </span>
              </div>
              
              {activeSprint && (
                <div className="flex gap-2">
                  <select
                    className="text-xs bg-white border border-neutral-200 rounded px-2 py-1 outline-none"
                    value={activeSprint.status}
                    onChange={(e) => onSprintUpdate(activeSprint.id, { status: e.target.value as any })}
                  >
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                  
                  <div className="text-xs text-navy-500 bg-white border border-neutral-200 rounded px-2 py-1 flex-1 truncate">
                    {activeSprint.goal || "No sprint goal set"}
                  </div>
                </div>
              )}
            </div>
            
            <DroppableColumn id="sprint" items={activeSprintItems} bgClass="bg-blue-50/10" emptyMsg="Drag items here to add to sprint" />
          </div>
        </div>

        <DragOverlay>
          {draggedItem ? <WBSCard item={draggedItem} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DroppableColumn({ id, items, bgClass = "", emptyMsg = "No items" }: { id: string, items: WBSItem[], bgClass?: string, emptyMsg?: string }) {
  const { setNodeRef } = useDroppable({
    id,
    data: { type: "Column" }
  });

  return (
    <div ref={setNodeRef} className={cn("flex-1 p-3 overflow-y-auto scrollbar-thin space-y-2", bgClass)}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {items.map(item => (
          <SortableWBSCard key={item.id} item={item} />
        ))}
        {items.length === 0 && (
          <div className="py-10 text-center text-xs text-neutral-400 border-2 border-dashed border-neutral-200 rounded-lg">
            {emptyMsg}
          </div>
        )}
      </SortableContext>
    </div>
  );
}

function SortableWBSCard({ item }: { item: WBSItem }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "Task", item }
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} className="bg-neutral-100 border-2 border-dashed border-blue-400 rounded-xl h-20 opacity-50" />
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WBSCard item={item} />
    </div>
  );
}

function WBSCard({ item, isOverlay = false }: { item: WBSItem, isOverlay?: boolean }) {
  return (
    <div className={cn(
      "bg-white border rounded-xl p-3 flex flex-col gap-2 transition-all cursor-grab active:cursor-grabbing group",
      isOverlay ? "border-purple-500 shadow-xl scale-105 rotate-2" : "border-neutral-200 hover:border-blue-300 hover:shadow-sm"
    )}>
      <div className="flex justify-between items-start gap-2">
        <span className="font-mono text-xs font-bold text-navy-900 group-hover:text-blue-600 transition-colors">
          {item.code}
        </span>
        <div className="flex items-center gap-1.5">
          {item.estimatedHours ? (
            <span className="bg-neutral-100 text-neutral-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full" title="Estimated Hours">
              {item.estimatedHours}h
            </span>
          ) : null}
          <ColorBadge colorClass={item.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'} className="text-[9px]">
            {item.status?.replace('_', ' ') || 'not started'}
          </ColorBadge>
        </div>
      </div>
      <p className="text-xs font-semibold text-navy-900 leading-snug line-clamp-2">
        {item.name}
      </p>
    </div>
  );
}

function QuickCreateInput({ onSubmit, placeholder }: { onSubmit: (val: string) => Promise<void>, placeholder: string }) {
  const [val, setVal] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!val.trim()) return;
    setLoading(true);
    await onSubmit(val);
    setVal("");
    setLoading(false);
  };

  return (
    <form onSubmit={handle} className="flex gap-2">
      <input
        className="text-xs flex-1 border border-neutral-200 rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
        placeholder={placeholder}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={loading}
      />
      <button type="submit" disabled={loading || !val.trim()} className="bg-navy-900 text-white rounded px-2 py-1 text-xs font-bold disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
