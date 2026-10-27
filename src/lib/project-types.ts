// ═══════════════════════════════════════════════════════════════
// Project Types & Categories Taxonomy
// ═══════════════════════════════════════════════════════════════

export interface ProjectTaxonomyCategory {
  category: string;
  label?: string;
  types: string[];
}

export const PROJECT_TAXONOMY: ProjectTaxonomyCategory[] = [
  {
    category: "SAP",
    label: "SAP",
    types: ["SAP Implementation", "SAP AMS", "SAP Development", "SAP Support", "SAP S/4HANA Migration"],
  },
  {
    category: "SOFTWARE",
    label: "Software",
    types: ["Software Development", "Software AMS", "Custom Software", "Web & Mobile App", "Integration & Portal"],
  },
  {
    category: "INFRA",
    label: "IT Infrastructure",
    types: ["IT Infra Project", "IT Infra AMS", "Network & Security", "Cloud Infrastructure", "Hardware / Server Setup"],
  },
  {
    category: "SUPPORT",
    label: "Support & AMS",
    types: ["IT Managed Services", "AMS Support", "End User Support", "Manpower Support"],
  },
  {
    category: "ZOHO",
    label: "Zoho",
    types: ["ZOHO Implementation", "ZOHO AMS", "ZOHO Creator / CRM"],
  },
  {
    category: "LICENCE",
    label: "Licence & Subscriptions",
    types: ["Software License", "Microsoft 365", "Cloud Subscription", "Security License"],
  },
  {
    category: "AUDIT",
    label: "Audit & Security",
    types: ["Security Audit / VAPT", "ISMS / Compliance", "SoD Review", "Process Audit"],
  },
  {
    category: "OTHER",
    label: "Other",
    types: ["Consulting", "Training", "General IT Services"],
  },
];

export const ALL_CATEGORIES = PROJECT_TAXONOMY.map((item) => item.category);

export const ALL_PROJECT_TYPES = PROJECT_TAXONOMY.flatMap((item) => item.types);

/** Normalises any raw category string into standard taxonomy canonical name */
export function normalizeCategory(category?: string | null): string {
  if (!category) return "OTHER";
  const s = category.trim().toUpperCase();
  if (s === "SAP") return "SAP";
  if (s === "SOFTWARE" || s.includes("CUSTOM SOFTWARE") || s.includes("SOFTWARE") || s.includes("DEVELOPMENT") || s.includes("APP")) return "SOFTWARE";
  if (s === "INFRA" || s.includes("INFRASTRUCTURE") || s.includes("NETWORK")) return "INFRA";
  if (s === "SUPPORT" || s.includes("MANAGED") || s.includes("AMC") || s.includes("MAINTENANCE")) return "SUPPORT";
  if (s === "ZOHO") return "ZOHO";
  if (s.includes("LICEN")) return "LICENCE";
  if (s === "AUDIT" || s.includes("SECURITY") || s.includes("COMPLIANCE")) return "AUDIT";
  return s;
}

/** Returns valid project types for a chosen category */
export function getTypesForCategory(category?: string | null): string[] {
  if (!category) return ALL_PROJECT_TYPES;
  const norm = normalizeCategory(category);
  const match = PROJECT_TAXONOMY.find(
    (t) => t.category.toUpperCase() === norm
  );
  return match ? match.types : ALL_PROJECT_TYPES;
}

/** Returns the parent category for a given project type */
export function getCategoryForType(projectType?: string | null): string | null {
  if (!projectType) return null;
  const ptLower = projectType.trim().toLowerCase();
  
  // Exact or item match
  const match = PROJECT_TAXONOMY.find((item) =>
    item.types.some((t) => t.toLowerCase() === ptLower)
  );
  if (match) return match.category;

  // Keyword heuristic fallback
  if (ptLower.includes("sap") || ptLower.includes("abap") || ptLower.includes("basis") || ptLower.includes("fiori")) return "SAP";
  if (ptLower.includes("zoho")) return "ZOHO";
  if (ptLower.includes("infra") || ptLower.includes("cctv") || ptLower.includes("network")) return "INFRA";
  if (ptLower.includes("licen")) return "LICENCE";
  if (ptLower.includes("audit") || ptLower.includes("vapt") || ptLower.includes("isms")) return "AUDIT";
  if (ptLower.includes("support") || ptLower.includes("managed") || ptLower.includes("amc")) return "SUPPORT";
  if (ptLower.includes("software") || ptLower.includes("app") || ptLower.includes("portal") || ptLower.includes("dev")) return "SOFTWARE";

  return null;
}

