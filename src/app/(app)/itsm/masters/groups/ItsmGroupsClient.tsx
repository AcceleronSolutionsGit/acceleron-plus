"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function ItsmGroupsClient({ users }: { users: any[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/itsm/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this group?")) return;
    try {
      const res = await fetch(`/api/itsm/groups?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchGroups();
      } else {
        alert("Failed to delete group.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error.");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-navy-500/10 shadow-sm">
        <div className="relative w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search groups..."
            className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-navy-500/15 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </div>
        <Link href="/itsm/masters/groups/new">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all">
            + New Group
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-navy-500 font-medium">Loading groups...</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50/80 border-b border-navy-500/10">
              <tr>
                <th className="px-6 py-4 font-bold text-navy-800">Group Name</th>
                <th className="px-6 py-4 font-bold text-navy-800">Description</th>
                <th className="px-6 py-4 font-bold text-navy-800">Team Lead</th>
                <th className="px-6 py-4 font-bold text-navy-800">Members Count</th>
                <th className="px-6 py-4 font-bold text-navy-800 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-500/5">
              {groups.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-navy-500">No groups found.</td></tr>
              ) : (
                groups.map((g) => (
                  <tr key={g.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-navy-900">{g.name}</td>
                    <td className="px-6 py-4 text-navy-600">{g.description || "—"}</td>
                    <td className="px-6 py-4 text-navy-600">
                      {users.find(u => u.id === g.teamLeadUserId)?.fullName || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                        {g.members?.length || 0} members
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Link href={`/itsm/masters/groups/${g.id}`}>
                        <Button variant="secondary" size="sm">
                          Edit
                        </Button>
                      </Link>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(g.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
