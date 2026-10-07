"use client";

import React, { useState } from "react";
import type { Requirement, RequirementFolder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Combobox } from "@/components/ui/Combobox";
import { ColorBadge } from "@/components/ui/Badge";

interface Props {
  projectId: string;
  initialRequirements: Requirement[];
  initialFolders: RequirementFolder[];
  canManage: boolean;
}

export function RequirementsTab({ projectId, initialRequirements, initialFolders, canManage }: Props) {
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements);
  const [folders, setFolders] = useState<RequirementFolder[]>(initialFolders);
  
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Partial<Requirement>>({});
  
  const displayedReqs = requirements.filter(r => r.folderId === selectedFolderId || (!r.folderId && !selectedFolderId));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const isNew = !editingReq.id;
    const url = isNew ? `/api/pmt/projects/${projectId}/requirements` : `/api/pmt/projects/${projectId}/requirements/${editingReq.id}`;
    const method = isNew ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editingReq, folderId: editingReq.folderId || selectedFolderId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (isNew) {
          setRequirements([...requirements, data.requirement]);
        } else {
          setRequirements(requirements.map(r => r.id === editingReq.id ? data.requirement : r));
        }
        setIsReqModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save requirement");
    }
  };

  const statusColor = (state: string) => {
    switch(state) {
      case "approved": return "bg-emerald-100 text-emerald-800";
      case "rejected": return "bg-red-100 text-red-800";
      case "in_review": return "bg-blue-100 text-blue-800";
      default: return "bg-neutral-100 text-neutral-800";
    }
  };

  return (
    <div className="flex h-[700px] border border-neutral-200 rounded-xl overflow-hidden bg-white">
      {/* Sidebar: Folder Tree */}
      <div className="w-64 bg-neutral-50 border-r border-neutral-200 flex flex-col">
        <div className="p-3 border-b border-neutral-200 bg-white">
          <h3 className="font-bold text-navy-900">Requirement Suites</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setSelectedFolderId(null)}
            className={cn(
              "w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between",
              selectedFolderId === null ? "bg-blue-50 text-blue-700" : "hover:bg-neutral-200 text-navy-700"
            )}
          >
            <span>📁 All Requirements</span>
            <span className="text-[10px] bg-white border border-neutral-200 px-1.5 rounded-full text-neutral-500">
              {requirements.length}
            </span>
          </button>
          {/* Flat folders for now */}
          {folders.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFolderId(f.id)}
              className={cn(
                "w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ml-2",
                selectedFolderId === f.id ? "bg-blue-50 text-blue-700" : "hover:bg-neutral-200 text-navy-700"
              )}
            >
              <span>📁 {f.name}</span>
              <span className="text-[10px] bg-white border border-neutral-200 px-1.5 rounded-full text-neutral-500">
                {requirements.filter(r => r.folderId === f.id).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-neutral-200 flex justify-between items-center bg-white">
          <h2 className="text-lg font-bold text-navy-900">
            {selectedFolderId === null ? "All Requirements" : folders.find(f => f.id === selectedFolderId)?.name || "Folder"}
          </h2>
          {canManage && (
            <Button onClick={() => { setEditingReq({}); setIsReqModalOpen(true); }}>
              Add Requirement
            </Button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50">
          {displayedReqs.length === 0 ? (
            <div className="text-center text-neutral-400 py-10 text-sm">No requirements found in this view.</div>
          ) : (
            displayedReqs.map(req => (
              <div key={req.id} className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-col gap-3 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => { setEditingReq(req); setIsReqModalOpen(true); }}>
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-bold text-navy-900 text-sm">{req.title}</h4>
                  <div className="flex items-center gap-2 shrink-0">
                    <ColorBadge colorClass={statusColor(req.state)} className="text-[10px] uppercase font-bold">{req.state.replace("_", " ")}</ColorBadge>
                    <ColorBadge colorClass="bg-neutral-100 text-neutral-600" className="text-[10px] uppercase font-bold">{req.priority}</ColorBadge>
                  </div>
                </div>
                {req.description && (
                  <p className="text-xs text-navy-600 line-clamp-2">{req.description}</p>
                )}
                <div className="flex justify-between items-center text-xs text-neutral-500">
                  <span>Type: <span className="font-semibold text-navy-700 capitalize">{req.type.replace("_", " ")}</span></span>
                  {req.owner && <span>Owner: <span className="font-semibold text-navy-700">{req.owner.fullName}</span></span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal isOpen={isReqModalOpen} onClose={() => setIsReqModalOpen(false)} title={editingReq.id ? "Edit Requirement" : "New Requirement"} footer={
        <>
          <Button variant="secondary" onClick={() => setIsReqModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Requirement</Button>
        </>
      }>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Title</label>
            <Input value={editingReq.title || ""} onChange={e => setEditingReq({...editingReq, title: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Description</label>
            <textarea
              value={editingReq.description || ""}
              onChange={e => setEditingReq({...editingReq, description: e.target.value})}
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Combobox label="State" value={editingReq.state || "draft"} onChange={v => setEditingReq({...editingReq, state: v as any})} options={[
              { value: "draft", label: "Draft" },
              { value: "in_review", label: "In Review" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]} />
            <Combobox label="Priority" value={editingReq.priority || "medium"} onChange={v => setEditingReq({...editingReq, priority: v as any})} options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Combobox label="Type" value={editingReq.type || "functional"} onChange={v => setEditingReq({...editingReq, type: v as any})} options={[
              { value: "functional", label: "Functional" },
              { value: "non_functional", label: "Non-Functional" },
              { value: "business", label: "Business" },
              { value: "technical", label: "Technical" },
            ]} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
