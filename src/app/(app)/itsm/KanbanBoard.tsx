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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Ticket, TicketStatus } from "@/lib/types";
import { formatStatus, ticketStatusColor, ticketTypeColor, priorityColor, cn } from "@/lib/utils";
import { ColorBadge } from "@/components/ui/Badge";

// We map ITSM statuses to these 4 columns for a cleaner Kanban experience.
const COLUMNS: { id: TicketStatus; title: string; emoji: string }[] = [
  { id: "new", title: "New / To Do", emoji: "📋" },
  { id: "open", title: "In Progress", emoji: "🚀" },
  { id: "pending", title: "Pending / Review", emoji: "⏳" },
  { id: "resolved", title: "Done (Resolved)", emoji: "✅" },
];

interface KanbanBoardProps {
  tickets: Ticket[];
  onTicketClick: (t: Ticket) => void;
  onStatusChange: (ticketId: string, newStatus: TicketStatus) => Promise<void>;
}

export function KanbanBoard({ tickets, onTicketClick, onStatusChange }: KanbanBoardProps) {
  // Filter out closed/cancelled from the board to keep it clean, 
  // or put them in the last column. We only show the 4 mapped statuses.
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Local state for optimistic UI updates during drag
  const [localTickets, setLocalTickets] = useState<Ticket[]>(tickets);

  // Sync when props change
  React.useEffect(() => {
    setLocalTickets(tickets);
  }, [tickets]);

  const columnsWithTickets = useMemo(() => {
    const map: Record<string, Ticket[]> = {
      new: [],
      open: [],
      pending: [],
      resolved: [],
    };
    
    localTickets.forEach((t) => {
      // If a ticket is on_hold, show it in pending.
      const status = t.status === "on_hold" ? "pending" : (t.status === "closed" ? "resolved" : t.status);
      if (map[status]) {
        map[status].push(t);
      }
    });
    
    return COLUMNS.map((col) => ({
      ...col,
      items: map[col.id] || [],
    }));
  }, [localTickets]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }, // 5px movement before dragging starts
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeTicket = useMemo(
    () => localTickets.find((t) => t.id === activeId),
    [activeId, localTickets]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveTask = active.data.current?.type === "Task";
    const isOverTask = over.data.current?.type === "Task";
    const isOverColumn = over.data.current?.type === "Column";

    if (!isActiveTask) return;

    // Dropping a Task over another Task
    if (isActiveTask && isOverTask) {
      setLocalTickets((prev) => {
        const activeIndex = prev.findIndex((t) => t.id === activeId);
        const overIndex = prev.findIndex((t) => t.id === overId);
        
        if (prev[activeIndex].status !== prev[overIndex].status) {
          const newTickets = [...prev];
          newTickets[activeIndex] = { ...newTickets[activeIndex], status: prev[overIndex].status };
          return arrayMove(newTickets, activeIndex, overIndex);
        }
        
        return arrayMove(prev, activeIndex, overIndex);
      });
    }

    // Dropping a Task over an empty Column
    if (isActiveTask && isOverColumn) {
      setLocalTickets((prev) => {
        const activeIndex = prev.findIndex((t) => t.id === activeId);
        const newTickets = [...prev];
        newTickets[activeIndex] = { ...newTickets[activeIndex], status: overId as TicketStatus };
        return arrayMove(newTickets, activeIndex, activeIndex); // Just update status
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const ticketId = active.id as string;
    const activeTicketRef = localTickets.find(t => t.id === ticketId);
    if (!activeTicketRef) return;

    const newStatus = (over.data.current?.type === "Column" 
      ? over.id 
      : over.data.current?.ticket?.status) as TicketStatus;

    // Real API call if status changed
    const originalTicket = tickets.find(t => t.id === ticketId);
    if (originalTicket && originalTicket.status !== newStatus) {
      try {
        await onStatusChange(ticketId, newStatus);
      } catch (err) {
        // Revert on failure
        setLocalTickets(tickets);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 h-full scrollbar-thin">
        {columnsWithTickets.map((col) => (
          <KanbanColumn key={col.id} column={col} onTicketClick={onTicketClick} />
        ))}
      </div>

      <DragOverlay>
        {activeTicket ? <KanbanCard ticket={activeTicket} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  column,
  onTicketClick,
}: {
  column: { id: string; title: string; emoji: string; items: Ticket[] };
  onTicketClick: (t: Ticket) => void;
}) {
  const { setNodeRef, isOver } = useSortable({
    id: column.id,
    data: { type: "Column", column },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-80 flex-shrink-0 flex flex-col bg-neutral-50/90 rounded-2xl border overflow-hidden shadow-sm transition-colors",
        isOver ? "border-blue-400 bg-blue-50/50" : "border-neutral-200/80"
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-sm">{column.emoji}</span>
          <span className="font-bold text-xs uppercase tracking-wider text-navy-900">
            {column.title}
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-neutral-100 text-neutral-600">
          {column.items.length}
        </span>
      </div>

      {/* Drop Zone */}
      <div className="p-3 space-y-3 flex-1 overflow-y-auto min-h-[150px] scrollbar-thin">
        <SortableContext items={column.items.map((i) => i.id)} strategy={rectSortingStrategy}>
          {column.items.map((t) => (
            <SortableKanbanCard key={t.id} ticket={t} onClick={() => onTicketClick(t)} />
          ))}
          {column.items.length === 0 && (
            <div className="py-10 px-4 text-center border-2 border-dashed border-neutral-200/70 rounded-xl text-neutral-400 text-xs mt-2">
              Drop items here
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableKanbanCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ticket.id,
    data: { type: "Task", ticket },
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-neutral-100 border-2 border-dashed border-blue-400 rounded-xl h-[120px] opacity-40"
      />
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard ticket={ticket} onClick={onClick} />
    </div>
  );
}

function KanbanCard({ ticket, onClick, isOverlay = false }: { ticket: Ticket; onClick?: () => void; isOverlay?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-xl border p-3.5 shadow-sm space-y-2.5 transition-all text-left",
        isOverlay ? "border-purple-500 shadow-xl rotate-2 scale-105 cursor-grabbing" : "border-neutral-200 hover:shadow-md hover:border-blue-300 cursor-grab active:cursor-grabbing group active:scale-[0.99]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-navy-900 group-hover:text-blue-600 transition-colors">
          {ticket.ticketNumber}
        </span>
        <div className="flex items-center gap-1.5">
          {ticket.isOverdue && (
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200" title="Overdue SLA">
              ⚠️
            </span>
          )}
          <ColorBadge colorClass={ticketTypeColor(ticket.ticketType)} className="text-[9px] font-semibold px-1.5 py-0.5">
            {formatStatus(ticket.ticketType || "incident")}
          </ColorBadge>
          <ColorBadge colorClass={priorityColor(ticket.priority || "medium")} className="text-[10px] uppercase font-bold px-1.5 py-0.5">
            {ticket.priority}
          </ColorBadge>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-navy-900 line-clamp-2 leading-snug group-hover:text-blue-900 transition-colors">
          {ticket.subject}
        </h4>
      </div>

      {ticket.projectCode && (
        <div className="flex items-center gap-1 text-[10px] font-medium text-navy-500 bg-neutral-50 px-2 py-0.5 rounded-md truncate">
          <span>📁 {ticket.projectCode}</span>
        </div>
      )}

      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs mt-2">
        <ColorBadge colorClass={ticketStatusColor(ticket.status)} className="text-[9px]">
          {formatStatus(ticket.status)}
        </ColorBadge>

        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold text-[9px] flex items-center justify-center flex-shrink-0">
            {ticket.agent?.fullName
              ? ticket.agent.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")
              : "?"}
          </div>
        </div>
      </div>
    </div>
  );
}
