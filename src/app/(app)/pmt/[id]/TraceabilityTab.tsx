"use client";

import React, { useState } from "react";
import type { Requirement, TestCase, WBSItem } from "@/lib/types";

interface Props {
  requirements: Requirement[];
  testCases: TestCase[];
  wbsItems: WBSItem[];
}

export function TraceabilityTab({ requirements, testCases, wbsItems }: Props) {
  const [filter, setFilter] = useState("all");

  const requirementMap = requirements.reduce((acc, r) => {
    acc[r.id] = r;
    return acc;
  }, {} as Record<string, Requirement>);

  const wbsMap = wbsItems.reduce((acc, w) => {
    acc[w.id] = w;
    return acc;
  }, {} as Record<string, WBSItem>);

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col h-[700px]">
      <div className="p-4 border-b border-neutral-200 flex justify-between items-center">
        <h2 className="text-lg font-bold text-navy-900">Traceability Matrix</h2>
        <select 
          className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Requirements</option>
          <option value="uncovered">Uncovered (Missing Tests)</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-neutral-50 sticky top-0 z-10">
            <tr>
              <th className="p-3 border-b border-r border-neutral-200 text-xs font-bold text-navy-900 uppercase">Requirement</th>
              <th className="p-3 border-b border-r border-neutral-200 text-xs font-bold text-navy-900 uppercase">WBS Tasks</th>
              <th className="p-3 border-b border-neutral-200 text-xs font-bold text-navy-900 uppercase">Test Cases</th>
            </tr>
          </thead>
          <tbody>
            {requirements.filter(req => {
              if (filter === "uncovered") {
                return !testCases.some(t => t.requirementId === req.id);
              }
              return true;
            }).map(req => {
              const reqTests = testCases.filter(t => t.requirementId === req.id);
              // Find WBS tasks that are either directly linked to this requirement's tests, or if we had a direct req->WBS link (we don't yet, but we could).
              const reqWbsIds = new Set(reqTests.map(t => t.wbsId).filter(Boolean));
              const reqWbsItems = Array.from(reqWbsIds).map(id => wbsMap[id!]).filter(Boolean);

              return (
                <tr key={req.id} className="border-b border-neutral-200 hover:bg-neutral-50/50 transition-colors">
                  <td className="p-3 border-r border-neutral-200 align-top max-w-[250px]">
                    <div className="font-bold text-sm text-navy-900 mb-1">{req.title}</div>
                    <div className="flex gap-2 text-[10px] uppercase font-bold">
                      <span className="bg-neutral-100 text-neutral-600 px-1.5 rounded">{req.state.replace("_", " ")}</span>
                      <span className="bg-neutral-100 text-neutral-600 px-1.5 rounded">{req.priority}</span>
                    </div>
                  </td>
                  <td className="p-3 border-r border-neutral-200 align-top max-w-[250px]">
                    {reqWbsItems.length === 0 ? (
                      <span className="text-xs text-neutral-400 italic">No tasks linked via tests</span>
                    ) : (
                      <ul className="space-y-1">
                        {reqWbsItems.map(w => (
                          <li key={w.id} className="text-xs text-navy-700 bg-white border border-neutral-200 rounded px-2 py-1 shadow-sm">
                            <span className="font-mono text-[10px] font-bold mr-1">{w.code}</span>
                            {w.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-3 align-top max-w-[300px]">
                    {reqTests.length === 0 ? (
                      <span className="text-xs text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded border border-red-100">Missing Coverage</span>
                    ) : (
                      <ul className="space-y-2">
                        {reqTests.map(test => (
                          <li key={test.id} className="bg-white border border-neutral-200 rounded px-2 py-1.5 shadow-sm">
                            <div className="text-xs font-semibold text-navy-900">{test.title}</div>
                            <div className="flex gap-2 text-[10px] font-bold mt-1">
                              <span className={test.status === 'passed' ? 'text-emerald-600' : test.status === 'failed' ? 'text-red-600' : 'text-neutral-500'}>
                                {test.status.replace("_", " ").toUpperCase()}
                              </span>
                              <span className="text-neutral-400">{test.type.toUpperCase()}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
            {requirements.length === 0 && (
              <tr>
                <td colSpan={3} className="p-10 text-center text-sm text-neutral-400">
                  No requirements found for traceability matrix.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
