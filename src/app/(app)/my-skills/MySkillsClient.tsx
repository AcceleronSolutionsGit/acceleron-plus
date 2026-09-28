"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const INTERNAL_DEPARTMENTS = [
  "SAP",
  "Non-SAP",
  "Director",
  "Account",
  "HR",
  "Operations",
  "IT Infra",
  "Sales",
  "Zoho",
] as const;

const DEPT_BADGE: Record<string, string> = {
  SAP: "bg-blue-100 text-blue-800",
  "Non-SAP": "bg-indigo-100 text-indigo-800",
  Director: "bg-amber-100 text-amber-800",
  Account: "bg-emerald-100 text-emerald-800",
  HR: "bg-rose-100 text-rose-800",
  Operations: "bg-orange-100 text-orange-800",
  "IT Infra": "bg-cyan-100 text-cyan-800",
  Sales: "bg-violet-100 text-violet-800",
  Zoho: "bg-teal-100 text-teal-800",
};

// ═══════════════════════════════════════════════════════════════
// What I can do.
//
// The employee master is only as good as what is in it, and an admin
// typing in a hundred people's skills is how it goes stale. The person
// who knows is the person themselves.
// ═══════════════════════════════════════════════════════════════

const PROFICIENCY: Record<number, string> = {
  1: "Aware",
  2: "Working",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

interface CatalogueSkill {
  id: string;
  name: string;
  category: string | null;
  peopleCount: number;
}

interface MySkill {
  skillId: string;
  name: string;
  category: string | null;
  proficiency: number;
  yearsExperience: number | null;
  isPrimary: boolean;
}

export function MySkillsClient({ userName }: { userName: string }) {
  const [catalogue, setCatalogue] = useState<CatalogueSkill[]>([]);
  const [mine, setMine] = useState<MySkill[]>([]);
  const [linked, setLinked] = useState(true);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [search, setSearch] = useState("");

  // ── My Profile ──────────────────────────────────────────────────
  const [profileLinked, setProfileLinked] = useState(true);
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [darwinboxDepartment, setDarwinboxDepartment] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cRes, mRes, pRes] = await Promise.all([
        fetch("/api/skills"),
        fetch("/api/me/skills"),
        fetch("/api/me/profile"),
      ]);
      const cData = await cRes.json().catch(() => ({}));
      const mData = await mRes.json().catch(() => ({}));
      const pData = await pRes.json().catch(() => ({}));
      setCatalogue(cData.skills ?? []);
      setMine(mData.skills ?? []);
      setLinked(mData.linked !== false);
      setNotice(mData.message ?? "");
      setProfileLinked(pData.linked !== false);
      setDesignation(pData.designation ?? "");
      setDepartment(pData.department ?? "");
      setDarwinboxDepartment(pData.darwinboxDepartment ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const held = useMemo(() => new Set(mine.map((s) => s.skillId)), [mine]);

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, CatalogueSkill[]>();
    for (const skill of catalogue) {
      if (term && !skill.name.toLowerCase().includes(term)) continue;
      const key = skill.category ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(skill);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalogue, search]);

  const toggle = (skill: CatalogueSkill) => {
    setMine((prev) =>
      held.has(skill.id)
        ? prev.filter((s) => s.skillId !== skill.id)
        : [
            ...prev,
            {
              skillId: skill.id,
              name: skill.name,
              category: skill.category,
              proficiency: 3,
              yearsExperience: null,
              isPrimary: false,
            },
          ]
    );
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setHint("");
    try {
      const res = await fetch("/api/me/skills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: mine.map((s) => ({
            skillId: s.skillId,
            proficiency: s.proficiency,
            yearsExperience: s.yearsExperience,
            isPrimary: s.isPrimary,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Not saved.");
        return;
      }
      setHint(`Saved — ${data.count} ${data.count === 1 ? "skill" : "skills"} on your profile.`);
      setTimeout(() => setHint(""), 4000);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designation, department }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(data.error || "Could not save your profile.");
        return;
      }
      setProfileNotice(data.message || "Profile updated.");
      setProfileDirty(false);
      setTimeout(() => setProfileNotice(""), 4000);
    } finally {
      setProfileBusy(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-navy-500">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            My skills
          </h1>
          <p className="text-sm text-navy-500 mt-1 max-w-xl">
            What {userName.split(" ")[0]} can do. Project managers search this when they staff work,
            so keeping it current is how you get put on the projects you want.
          </p>
        </div>
        {linked && (
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save my skills"}
          </Button>
        )}
      </div>

      {/* ── My Profile card ─────────────────────────────────────────── */}
      <Card>
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-navy-900">My Profile</h2>
            <p className="text-xs text-navy-500 mt-0.5">
              Update your designation and team. These appear in staffing and resource searches.
            </p>
          </div>
          {profileLinked && profileDirty && (
            <button
              onClick={saveProfile}
              disabled={profileBusy}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {profileBusy && (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              Save profile
            </button>
          )}
        </div>

        <div className="p-5">
          {!profileLinked ? (
            <div className="bg-amber-500/5 border border-amber-500/30 text-amber-800 text-sm rounded-lg px-4 py-3">
              Your account is not linked to an employee record yet. An administrator can link it from People &amp; Roles.
            </div>
          ) : (
            <div className="space-y-4">
              {profileError && (
                <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-xs rounded-lg px-3 py-2">
                  {profileError}
                </div>
              )}
              {profileNotice && !profileError && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {profileNotice}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Designation */}
                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1.5">
                    Designation
                    <span className="ml-1.5 text-[10px] font-normal text-navy-400">(your job title)</span>
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => { setDesignation(e.target.value); setProfileDirty(true); }}
                    placeholder="e.g. Senior Consultant, Solution Architect…"
                    maxLength={200}
                    className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none transition-all"
                  />
                </div>

                {/* Internal Department */}
                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1.5">
                    Department / Team
                    <span className="ml-1.5 text-[10px] font-normal text-navy-400">(Acceleron team)</span>
                  </label>
                  <select
                    value={department}
                    onChange={(e) => { setDepartment(e.target.value); setProfileDirty(true); }}
                    className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white transition-all"
                  >
                    <option value="">— Select your team —</option>
                    {INTERNAL_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {department && (
                    <span className={`mt-1.5 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      DEPT_BADGE[department] ?? "bg-neutral-100 text-navy-600"
                    }`}>
                      {department}
                    </span>
                  )}
                  {darwinboxDepartment && !department && (
                    <p className="mt-1 text-[11px] text-navy-400">
                      From HR: <span className="font-medium text-navy-600">{darwinboxDepartment}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {!linked && (
        <div className="bg-amber-500/5 border border-amber-500/30 text-amber-800 text-sm rounded-lg px-4 py-3">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {hint && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 text-sm rounded-lg px-4 py-3">
          {hint}
        </div>
      )}

      {/* What I have said so far */}
      <Card>
        <div className="px-5 py-4 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-navy-900">
            On my profile
            <span className="ml-1.5 text-navy-500 font-normal">({mine.length})</span>
          </h2>
          <p className="text-xs text-navy-500 mt-0.5">
            Set how strong each one is, and tick the few you would call your main skills.
          </p>
        </div>

        <div className="p-5">
          {mine.length === 0 ? (
            <p className="text-sm text-navy-500">
              Nothing yet. Pick from the catalogue below — start with what you would be comfortable
              being staffed on tomorrow.
            </p>
          ) : (
            <div className="space-y-2">
              {mine.map((skill, index) => (
                <div
                  key={skill.skillId}
                  className="flex items-center gap-3 flex-wrap bg-neutral-50/70 rounded-lg px-3 py-2"
                >
                  <span className="text-sm font-medium text-navy-900 min-w-[170px]">
                    {skill.name}
                    {skill.category && (
                      <span className="text-[10px] text-navy-500 font-normal ml-1.5">
                        {skill.category}
                      </span>
                    )}
                  </span>

                  <label className="text-[11px] text-navy-500 flex items-center gap-1.5">
                    level
                    <select
                      value={skill.proficiency}
                      onChange={(e) =>
                        setMine((prev) =>
                          prev.map((s, i) =>
                            i === index ? { ...s, proficiency: Number(e.target.value) } : s
                          )
                        )
                      }
                      className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>
                          {level} · {PROFICIENCY[level]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-[11px] text-navy-500 flex items-center gap-1.5">
                    years
                    <input
                      type="number"
                      min={0}
                      max={60}
                      step={0.5}
                      value={skill.yearsExperience ?? ""}
                      onChange={(e) =>
                        setMine((prev) =>
                          prev.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  yearsExperience:
                                    e.target.value === "" ? null : Number(e.target.value),
                                }
                              : s
                          )
                        )
                      }
                      className="w-16 text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
                    />
                  </label>

                  <label className="text-[11px] text-navy-500 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skill.isPrimary}
                      onChange={(e) =>
                        setMine((prev) =>
                          prev.map((s, i) => (i === index ? { ...s, isPrimary: e.target.checked } : s))
                        )
                      }
                    />
                    main skill
                  </label>

                  <button
                    onClick={() => setMine((prev) => prev.filter((_, i) => i !== index))}
                    className="ml-auto text-[11px] text-red-600 underline cursor-pointer"
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* The catalogue */}
      <Card>
        <div className="px-5 py-4 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-navy-900">Pick from the catalogue</h2>
          <div className="mt-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search — Laravel, SAP FICO, Kubernetes…"
            />
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[460px] overflow-y-auto">
          {grouped.length === 0 && (
            <p className="text-sm text-navy-500">
              Nothing matches. An administrator can add a skill to the catalogue.
            </p>
          )}
          {grouped.map(([category, skills]) => (
            <div key={category}>
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-1.5">
                {category}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => {
                  const on = held.has(skill.id);
                  return (
                    <button
                      key={skill.id}
                      onClick={() => toggle(skill)}
                      disabled={!linked}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        on
                          ? "bg-navy-900 text-white border-navy-900"
                          : "bg-white text-navy-700 border-neutral-200 hover:border-navy-500/40"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {skill.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {linked && mine.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save my skills"}
          </Button>
        </div>
      )}
    </div>
  );
}
