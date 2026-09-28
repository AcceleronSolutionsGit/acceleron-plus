"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// ═══════════════════════════════════════════════════════════════
// The skill catalogue, and who holds what.
//
// Two halves that answer different questions: "what do we track?" on
// the left, "what can this person do?" on the right. Staffing a
// project reads both, so keeping them on one screen makes the gap
// between them obvious.
// ═══════════════════════════════════════════════════════════════

const PROFICIENCY: Record<number, string> = {
  1: "Aware",
  2: "Working",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

interface Skill {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  isActive: boolean;
  peopleCount: number;
}

interface Person {
  employeeId: string;
  fullName: string;
  email: string | null;
  designation: string | null;
  department: string | null;
  skillCount: number;
}

interface PersonSkill {
  id: string;
  skillId: string;
  name: string;
  category: string | null;
  proficiency: number;
  yearsExperience: number | null;
  isPrimary: boolean;
}

export function SkillsManagerClient() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadSkills = useCallback(async () => {
    const res = await fetch("/api/skills?includeInactive=true");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSkills(data.skills ?? []);
    else setError(data.error || "Could not load the catalogue.");
  }, []);

  const loadPeople = useCallback(async () => {
    const res = await fetch("/api/admin/users?includeEmployees=true");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setPeople(data.employees ?? []);
  }, []);

  useEffect(() => {
    void Promise.all([loadSkills(), loadPeople()]).finally(() => setLoading(false));
  }, [loadSkills, loadPeople]);

  const filteredPeople = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return people;
    return people.filter((p) =>
      [p.fullName, p.email, p.designation, p.department, p.employeeId]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }, [people, search]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-navy-500">Loading skills…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
          Skills
        </h1>
        <p className="text-sm text-navy-500 mt-1">
          What the practice can do, and who can do it. Staffing a project searches this.
        </p>
      </div>

      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <CataloguePanel skills={skills} onChanged={loadSkills} />

        <Card>
          <div className="px-5 py-4 border-b border-neutral-100">
            <h2 className="text-sm font-semibold text-navy-900">People</h2>
            <p className="text-xs text-navy-500 mt-0.5">
              Choose somebody to record what they can do.
            </p>
            <div className="mt-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, designation or department…"
              />
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto divide-y divide-neutral-100">
            {filteredPeople.length === 0 && (
              <p className="p-6 text-center text-xs text-navy-500">
                Nobody matches. The employee master is filled by the Darwinbox sync.
              </p>
            )}
            {filteredPeople.map((person) => (
              <button
                key={person.employeeId}
                onClick={() => setSelected(person)}
                className={`w-full text-left px-5 py-3 transition-colors cursor-pointer ${
                  selected?.employeeId === person.employeeId
                    ? "bg-navy-900/[0.06]"
                    : "hover:bg-neutral-50"
                }`}
              >
                <p className="text-sm font-medium text-navy-900">{person.fullName}</p>
                <p className="text-[11px] text-navy-500">
                  {[person.designation, person.department].filter(Boolean).join(" · ")}
                  {person.skillCount > 0 && ` · ${person.skillCount} skills`}
                </p>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {selected && (
        <PersonSkillsEditor
          person={selected}
          catalogue={skills.filter((s) => s.isActive)}
          onClose={() => setSelected(null)}
          onSaved={() => {
            void loadSkills();
            void loadPeople();
          }}
        />
      )}
    </div>
  );
}

// ─── The catalogue ─────────────────────────────────────────────────

function CataloguePanel({ skills, onChanged }: { skills: Skill[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category: category.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Could not add it.");
        return;
      }
      setName("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (skill: Skill) => {
    await fetch("/api/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId: skill.id, isActive: !skill.isActive }),
    });
    onChanged();
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Skill[]>();
    for (const skill of skills) {
      const key = skill.category ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(skill);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  const categories = useMemo(
    () => [...new Set(skills.map((s) => s.category).filter(Boolean))] as string[],
    [skills]
  );

  return (
    <Card>
      <div className="px-5 py-4 border-b border-neutral-100">
        <h2 className="text-sm font-semibold text-navy-900">Catalogue</h2>
        <p className="text-xs text-navy-500 mt-0.5">
          {skills.filter((s) => s.isActive).length} in use. Retiring one keeps it on the people who
          hold it — it just stops being offered.
        </p>

        <div className="mt-3 flex gap-2 flex-wrap">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New skill, e.g. Terraform"
            className="flex-1 min-w-[160px]"
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="skill-categories"
            placeholder="Category"
            className="w-36 px-3.5 py-2.5 text-sm rounded-lg border border-navy-500/30"
          />
          <datalist id="skill-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Button onClick={add} disabled={busy || !name.trim()}>
            Add
          </Button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className="max-h-[320px] overflow-y-auto p-4 space-y-3">
        {grouped.map(([group, list]) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-1.5">
              {group}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {list.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => toggle(skill)}
                  title={skill.isActive ? "Retire this skill" : "Bring it back"}
                  className={`text-[11px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                    skill.isActive
                      ? "bg-white border-neutral-200 text-navy-900 hover:border-navy-500/40"
                      : "bg-neutral-50 border-dashed border-neutral-300 text-navy-500/60 line-through"
                  }`}
                >
                  {skill.name}
                  <span className="text-navy-500/60"> · {skill.peopleCount}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── One person's skills ───────────────────────────────────────────

function PersonSkillsEditor({
  person,
  catalogue,
  onClose,
  onSaved,
}: {
  person: Person;
  catalogue: Skill[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<PersonSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [adding, setAdding] = useState("");

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/admin/employees/${encodeURIComponent(person.employeeId)}/skills`)
      .then((r) => r.json())
      .then((d) => setRows(d.skills ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [person.employeeId]);

  const held = new Set(rows.map((r) => r.skillId));
  const available = catalogue.filter((s) => !held.has(s.id));

  const addSkill = (skillId: string) => {
    const skill = catalogue.find((s) => s.id === skillId);
    if (!skill) return;
    setRows((prev) => [
      ...prev,
      {
        id: `new-${skillId}`,
        skillId,
        name: skill.name,
        category: skill.category,
        proficiency: 3,
        yearsExperience: null,
        isPrimary: false,
      },
    ]);
    setAdding("");
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setHint("");
    try {
      const res = await fetch(`/api/admin/employees/${encodeURIComponent(person.employeeId)}/skills`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: rows.map((r) => ({
            skillId: r.skillId,
            proficiency: r.proficiency,
            yearsExperience: r.yearsExperience,
            isPrimary: r.isPrimary,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Not saved.");
        return;
      }
      setHint(`Saved — ${data.count} ${data.count === 1 ? "skill" : "skills"} on file.`);
      onSaved();
      setTimeout(() => setHint(""), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="px-5 py-4 border-b border-neutral-100 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">{person.fullName}</h2>
          <p className="text-xs text-navy-500">
            {[person.designation, person.department, person.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={save} disabled={busy || loading}>
            {busy ? "Saving…" : "Save skills"}
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-3">
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

        {loading ? (
          <p className="text-sm text-navy-500">Loading…</p>
        ) : (
          <>
            {rows.length === 0 && (
              <p className="text-sm text-navy-500">
                Nothing recorded yet. Add a skill below — it is what makes this person findable when
                somebody is staffing a project.
              </p>
            )}

            <div className="space-y-2">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 flex-wrap bg-neutral-50/70 rounded-lg px-3 py-2"
                >
                  <span className="text-sm text-navy-900 font-medium min-w-[150px]">{row.name}</span>

                  <label className="text-[11px] text-navy-500 flex items-center gap-1.5">
                    level
                    <select
                      value={row.proficiency}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, proficiency: Number(e.target.value) } : r
                          )
                        )
                      }
                      className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
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
                      value={row.yearsExperience ?? ""}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  yearsExperience: e.target.value === "" ? null : Number(e.target.value),
                                }
                              : r
                          )
                        )
                      }
                      className="w-16 text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
                    />
                  </label>

                  <label className="text-[11px] text-navy-500 flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={row.isPrimary}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, isPrimary: e.target.checked } : r))
                        )
                      }
                    />
                    main skill
                  </label>

                  <button
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                    className="ml-auto text-[11px] text-red-600 underline cursor-pointer"
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>

            {available.length > 0 && (
              <select
                value={adding}
                onChange={(e) => addSkill(e.target.value)}
                className="w-full sm:w-72 px-3.5 py-2.5 text-sm rounded-lg border border-navy-500/30 bg-white"
              >
                <option value="">Add a skill…</option>
                {available.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                    {skill.category ? ` (${skill.category})` : ""}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
