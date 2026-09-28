"use client";

import React, { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface ProjectNotification {
  id: string;
  project_id: string;
  project_code: string;
  title: string;
  message: string;
  event_type: string;
  action_url: string;
  is_read: boolean;
  created_at: string;
}

interface Props {
  projectId: string;
  projectCode: string;
}

export function NotificationsTab({ projectId, projectCode }: Props) {
  const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("Weekly Delivery Status & Milestone Update");
  const [eventType, setEventType] = useState("progress_digest");
  const [message, setMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`/api/pmt/projects/${projectCode || projectId}/notifications`);
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [projectId, projectCode]);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/pmt/projects/${projectCode || projectId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          message,
          event_type: eventType,
        }),
      });

      if (res.ok) {
        showToast("Notification dispatched to project stakeholders!");
        setIsModalOpen(false);
        setMessage("");
        await fetchNotifications();
      } else {
        alert("Failed to send notification");
      }
    } catch (err: any) {
      alert("Error sending notification: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case "stage_gate_passed":
        return <ColorBadge colorClass="bg-emerald-50 text-emerald-700 border border-emerald-200">STAGE-GATE</ColorBadge>;
      case "invoice_dispatched":
        return <ColorBadge colorClass="bg-blue-50 text-blue-700 border border-blue-200">INVOICE</ColorBadge>;
      case "milestone_completed":
        return <ColorBadge colorClass="bg-purple-50 text-purple-700 border border-purple-200">MILESTONE</ColorBadge>;
      default:
        return <ColorBadge colorClass="bg-amber-50 text-amber-700 border border-amber-200">UPDATE</ColorBadge>;
    }
  };

  if (loading) return <div className="p-6 h-64 bg-navy-50 animate-pulse rounded-xl" />;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-navy-700">
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Notifications Header */}
      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-navy-900">Stakeholder Notifications Log</h3>
            <p className="text-xs text-navy-500">Automated stage-gate alerts, invoice releases, and broadcast messages</p>
          </div>
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
            Send Notification
          </Button>
        </div>

        <div className="divide-y divide-neutral-100">
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-navy-400">
              No notifications sent for this project yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="p-5 hover:bg-neutral-50/60 transition-colors flex items-start gap-4">
                <div className="mt-1 p-2 rounded-xl bg-navy-900/5 text-navy-600">
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-navy-900">{n.title}</h4>
                      {getEventBadge(n.event_type)}
                    </div>
                    <span className="text-xs text-navy-400 tabular-nums whitespace-nowrap">
                      {formatDate(n.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-navy-600 mt-1 whitespace-pre-line leading-relaxed">
                    {n.message}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Compose Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Send Stakeholder Notification"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSendNotification} disabled={isSubmitting}>
              {isSubmitting ? "Dispatching..." : "Dispatch Notification"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSendNotification} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Event Category *
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
            >
              <option value="progress_digest">Weekly Delivery Digest</option>
              <option value="stage_gate_passed">Stage-Gate Approval Formal Notice</option>
              <option value="milestone_completed">Milestone Completion Sign-off</option>
              <option value="invoice_dispatched">Invoice Payment Advisory</option>
              <option value="critical_escalation">Risk & Issue Escalation</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Notification Subject / Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Message Content *
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              placeholder="Provide delivery updates, sign-off confirmations, or notes for the client & team..."
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
