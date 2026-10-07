"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";

interface MagicLink {
  id: string;
  token: string;
  expires_at: string;
  is_revoked: boolean;
  used_at: string | null;
}

interface ClientContact {
  id: string;
  name: string;
  email: string;
  designation: string | null;
  phone: string | null;
  is_primary: boolean;
  magicLinks: MagicLink[];
}

export function ClientAccessTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", designation: "", phone: "", isPrimary: false });

  const fetchContacts = async () => {
    setLoading(true);
    const res = await fetch(`/api/pmt/projects/${projectId}/clients`);
    const data = await res.json();
    if (data.success) {
      setContacts(data.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
  }, [projectId]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/pmt/projects/${projectId}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    if (res.ok) {
      setForm({ name: "", email: "", designation: "", phone: "", isPrimary: false });
      setShowAdd(false);
      fetchContacts();
    }
  };

  const handleGenerateLink = async (contactId: string) => {
    const res = await fetch(`/api/pmt/projects/${projectId}/clients/${contactId}/magic-link`, {
      method: "POST"
    });
    if (res.ok) {
      fetchContacts();
    }
  };

  const handleRevokeLink = async (contactId: string, linkId: string) => {
    const res = await fetch(`/api/pmt/projects/${projectId}/clients/${contactId}/magic-link?linkId=${linkId}`, {
      method: "DELETE"
    });
    if (res.ok) {
      fetchContacts();
    }
  };

  if (loading) return <div className="p-8 text-center text-navy-500">Loading client contacts...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Client Portal Access</h2>
          <p className="text-sm text-navy-500">Manage client contacts and passwordless magic links.</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "Cancel" : "+ Add Client Contact"}
          </Button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleAddContact} className="bg-white p-5 rounded-xl border border-navy-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1">Name *</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1">Email *</label>
            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1">Designation</label>
            <input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} className="w-full border rounded p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full border rounded p-2 text-sm" />
          </div>
          <div className="md:col-span-2 pt-2 flex justify-end">
            <Button type="submit">Save Contact</Button>
          </div>
        </form>
      )}

      {contacts.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-dashed border-navy-300 text-navy-500">
          No client contacts added yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <div key={contact.id} className="bg-white rounded-xl border border-navy-200 overflow-hidden shadow-sm flex flex-col">
              <div className="p-4 border-b border-navy-100 flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900 leading-tight">{contact.name}</h3>
                    <p className="text-xs text-navy-500">{contact.designation || "Client"}</p>
                  </div>
                </div>
                <div className="text-xs text-navy-600 space-y-1 mt-4">
                  <div className="flex items-center gap-2">
                    <span>✉️</span> {contact.email}
                  </div>
                  {contact.phone && (
                    <div className="flex items-center gap-2">
                      <span>📱</span> {contact.phone}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 bg-navy-50/50">
                <h4 className="text-xs font-bold text-navy-900 mb-2">Magic Links</h4>
                {contact.magicLinks.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    {contact.magicLinks.map((link) => {
                      const isExpired = new Date(link.expires_at) < new Date();
                      return (
                        <div key={link.id} className="bg-white border border-navy-200 rounded p-2 text-xs flex justify-between items-center">
                          <div>
                            {link.is_revoked ? (
                              <span className="text-red-600 font-medium">Revoked</span>
                            ) : isExpired ? (
                              <span className="text-neutral-500 font-medium">Expired</span>
                            ) : (
                              <span className="text-emerald-600 font-medium">Active (Expires {formatDate(link.expires_at)})</span>
                            )}
                            {link.used_at && <div className="text-[10px] text-navy-400">Used: {formatDate(link.used_at)}</div>}
                          </div>
                          {(!link.is_revoked && !isExpired && canManage) && (
                            <div className="flex gap-1">
                              <button onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/portal?token=${link.token}`);
                                alert("Link copied to clipboard!");
                              }} className="px-2 py-1 bg-navy-100 text-navy-700 rounded hover:bg-navy-200">Copy</button>
                              <button onClick={() => handleRevokeLink(contact.id, link.id)} className="px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">Revoke</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-navy-500 italic mb-3">No links generated yet.</p>
                )}
                {canManage && (
                  <Button variant="secondary" size="sm" className="w-full text-xs" onClick={() => handleGenerateLink(contact.id)}>
                    Generate New Magic Link
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
