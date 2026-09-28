"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { todayISO } from "@/lib/dates";

export function LogTimeWidget({ ticketId, projectId }: { ticketId: string, projectId: string }) {
  const [hours, setHours] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hours || isNaN(Number(hours))) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/timesheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: Number(hours),
          taskDescription: `Logged from ticket ${ticketId}`,
          itsmTicketId: ticketId,
          dateLogged: todayISO()
        }),
      });

      if (res.ok) {
        alert("Time logged successfully to project timesheets!");
        setHours("");
      } else {
        const data = await res.json();
        alert(`Failed to log time: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to log time due to network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Project Time Tracking" padding="md">
      <div className="space-y-3">
        <p className="text-xs text-navy-500">
          This ticket is linked to Project <strong>{projectId}</strong>. 
          Hours logged here will automatically sync to PMT timesheets.
        </p>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input 
            type="number" 
            min="0.5" 
            step="0.5" 
            placeholder="Hours (e.g. 1.5)" 
            value={hours} 
            onChange={(e) => setHours(e.target.value)} 
            disabled={loading}
          />
          <Button type="submit" disabled={!hours || loading} variant="primary">
            {loading ? "..." : "Log"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
