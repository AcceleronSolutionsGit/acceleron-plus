"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const TICKET_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const TICKET_TYPES = [
  { value: "incident", label: "Incident" },
  { value: "service_request", label: "Service Request" },
  { value: "problem", label: "Problem" },
  { value: "query", label: "Query" },
];

const TICKET_IMPACTS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const TICKET_STATUSES = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "on_hold", label: "On Hold" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

// Reusable premium custom searchable select
const CustomSelect = ({ label, value, onChange, options, required, disabled, className = "", placeholder = "Select...", dropdownPosition = "bottom" }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOpt = options.find((o: any) => o.value === value);
  const displayValue = isOpen ? search : (selectedOpt ? selectedOpt.label : "");

  const filteredOptions = options.filter((o: any) => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-xs font-bold text-navy-700 mb-1.5 tracking-wide">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative group">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => { setIsOpen(true); setSearch(""); }}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          className={`w-full text-sm border border-navy-500/15 rounded-xl pl-3.5 pr-10 py-2.5 bg-neutral-50/50 hover:bg-neutral-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-300 shadow-sm shadow-navy-900/5 ${disabled ? 'opacity-60 cursor-not-allowed bg-neutral-100/80 hover:bg-neutral-100/80' : 'cursor-text hover:border-navy-500/30'}`}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-navy-500/60 group-hover:text-navy-500 transition-colors">
          <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      <div 
        className={`absolute z-50 w-full ${dropdownPosition === 'top' ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top'} bg-white border border-navy-500/10 rounded-xl shadow-lg shadow-navy-900/10 max-h-60 overflow-y-auto custom-scrollbar transition-all duration-200 ease-out ${
          isOpen && !disabled ? "opacity-100 scale-100 visible translate-y-0" : `opacity-0 scale-95 invisible pointer-events-none ${dropdownPosition === 'top' ? 'translate-y-2' : '-translate-y-2'}`
        }`}
      >
        {filteredOptions.length === 0 ? (
          <div className="px-3.5 py-2.5 text-sm text-neutral-500 text-center">No results found</div>
        ) : (
          filteredOptions.map((opt: any) => (
            <div
              key={opt.value}
              onClick={() => {
                onChange({ target: { value: opt.value } });
                setIsOpen(false);
                setSearch("");
              }}
              className={`px-3.5 py-2.5 text-sm cursor-pointer transition-colors ${value === opt.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-navy-700 hover:bg-neutral-50'}`}
            >
              {opt.label}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export function NewTicketClient({
  currentUser,
  requesters,
  companies,
  departments,
  groups,
  categories,
  subCategories,
  items,
  impactAreas,
  projects,
  agents,
}: any) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  const [form, setForm] = useState({
    ticketType: "incident",
    subject: "",
    description: "",
    priority: "medium",
    impact: "medium",
    urgency: "medium",
    requesterId: currentUser?.id || "",
    agentUserId: "",
    projectCode: "",
    projectContextId: "",
    companyId: "",
    departmentId: "",
    groupId: "",
    categoryId: "",
    subCategoryId: "",
    itemId: "",
    impactAreaId: "",
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files));
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const processedAttachments = await Promise.all(
        attachments.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          data: await convertFileToBase64(file),
        }))
      );

      const selectedProject = projects?.find((p: any) => p.code === form.projectCode);

      const payload = {
        ...form,
        requesterId: form.requesterId || currentUser?.id || null,
        agentUserId: form.agentUserId || null,
        projectCode: form.projectCode || null,
        projectContextId: selectedProject?.itsmContextId || form.projectContextId || null,
        attachments: processedAttachments.length > 0 ? processedAttachments : undefined
      };

      const res = await fetch("/api/itsm/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        router.push("/itsm");
        router.refresh();
      } else {
        const errorData = await res.json();
        alert(`Failed to create ticket: ${errorData.error || res.statusText}`);
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create ticket due to network error.");
      setIsSubmitting(false);
    }
  };

  // Mappers for dynamic options
  const mapOpts = (arr: any[]) => arr?.map((a: any) => ({ value: a.id, label: a.name || `${a.firstName} ${a.lastName}` })) || [];

  // Full enterprise requesters list including current user
  const allRequesters = React.useMemo(() => {
    const list = [...(requesters || [])];
    if (currentUser && !list.some((r: any) => r.id === currentUser.id || (r.email && r.email.toLowerCase() === currentUser.email?.toLowerCase()))) {
      list.unshift({
        id: currentUser.id,
        firstName: currentUser.fullName?.split(" ")[0] || "Current",
        lastName: currentUser.fullName?.split(" ").slice(1).join(" ") || "User",
        email: currentUser.email,
        isCurrent: true,
      });
    }
    return list;
  }, [requesters, currentUser]);

  const requesterOpts = allRequesters.map((r: any) => {
    const isMe = currentUser && (r.id === currentUser.id || (r.email && r.email.toLowerCase() === currentUser.email?.toLowerCase()));
    return {
      value: r.id,
      label: `${r.firstName || ""} ${r.lastName || ""} (${r.email || "no-email"})${isMe ? " — [You]" : ""}`,
    };
  });

  const projectOpts = [
    { value: "", label: "No Project (Unlinked)" },
    ...(projects?.map((p: any) => ({
      value: p.code,
      label: `${p.code} — ${p.name} [Phase: ${p.currentPhase || "Discovery"}]`,
    })) || []),
  ];

  const agentOpts = [
    { value: "", label: "Unassigned (Auto-route)" },
    ...(agents?.map((a: any) => ({
      value: a.id,
      label: `${a.fullName || a.full_name || a.email}${a.jobLevel ? ` • ${a.jobLevel}` : ""}${a.officeLocation ? ` (${a.officeLocation})` : ""}`,
    })) || []),
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-full animate-in fade-in duration-500">
      {/* Header with glassmorphism */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-navy-500/10 pb-5 gap-4">
        <div className="flex items-center gap-4">
          <Button 
            type="button" 
            variant="secondary" 
            onClick={() => router.push("/itsm")} 
            className="p-2.5 rounded-full hover:bg-white hover:shadow-md transition-all duration-300 border border-transparent hover:border-navy-500/10"
          >
            <svg className="w-5 h-5 text-navy-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold text-navy-900 tracking-tight font-[family-name:var(--font-league-spartan)]">
              New Ticket
            </h1>
            <p className="text-sm text-navy-500/80 font-medium mt-1">Create a new support request or incident report.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            type="button" 
            variant="secondary" 
            onClick={() => setIsPanelOpen(!isPanelOpen)} 
            className="flex items-center gap-2 rounded-xl transition-all duration-300 hover:shadow-md"
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${!isPanelOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
            {isPanelOpen ? "Hide Properties" : "Show Properties"}
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all duration-300 bg-gradient-to-r from-blue-600 to-blue-700"
          >
            {isSubmitting ? "Creating..." : "Create Ticket"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 relative">
        
        {/* Left Column (Main Content) */}
        <div className="flex-1 space-y-6">
          <div className="bg-white/80 backdrop-blur-xl border border-navy-500/10 rounded-2xl shadow-xl shadow-navy-900/5 overflow-hidden transition-all duration-500">
            
            {/* Ticket Type Tabs */}
            <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-b border-navy-500/10 bg-neutral-100/50">
              <span className="text-sm font-bold text-navy-800 mr-2">Form Type:</span>
              {TICKET_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setForm({ ...form, ticketType: type.value })}
                  className={`px-5 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                    form.ticketType === type.value 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105' 
                      : 'bg-white text-navy-600 hover:bg-neutral-50 hover:text-navy-800 border border-navy-500/10'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {/* Nav Tabs */}
            <div className="flex items-center gap-1 px-4 py-3 border-b border-navy-500/5 bg-neutral-50/80 overflow-x-auto scrollbar-hide">
              <span className="px-4 py-1.5 bg-white shadow-sm rounded-lg text-sm font-bold text-navy-900 flex items-center gap-2 whitespace-nowrap transition-all duration-200">
                <span className="text-blue-500 text-lg">📄</span> Details
              </span>
              <span className="px-4 py-1.5 text-sm font-semibold text-navy-500 hover:bg-navy-500/5 rounded-lg cursor-not-allowed flex items-center gap-2 whitespace-nowrap transition-all duration-200 opacity-70">
                <span className="text-orange-400 text-lg">📋</span> Tasks
              </span>
              <span className="px-4 py-1.5 text-sm font-semibold text-navy-500 hover:bg-navy-500/5 rounded-lg cursor-not-allowed flex items-center gap-2 whitespace-nowrap transition-all duration-200 opacity-70">
                <span className="text-purple-500 text-lg">🔗</span> Associations
              </span>
              <span className="px-4 py-1.5 text-sm font-semibold text-navy-500 hover:bg-navy-500/5 rounded-lg cursor-not-allowed flex items-center gap-2 whitespace-nowrap transition-all duration-200 opacity-70">
                <span className="text-emerald-500 text-lg">✅</span> Approvals
              </span>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="group">
                <label className="block text-sm font-extrabold text-navy-800 mb-2 flex items-center gap-2 transition-colors group-focus-within:text-blue-600">
                  Subject <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.subject}
                  onChange={e => setForm({ ...form, subject: e.target.value })}
                  placeholder="Enter a brief, descriptive summary..."
                  required
                  className="bg-neutral-50/50 hover:bg-neutral-50 focus:bg-white text-base py-3 px-4 rounded-xl border-navy-500/15 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-300 shadow-sm"
                />
              </div>

              <div className="group">
                <label className="block text-sm font-extrabold text-navy-800 mb-2 flex items-center gap-2 transition-colors group-focus-within:text-blue-600">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full text-base border border-navy-500/15 rounded-xl px-4 py-4 bg-neutral-50/50 hover:bg-neutral-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-300 min-h-[240px] shadow-sm resize-y"
                  placeholder="Provide detailed information, steps to reproduce, or relevant context..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-extrabold text-navy-800 mb-2">
                  Attachments
                </label>
                <div className="border-2 border-dashed border-navy-500/20 rounded-2xl p-10 flex flex-col justify-center items-center bg-neutral-50/50 hover:bg-blue-50/50 hover:border-blue-500/30 transition-all duration-300 group relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none" />
                  
                  <div className="bg-white p-4 rounded-full shadow-sm shadow-navy-900/5 mb-4 group-hover:scale-110 group-hover:shadow-md transition-all duration-300">
                    <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  
                  <div className="flex text-sm leading-6 text-navy-600 justify-center font-medium">
                    <label className="relative cursor-pointer rounded-md bg-transparent font-bold text-blue-600 hover:text-blue-700 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 transition-colors">
                      <span>Click to upload</span>
                      <input type="file" multiple onChange={handleFileChange} className="sr-only" />
                    </label>
                    <p className="pl-1">or drag and drop here</p>
                  </div>
                  <p className="text-xs leading-5 text-navy-400 mt-1">PNG, JPG, PDF up to 5MB</p>
                  
                  {attachments.length > 0 && (
                    <div className="mt-6 w-full max-w-md flex flex-col gap-3">
                      {attachments.map((file, i) => (
                        <div key={i} className="text-sm bg-white px-4 py-3 rounded-xl border border-navy-500/10 shadow-sm shadow-navy-900/5 flex items-center justify-between group/file hover:border-blue-500/30 transition-colors">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-500 flex-shrink-0">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            </div>
                            <span className="truncate font-medium text-navy-700">{file.name}</span>
                          </div>
                          <span className="text-navy-400 text-xs font-semibold px-2 py-1 bg-neutral-50 rounded-md">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Properties Card) */}
        <div 
          className={`flex-shrink-0 transition-all duration-500 ease-out overflow-hidden ${
            isPanelOpen ? "w-full lg:w-[400px] opacity-100 translate-x-0" : "w-0 opacity-0 lg:translate-x-12"
          }`}
        >
          <div className="bg-white/90 backdrop-blur-xl border border-navy-500/10 rounded-2xl shadow-xl shadow-navy-900/5 overflow-hidden sticky top-6 w-full lg:w-[400px]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-navy-500/10 bg-gradient-to-r from-navy-900 to-navy-800 text-white">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-white/10 rounded-lg backdrop-blur-md">
                  <svg className="w-5 h-5 text-blue-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="font-extrabold text-lg tracking-wide font-[family-name:var(--font-league-spartan)]">Ticket Properties</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="bg-white text-black hover:bg-neutral-200 p-1.5 rounded-lg transition-all duration-200 shadow-sm"
                aria-label="Close properties panel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              
              <div className="grid grid-cols-2 gap-5">
                <CustomSelect
                  label="Priority"
                  value={form.priority}
                  onChange={(e: any) => setForm({ ...form, priority: e.target.value })}
                  options={TICKET_PRIORITIES}
                  required
                />
                <CustomSelect
                  label="Status"
                  value={form.ticketType === 'new' ? 'new' : 'new'} // Just visual
                  disabled
                  options={TICKET_STATUSES}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-5">
                <CustomSelect
                  label="Impact"
                  value={form.impact}
                  onChange={(e: any) => setForm({ ...form, impact: e.target.value })}
                  options={TICKET_IMPACTS}
                  required
                />
              </div>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-navy-500/10"></div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-navy-700 tracking-wide">Requester</span>
                  {currentUser && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Auto-detected profile
                    </span>
                  )}
                </div>
                <CustomSelect
                  value={form.requesterId}
                  onChange={(e: any) => setForm({ ...form, requesterId: e.target.value })}
                  options={requesterOpts}
                  placeholder="Select Requester..."
                  required
                />
              </div>

              <CustomSelect
                label="Link to Project (PMT)"
                value={form.projectCode}
                onChange={(e: any) => {
                  const p = projects?.find((proj: any) => proj.code === e.target.value);
                  setForm({ ...form, projectCode: e.target.value, projectContextId: p?.itsmContextId || "" });
                }}
                options={projectOpts}
                placeholder="No Project (Unlinked)..."
              />

              <CustomSelect
                label="Assign Agent (Master Employees)"
                value={form.agentUserId}
                onChange={(e: any) => setForm({ ...form, agentUserId: e.target.value })}
                options={agentOpts}
                placeholder="Unassigned / Auto-assign..."
              />

              <CustomSelect
                label="Assignment Group"
                value={form.groupId}
                onChange={(e: any) => setForm({ ...form, groupId: e.target.value })}
                options={mapOpts(groups)}
                placeholder="Unassigned (Auto-route)"
              />

              <CustomSelect
                label="Company"
                value={form.companyId}
                onChange={(e: any) => setForm({ ...form, companyId: e.target.value })}
                options={mapOpts(companies)}
                required
              />

              <CustomSelect
                label="Department"
                value={form.departmentId}
                onChange={(e: any) => setForm({ ...form, departmentId: e.target.value })}
                options={mapOpts(departments?.filter((d: any) => !form.companyId || d.companyId === form.companyId))}
              />

              <CustomSelect
                label="Impact Area"
                value={form.impactAreaId}
                onChange={(e: any) => setForm({ ...form, impactAreaId: e.target.value })}
                options={mapOpts(impactAreas)}
              />

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-navy-500/10"></div>
                </div>
              </div>

              <CustomSelect
                label="Category"
                value={form.categoryId}
                onChange={(e: any) => setForm({ ...form, categoryId: e.target.value, subCategoryId: "", itemId: "" })}
                options={mapOpts(categories)}
                dropdownPosition="top"
              />

              <CustomSelect
                label="Sub-Category"
                value={form.subCategoryId}
                onChange={(e: any) => setForm({ ...form, subCategoryId: e.target.value, itemId: "" })}
                disabled={!form.categoryId}
                options={mapOpts(subCategories?.filter((s: any) => s.categoryId === form.categoryId))}
                dropdownPosition="top"
              />

              <CustomSelect
                label="Item"
                value={form.itemId}
                onChange={(e: any) => setForm({ ...form, itemId: e.target.value })}
                disabled={!form.subCategoryId}
                options={mapOpts(items?.filter((i: any) => i.subCategoryId === form.subCategoryId))}
                dropdownPosition="top"
              />

              <CustomSelect
                label="Assignment Group"
                value={form.groupId}
                onChange={(e: any) => setForm({ ...form, groupId: e.target.value })}
                options={mapOpts(groups)}
                placeholder="Unassigned (Auto-route)"
                dropdownPosition="top"
              />

            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

