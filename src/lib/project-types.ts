// ═══════════════════════════════════════════════════════════════
// Project Types & Categories Taxonomy
// ═══════════════════════════════════════════════════════════════

export interface ProjectTaxonomyCategory {
  category: string;
  types: string[];
}

export const PROJECT_TAXONOMY: ProjectTaxonomyCategory[] = [
  {
    category: "SAP",
    types: ["SAP Implementation", "SAP AMS", "SAP Development"],
  },
  {
    category: "Custom Software",
    types: ["Software Development", "Software AMS"],
  },
  {
    category: "IT Infrastructure",
    types: ["IT Infra Project", "IT Infra AMS"],
  },
  {
    category: "Managed Services",
    types: ["IT Managed Services"],
  },
  {
    category: "Zoho",
    types: ["ZOHO Implementation", "ZOHO AMS"],
  },
];

export const ALL_CATEGORIES = PROJECT_TAXONOMY.map((item) => item.category);

export const ALL_PROJECT_TYPES = PROJECT_TAXONOMY.flatMap((item) => item.types);

/** Returns valid project types for a chosen category */
export function getTypesForCategory(category?: string | null): string[] {
  if (!category) return ALL_PROJECT_TYPES;
  const match = PROJECT_TAXONOMY.find(
    (t) => t.category.toLowerCase() === category.toLowerCase()
  );
  return match ? match.types : ALL_PROJECT_TYPES;
}

/** Returns the parent category for a given project type */
export function getCategoryForType(projectType?: string | null): string | null {
  if (!projectType) return null;
  const match = PROJECT_TAXONOMY.find((item) =>
    item.types.some((t) => t.toLowerCase() === projectType.toLowerCase())
  );
  return match ? match.category : null;
}
