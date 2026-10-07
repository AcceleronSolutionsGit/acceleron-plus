"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Combobox } from "@/components/ui/Combobox";

export function ItsmGroupFormClient({ users, initialData }: { users: any[], initialData?: any }) {
  const router = useRouter();
  const [form, setForm] = useState({
    id: initialData?.id || "",
    name: initialData?.name || "",
    description: initialData?.description || "",
    teamLeadUserId: initialData?.teamLeadUserId || "",
    members: initialData?.members || [] as string[],
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/itsm/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.push("/itsm/masters/groups");
        router.refresh();
      } else {
        alert("Failed to save group.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMember = (userId: string) => {
    setForm((prev) => {
      const isSelected = prev.members.includes(userId);
      if (isSelected) {
        return { ...prev, members: prev.members.filter((id: string) => id !== userId) };
      } else {
        return { ...prev, members: [...prev.members, userId] };
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-navy-500/10 overflow-hidden animate-in fade-in duration-500">
      <div className="px-8 py-6 border-b border-navy-500/10 bg-neutral-50/80">
        <h2 className="text-2xl font-extrabold text-navy-900">
          {initialData ? "Edit Group" : "Create New Group"}
        </h2>
        <p className="text-sm text-navy-500 mt-1">
          {initialData ? "Update the details and members of this assignment group." : "Create a new assignment group and assign its team lead and members."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-6">
        <div>
          <label className="block text-sm font-bold text-navy-800 mb-1.5">Group Name <span className="text-red-500">*</span></label>
          <Input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., L1 Support"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-navy-800 mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full text-sm border border-navy-500/15 rounded-xl p-3 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all duration-200"
            rows={3}
            placeholder="Brief description of what this group handles..."
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-navy-800 mb-1.5">Team Lead</label>
          <Combobox
            value={form.teamLeadUserId}
            onChange={(val) => setForm({ ...form, teamLeadUserId: val })}
            options={[
              { value: "", label: "Select a team lead..." },
              ...users.map((u) => ({
                value: u.id,
                label: `${u.fullName} (${u.email})`,
              })),
            ]}
            placeholder="Select a team lead..."
            searchPlaceholder="Search team lead..."
            className="w-full text-sm border-navy-500/15 focus:ring-blue-500/30"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-navy-800 mb-1.5">Members ({form.members.length})</label>
          <div className="border border-navy-500/15 rounded-xl overflow-hidden bg-neutral-50/30">
            <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {users.map(u => {
                const isSelected = form.members.includes(u.id);
                return (
                  <label key={u.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/80 border border-blue-500/20 shadow-sm shadow-blue-500/5' : 'hover:bg-white border border-transparent'}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleMember(u.id)}
                      className="w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500 transition-all"
                    />
                    <span className={`text-sm ${isSelected ? 'text-blue-900 font-bold' : 'text-navy-700 font-medium'}`}>
                      {u.fullName} <span className="text-neutral-400 font-normal">({u.email})</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-4 flex items-center justify-end gap-3 border-t border-navy-500/10">
          <Link href="/itsm/masters/groups">
            <Button type="button" variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20" disabled={saving}>
            {saving ? "Saving..." : "Save Group"}
          </Button>
        </div>
      </form>
    </div>
  );
}
