import React from "react";
import { NewTicketClient } from "./NewTicketClient";
import { getCurrentUser } from "@/lib/auth";
import {
  getRequesters,
  getCompanies,
  getDepartments,
  getServiceGroups,
  getTaxonomyCategories,
  getTaxonomySubCategories,
  getTaxonomyItems,
  getImpactAreas,
  getProjects,
  getUsers,
} from "@/lib/api";

export const metadata = {
  title: "New Ticket | Acceleron Plus",
};

export default async function NewTicketPage() {
  // Fetch all lookup data concurrently
  const [
    currentUser,
    requesters,
    companies,
    departments,
    groups,
    categories,
    subCategories,
    items,
    impactAreas,
    projects,
    agents,
  ] = await Promise.all([
    getCurrentUser(),
    getRequesters(),
    getCompanies(),
    getDepartments(),
    getServiceGroups(),
    getTaxonomyCategories(),
    getTaxonomySubCategories(),
    getTaxonomyItems(),
    getImpactAreas(),
    getProjects(),
    getUsers(),
  ]);

  return (
    <div className="max-w-6xl mx-auto py-6">
      <NewTicketClient
        currentUser={currentUser}
        requesters={requesters as any}
        companies={companies as any}
        departments={departments as any}
        groups={groups as any}
        categories={categories as any}
        subCategories={subCategories as any}
        items={items as any}
        impactAreas={impactAreas as any}
        projects={projects as any}
        agents={agents as any}
      />
    </div>
  );
}
