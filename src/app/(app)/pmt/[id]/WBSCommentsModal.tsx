"use client";

import React, { useState, useEffect } from "react";
import type { WBSItem } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ColorBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

interface Comment {
  id: string;
  project_id: string;
  wbs_item_id: string;
  author_name: string;
  author_role: "client" | "internal" | "stakeholder";
  comment_text: string;
  status: "open" | "addressed" | "closed";
  created_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wbsItem: WBSItem | null;
  projectId: string;
}

export function WBSCommentsModal({ isOpen, onClose, wbsItem, projectId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [authorName, setAuthorName] = useState("Client Stakeholder");
  const [authorRole, setAuthorRole] = useState<"client" | "internal">("client");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComments = async () => {
    if (!wbsItem) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/wbs-comments?wbsItemId=${wbsItem.id}`);
      if (res.ok) {
        const json = await res.json();
        setComments(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load WBS comments", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && wbsItem) {
      fetchComments();
    }
  }, [isOpen, wbsItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !wbsItem) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/wbs-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wbs_item_id: wbsItem.id,
          author_name: authorName,
          author_role: authorRole,
          comment_text: newComment.trim(),
        }),
      });

      if (res.ok) {
        setNewComment("");
        await fetchComments();
      }
    } catch (err) {
      console.error("Failed to submit comment", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (commentId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "open" ? "addressed" : "open";
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/wbs-comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId,
          status: nextStatus,
        }),
      });

      if (res.ok) {
        await fetchComments();
      }
    } catch (err) {
      console.error("Failed to update comment status", err);
    }
  };

  if (!wbsItem) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`WBS Client Feedback: ${wbsItem.code}`}
      footer={
        <div className="flex justify-end w-full">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200/60">
          <p className="text-xs font-mono font-bold text-navy-500">{wbsItem.code}</p>
          <h4 className="text-sm font-bold text-navy-900 mt-0.5">{wbsItem.name}</h4>
          {(wbsItem as any).description && (
            <p className="text-xs text-navy-600 mt-1">{(wbsItem as any).description}</p>
          )}
        </div>

        {/* Comments List */}
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-8 text-center text-xs text-navy-400">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="py-8 text-center text-xs text-navy-400 bg-neutral-50/50 rounded-lg">
              No client comments yet on this deliverable. Post feedback below.
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className={`p-3 rounded-lg border transition-colors ${
                  c.status === "addressed"
                    ? "bg-emerald-50/40 border-emerald-200"
                    : c.author_role === "client"
                    ? "bg-blue-50/40 border-blue-200"
                    : "bg-white border-neutral-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-navy-900">{c.author_name}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        c.author_role === "client" ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-navy-700"
                      }`}
                    >
                      {c.author_role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-navy-400 tabular-nums">{formatDate(c.created_at)}</span>
                    <button
                      onClick={() => handleToggleStatus(c.id, c.status)}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                        c.status === "addressed"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                      }`}
                    >
                      {c.status === "addressed" ? "✓ Addressed" : "Mark Addressed"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-navy-800 whitespace-pre-line leading-relaxed mt-1">
                  {c.comment_text}
                </p>
              </div>
            ))
          )}
        </div>

        {/* New Comment Input */}
        <form onSubmit={handleSubmit} className="pt-3 border-t border-neutral-100 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your Name / Client Role..."
              className="text-xs px-2.5 py-1.5 border border-neutral-200 rounded-lg text-navy-900 flex-1 focus:outline-none focus:ring-1 focus:ring-navy-700/20"
              required
            />
            <select
              value={authorRole}
              onChange={(e) => setAuthorRole(e.target.value as any)}
              className="text-xs px-2 py-1.5 border border-neutral-200 rounded-lg text-navy-900 bg-white"
            >
              <option value="client">Client</option>
              <option value="internal">Delivery Team</option>
            </select>
          </div>

          <div className="flex gap-2">
            <textarea
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add client feedback, requirement clarifications, or change request notes..."
              className="w-full text-xs border border-neutral-200 rounded-lg p-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
              required
            />
            <Button size="sm" type="submit" disabled={isSubmitting || !newComment.trim()}>
              {isSubmitting ? "..." : "Post"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
