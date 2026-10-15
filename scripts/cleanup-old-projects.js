// ═══════════════════════════════════════════════════════════════
// Cleanup Projects Added Before Today
// Run on server or locally:
//   node scripts/cleanup-old-projects.js            # executes cleanup
//   node scripts/cleanup-old-projects.js --dry-run  # previews what will be deleted
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../src/lib/db-config");

async function run() {
  const isDryRun = process.argv.includes("--dry-run");
  const projectsOnly = process.argv.includes("--projects-only");

  // Today at midnight UTC/local
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoffDate = today.toISOString();

  console.log(`\n🧹 Project Cleanup Utility`);
  console.log(`   Cutoff timestamp: ${cutoffDate} (before today)`);
  console.log(`   Mode: ${isDryRun ? "DRY RUN (no changes)" : "EXECUTE"}\n`);

  // 1. Find projects to delete
  const oldProjects = await projectDb("projects")
    .where("created_at", "<", cutoffDate)
    .select("id", "code", "name", "created_at");

  console.log(`📋 Found ${oldProjects.length} project(s) created before today.`);

  if (oldProjects.length > 0) {
    console.log("   Sample projects to be deleted:");
    oldProjects.slice(0, 5).forEach(p => {
      console.log(`     • [${p.code}] ${p.name?.slice(0, 50)} (created: ${p.created_at})`);
    });
    if (oldProjects.length > 5) {
      console.log(`     ... and ${oldProjects.length - 5} more`);
    }
  }

  // 2. Find old sales orders
  const oldOrders = await projectDb("sales_orders")
    .where("created_at", "<", cutoffDate)
    .select("id", "sales_order_number", "customer_name");

  console.log(`📦 Found ${oldOrders.length} sales order(s) created before today.`);

  if (isDryRun) {
    console.log(`\n✔ Dry run complete. To actually delete, run:\n   node scripts/cleanup-old-projects.js\n`);
    return;
  }

  if (oldProjects.length === 0 && oldOrders.length === 0) {
    console.log(`\n✔ Nothing to clean up.`);
    return;
  }

  const trx = await projectDb.transaction();
  try {
    let deletedOrders = 0;
    if (!projectsOnly && oldOrders.length > 0) {
      deletedOrders = await trx("sales_orders")
        .where("created_at", "<", cutoffDate)
        .del();
      console.log(`   🗑 Deleted ${deletedOrders} sales orders.`);
    }

    let deletedProjects = 0;
    if (oldProjects.length > 0) {
      deletedProjects = await trx("projects")
        .where("created_at", "<", cutoffDate)
        .del();
      console.log(`   🗑 Deleted ${deletedProjects} projects (cascade removed child milestones, WBS, team members, etc.).`);
    }

    await trx.commit();
    console.log(`\n✅ Cleanup committed successfully: ${deletedProjects} projects and ${deletedOrders} sales orders removed.\n`);
  } catch (err) {
    await trx.rollback();
    console.error(`\n❌ Error during cleanup, rolled back completely:`, err);
    process.exit(1);
  }
}

run().catch(console.error).finally(closeAll);
