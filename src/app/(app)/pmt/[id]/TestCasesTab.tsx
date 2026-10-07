"use client";

import React, { useState } from "react";
import type { TestCase, TestSuite, Requirement, WBSItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Combobox } from "@/components/ui/Combobox";
import { ColorBadge } from "@/components/ui/Badge";

interface Props {
  projectId: string;
  initialTestCases: TestCase[];
  initialSuites: TestSuite[];
  requirements: Requirement[];
  wbsItems: WBSItem[];
  canManage: boolean;
}

export function TestCasesTab({ projectId, initialTestCases, initialSuites, requirements, wbsItems, canManage }: Props) {
  const [testCases, setTestCases] = useState<TestCase[]>(initialTestCases);
  const [suites, setSuites] = useState<TestSuite[]>(initialSuites);
  
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<Partial<TestCase>>({});
  
  const displayedTests = testCases.filter(r => r.suiteId === selectedSuiteId || (!r.suiteId && !selectedSuiteId));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const isNew = !editingTest.id;
    const url = isNew ? `/api/pmt/projects/${projectId}/test-cases` : `/api/pmt/projects/${projectId}/test-cases/${editingTest.id}`;
    const method = isNew ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editingTest, suiteId: editingTest.suiteId || selectedSuiteId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (isNew) {
          setTestCases([...testCases, data.testCase]);
        } else {
          setTestCases(testCases.map(r => r.id === editingTest.id ? data.testCase : r));
        }
        setIsTestModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save test case");
    }
  };

  const statusColor = (state: string) => {
    switch(state) {
      case "passed": return "bg-emerald-100 text-emerald-800";
      case "failed": return "bg-red-100 text-red-800";
      case "blocked": return "bg-orange-100 text-orange-800";
      case "skipped": return "bg-neutral-100 text-neutral-500";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  return (
    <div className="flex h-[700px] border border-neutral-200 rounded-xl overflow-hidden bg-white">
      {/* Sidebar: Suite Tree */}
      <div className="w-64 bg-neutral-50 border-r border-neutral-200 flex flex-col">
        <div className="p-3 border-b border-neutral-200 bg-white">
          <h3 className="font-bold text-navy-900">Test Suites</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setSelectedSuiteId(null)}
            className={cn(
              "w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between",
              selectedSuiteId === null ? "bg-blue-50 text-blue-700" : "hover:bg-neutral-200 text-navy-700"
            )}
          >
            <span>📁 All Test Cases</span>
            <span className="text-[10px] bg-white border border-neutral-200 px-1.5 rounded-full text-neutral-500">
              {testCases.length}
            </span>
          </button>
          {suites.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedSuiteId(s.id)}
              className={cn(
                "w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ml-2",
                selectedSuiteId === s.id ? "bg-blue-50 text-blue-700" : "hover:bg-neutral-200 text-navy-700"
              )}
            >
              <span>📁 {s.name}</span>
              <span className="text-[10px] bg-white border border-neutral-200 px-1.5 rounded-full text-neutral-500">
                {testCases.filter(r => r.suiteId === s.id).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-neutral-200 flex justify-between items-center bg-white">
          <h2 className="text-lg font-bold text-navy-900">
            {selectedSuiteId === null ? "All Test Cases" : suites.find(s => s.id === selectedSuiteId)?.name || "Suite"}
          </h2>
          {canManage && (
            <Button onClick={() => { setEditingTest({}); setIsTestModalOpen(true); }}>
              Add Test Case
            </Button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50">
          {displayedTests.length === 0 ? (
            <div className="text-center text-neutral-400 py-10 text-sm">No test cases found in this view.</div>
          ) : (
            displayedTests.map(test => (
              <div key={test.id} className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-col gap-3 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => { setEditingTest(test); setIsTestModalOpen(true); }}>
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-bold text-navy-900 text-sm">{test.title}</h4>
                  <div className="flex items-center gap-2 shrink-0">
                    <ColorBadge colorClass={statusColor(test.status)} className="text-[10px] uppercase font-bold">{test.status.replace("_", " ")}</ColorBadge>
                    <ColorBadge colorClass="bg-neutral-100 text-neutral-600" className="text-[10px] uppercase font-bold">{test.type}</ColorBadge>
                  </div>
                </div>
                {test.steps && (
                  <p className="text-xs text-navy-600 line-clamp-2"><span className="font-semibold">Steps:</span> {test.steps}</p>
                )}
                {test.expectedResult && (
                  <p className="text-xs text-navy-600 line-clamp-2"><span className="font-semibold">Expected:</span> {test.expectedResult}</p>
                )}
                <div className="flex justify-between items-center text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                  <div className="flex gap-4">
                    {test.requirementId && <span>Req: <span className="font-semibold text-navy-700">{requirements.find(r => r.id === test.requirementId)?.title || "Linked"}</span></span>}
                    {test.wbsId && <span>WBS: <span className="font-semibold text-navy-700">{wbsItems.find(w => w.id === test.wbsId)?.name || "Linked"}</span></span>}
                  </div>
                  {test.owner && <span>Owner: <span className="font-semibold text-navy-700">{test.owner.fullName}</span></span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal isOpen={isTestModalOpen} onClose={() => setIsTestModalOpen(false)} title={editingTest.id ? "Edit Test Case" : "New Test Case"} footer={
        <>
          <Button variant="secondary" onClick={() => setIsTestModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Test Case</Button>
        </>
      }>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Title</label>
            <Input value={editingTest.title || ""} onChange={e => setEditingTest({...editingTest, title: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Steps</label>
            <textarea
              value={editingTest.steps || ""}
              onChange={e => setEditingTest({...editingTest, steps: e.target.value})}
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Expected Result</label>
            <textarea
              value={editingTest.expectedResult || ""}
              onChange={e => setEditingTest({...editingTest, expectedResult: e.target.value})}
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Combobox label="Status" value={editingTest.status || "not_run"} onChange={v => setEditingTest({...editingTest, status: v as any})} options={[
              { value: "not_run", label: "Not Run" },
              { value: "passed", label: "Passed" },
              { value: "failed", label: "Failed" },
              { value: "blocked", label: "Blocked" },
              { value: "skipped", label: "Skipped" },
            ]} />
            <Combobox label="Type" value={editingTest.type || "manual"} onChange={v => setEditingTest({...editingTest, type: v as any})} options={[
              { value: "manual", label: "Manual" },
              { value: "api", label: "API" },
              { value: "automated", label: "Automated" },
            ]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Combobox label="Link Requirement" value={editingTest.requirementId || ""} onChange={v => setEditingTest({...editingTest, requirementId: v || undefined})} options={[
              { value: "", label: "None" },
              ...requirements.map(r => ({ value: r.id, label: r.title }))
            ]} />
            <Combobox label="Link WBS Task" value={editingTest.wbsId || ""} onChange={v => setEditingTest({...editingTest, wbsId: v || undefined})} options={[
              { value: "", label: "None" },
              ...wbsItems.map(w => ({ value: w.id, label: `${w.code} - ${w.name}` }))
            ]} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
