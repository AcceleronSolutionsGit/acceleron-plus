"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ColorBadge, Badge } from "@/components/ui/Badge";

interface Props {
  isScopeOpen: boolean;
  onCloseScope: () => void;
  isSolutionOpen: boolean;
  onCloseSolution: () => void;
  projectCode: string;
  projectName: string;
  clientName?: string;
}

export function ScopeAndSolutionModals({
  isScopeOpen,
  onCloseScope,
  isSolutionOpen,
  onCloseSolution,
  projectCode,
  projectName,
  clientName = "Global Tech Inc.",
}: Props) {
  return (
    <>
      {/* ─── 1. SCOPE OF WORK & CHARTER MODAL ───────────────────────── */}
      <Modal
        isOpen={isScopeOpen}
        onClose={onCloseScope}
        title={`Scope Baseline & Deliverables Statement: ${projectCode}`}
        className="max-w-3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-navy-400">Status: Signed & PMO Approved (v2.1)</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onCloseScope}>
                Close
              </Button>
              <Button size="sm" onClick={() => alert("Downloading PRJ-0089-Scope-Baseline-v2.1.pdf...")}>
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-6 text-sm text-navy-800">
          {/* Document Header Info */}
          <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-navy-900 text-white px-2 py-0.5 rounded">
                  {projectCode}
                </span>
                <span className="font-bold text-navy-900">{projectName}</span>
              </div>
              <ColorBadge colorClass="bg-emerald-50 text-emerald-700 border border-emerald-200">
                APPROVED BASELINE
              </ColorBadge>
            </div>
            <p className="text-xs text-navy-500">
              Client Sponsor: <span className="font-semibold text-navy-700">{clientName}</span> • Version 2.1 • Baseline Date: June 20, 2026
            </p>
          </div>

          {/* Section 1: Executive Summary */}
          <div>
            <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              1. Project Objective & Scope Statement
            </h4>
            <p className="text-xs text-navy-700 leading-relaxed bg-white p-3 rounded-lg border border-neutral-100">
              The purpose of the Global Tech ERP Rollout project is to design, configure, integrate, and deploy an enterprise-grade ERP delivery platform. This encompasses multi-entity accounting, delivery project management (PMT), Darwinbox HRMS automated grade synchronization (M2 to G5 hierarchy), and ITSM automated service desk ticket governance.
            </p>
          </div>

          {/* Section 2: In-Scope vs Out-of-Scope */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200/60 space-y-2">
              <h5 className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>✓</span> In-Scope Deliverables
              </h5>
              <ul className="text-xs text-emerald-950 space-y-1.5 list-disc list-inside">
                <li>Core Financials & Multi-currency General Ledger</li>
                <li>Darwinbox Employee Master Sync & Grade Mapping</li>
                <li>Interactive Gantt Timeline & WBS Phase Tracking</li>
                <li>Stage-Gate Governance & Compliance Audits (Gates 1-5)</li>
                <li>Client Feedback Threads directly on WBS deliverables</li>
                <li>Milestone-based Tax Invoicing & Real-time Payment Tracking</li>
              </ul>
            </div>

            <div className="bg-rose-50/40 p-4 rounded-xl border border-rose-200/60 space-y-2">
              <h5 className="font-bold text-xs text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>✕</span> Out-of-Scope Exclusions
              </h5>
              <ul className="text-xs text-rose-950 space-y-1.5 list-disc list-inside">
                <li>Legacy on-premise mainframe data transformation</li>
                <li>Third-party hardware procurement or POS terminal setup</li>
                <li>Custom payroll tax filing outside Indian jurisdiction</li>
                <li>Unapproved custom plugins beyond the ADF architectural envelope</li>
              </ul>
            </div>
          </div>

          {/* Section 3: Acceptance Criteria */}
          <div>
            <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              2. Formal Acceptance Criteria & Stage-Gate Requirements
            </h4>
            <div className="border border-neutral-200 rounded-lg overflow-hidden text-xs">
              <div className="bg-neutral-50 px-3 py-2 font-semibold text-navy-700 grid grid-cols-3 border-b border-neutral-200">
                <span>Deliverable</span>
                <span>Acceptance Standard</span>
                <span className="text-right">Sign-off Entity</span>
              </div>
              <div className="divide-y divide-neutral-100">
                <div className="px-3 py-2 grid grid-cols-3">
                  <span className="font-medium text-navy-900">Stage-Gate 1 & Charter</span>
                  <span className="text-navy-600">Scope baseline approved with zero critical variances</span>
                  <span className="text-right text-navy-500">Client Steering Committee</span>
                </div>
                <div className="px-3 py-2 grid grid-cols-3">
                  <span className="font-medium text-navy-900">Darwinbox Grade Rates</span>
                  <span className="text-navy-600">M2 to G5 rate bands linked and effort estimated</span>
                  <span className="text-right text-navy-500">HR & Delivery PMO</span>
                </div>
                <div className="px-3 py-2 grid grid-cols-3">
                  <span className="font-medium text-navy-900">UAT & Pre-Go-Live</span>
                  <span className="text-navy-600">100% test pass rate with client sign-off certificate</span>
                  <span className="text-right text-navy-500">VP Technology</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ─── 2. SOLUTION APPROACH & ARCHITECTURE MODAL ─────────────── */}
      <Modal
        isOpen={isSolutionOpen}
        onClose={onCloseSolution}
        title={`Solution Approach & Technical Architecture: ${projectCode}`}
        className="max-w-3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-navy-400">Architect: Sabarnik Lahiri • Version 1.4</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onCloseSolution}>
                Close
              </Button>
              <Button size="sm" onClick={() => alert("Downloading PRJ-0089-Solution-Approach-v1.4.pdf...")}>
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-6 text-sm text-navy-800">
          {/* Document Header Info */}
          <div className="bg-gradient-to-r from-navy-900 to-navy-800 text-white p-4 rounded-xl shadow-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded">
                ADF Architecture Specification
              </span>
              <span className="text-xs text-navy-300">ISO 27001 / SOC-2 Compliant</span>
            </div>
            <h3 className="text-base font-bold text-white mt-1">
              End-to-End Enterprise System Topology & Integration Strategy
            </h3>
            <p className="text-xs text-navy-200">
              Multi-Tenant Next.js App Router • Knex PostgreSQL Layered DBs • Darwinbox REST Sync • Zoho CRM & Books Webhooks
            </p>
          </div>

          {/* Architecture Diagram Visualization */}
          <div>
            <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              1. High-Level Architectural Flow
            </h4>
            <div className="bg-navy-950 text-white p-4 rounded-xl font-mono text-xs overflow-x-auto border border-navy-800 space-y-2">
              <div className="text-blue-400 font-bold">// PRESENTATION & LOGIC LAYER</div>
              <div className="text-emerald-400">
                [Client / Browser] ──(HTTPS/WSS)──&gt; [Next.js 15 App Router + Server Actions]
              </div>
              <div className="text-navy-400 pl-8">
                │── PMT Module (Gantt, WBS, Invoices, Governance)
                <br />
                │── ITSM Module (Tickets, SLAs, Agents, History)
                <br />
                └── Master Data Vault (Darwinbox Grade Hierarchy M2→G5)
              </div>
              <div className="text-blue-400 font-bold mt-2">// DATA & INTEGRATION LAYER</div>
              <div className="text-amber-400">
                [Microservice DB Partitioning]
                <br />
                ├── identity_db   : Users, Employee Master (114 synced), Roles
                <br />
                ├── project_db    : Projects, WBS Items, Invoices, Comments, Governance
                <br />
                └── itsm_db       : Tickets, Service Groups, Closers, Activity
              </div>
              <div className="text-blue-400 font-bold mt-2">// EXTERNAL ENTERPRISE BRIDGES</div>
              <div className="text-purple-300">
                ├── [Darwinbox HRMS API] : Basic Auth Sync (company code ASPL)
                <br />
                └── [Zoho Books / CRM]   : Sales Orders & Revenue Recognition Bridge
              </div>
            </div>
          </div>

          {/* Section 2: Solution Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
              <span className="text-lg block mb-1">🔐</span>
              <h5 className="font-bold text-xs text-navy-900 mb-1">Security & Multi-Tenancy</h5>
              <p className="text-[11px] text-navy-600 leading-relaxed">
                Role-based access controls (Admin, PM, Member, Client Visible) with session cookies and partitioned database schemas.
              </p>
            </div>
            <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
              <span className="text-lg block mb-1">⚡</span>
              <h5 className="font-bold text-xs text-navy-900 mb-1">Real-Time Event Tracking</h5>
              <p className="text-[11px] text-navy-600 leading-relaxed">
                Outbox events table logs stage-gate approvals, invoice dispatches, and stakeholder broadcast updates with full auditability.
              </p>
            </div>
            <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
              <span className="text-lg block mb-1">📊</span>
              <h5 className="font-bold text-xs text-navy-900 mb-1">Effort & Rate Mapping</h5>
              <p className="text-[11px] text-navy-600 leading-relaxed">
                Effort estimations dynamically map Darwinbox grades (M2, G1, SRG1, G2, SRG2, G3, SRG3, G4, SRG4, G5) to financial rate cards.
              </p>
            </div>
          </div>

          {/* Section 3: Delivery Methodology */}
          <div>
            <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              2. Delivery Methodology & Stage-Gate Governance
            </h4>
            <p className="text-xs text-navy-700 leading-relaxed bg-white p-3 rounded-lg border border-neutral-100">
              Delivery follows the Acceleron Agile-Stage-Gate hybrid framework. Sprints are executed in 2-week iterations mapped directly to WBS deliverables, while high-level compliance and budgetary controls are governed by formal Stage-Gate checkpoints (Charter, Architecture, Mid-term Build, UAT Readiness, and Post-Implementation).
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
