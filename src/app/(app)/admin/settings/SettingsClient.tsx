"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Combobox } from "@/components/ui/Combobox";

interface AppSettings {
  id: string;
  currency: string;
  date_format: string;
  timezone: string;
  updated_at: string;
}

export function SettingsClient({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setMessage("Settings saved successfully.");
      } else {
        setMessage("Failed to save settings.");
      }
    } catch (err) {
      setMessage("Error saving settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const today = new Date();

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Platform Settings
          </h1>
          <p className="text-navy-500 mt-1">Configure global preferences for the application.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg text-sm font-semibold ${message.includes("success") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message}
        </div>
      )}

      <Card className="p-6">
        <h2 className="text-xl font-bold text-navy-900 mb-6">Localization</h2>
        
        <div className="space-y-6 max-w-xl">
          <div>
            <Combobox 
              label="System Currency" 
              value={settings.currency} 
              onChange={v => setSettings({ ...settings, currency: v })} 
              options={[
                { value: "USD", label: "US Dollar ($)" },
                { value: "EUR", label: "Euro (€)" },
                { value: "GBP", label: "British Pound (£)" },
                { value: "INR", label: "Indian Rupee (₹)" },
                { value: "AUD", label: "Australian Dollar (A$)" },
              ]} 
            />
            <p className="text-xs text-neutral-500 mt-1">Used for project financials, margins, and cost summaries.</p>
          </div>

          <div>
            <Combobox 
              label="Date Format" 
              value={settings.date_format} 
              onChange={v => setSettings({ ...settings, date_format: v })} 
              options={[
                { value: "MMM d, yyyy", label: "Oct 2, 2026 (MMM d, yyyy)" },
                { value: "dd/MM/yyyy", label: "02/10/2026 (dd/MM/yyyy)" },
                { value: "MM/dd/yyyy", label: "10/02/2026 (MM/dd/yyyy)" },
                { value: "yyyy-MM-dd", label: "2026-10-02 (yyyy-MM-dd)" },
              ]} 
            />
            <p className="text-xs text-neutral-500 mt-1">Controls how dates are displayed in tables and exports.</p>
          </div>

          <div>
            <Combobox 
              label="Timezone" 
              value={settings.timezone} 
              onChange={v => setSettings({ ...settings, timezone: v })} 
              options={[
                { value: "UTC", label: "UTC" },
                { value: "America/New_York", label: "Eastern Time (US & Canada)" },
                { value: "America/Chicago", label: "Central Time (US & Canada)" },
                { value: "America/Denver", label: "Mountain Time (US & Canada)" },
                { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
                { value: "Europe/London", label: "London" },
                { value: "Europe/Paris", label: "Paris" },
                { value: "Asia/Kolkata", label: "India Standard Time" },
                { value: "Asia/Tokyo", label: "Tokyo" },
                { value: "Australia/Sydney", label: "Sydney" },
              ]} 
            />
            <p className="text-xs text-neutral-500 mt-1">Default timezone for automated job schedules and SLA tracking.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
