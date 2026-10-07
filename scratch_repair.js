const { projectDb, identityDb } = require('./src/lib/db-config');

async function repair() {
  console.log("Starting repair...");
  
  // 1. Fix user_id having employee_id and missing employee_id
  const badRows = await projectDb("project_team_members").whereNull("employee_id");
  console.log(`Found ${badRows.length} rows missing employee_id`);
  
  for (const row of badRows) {
    if (row.user_id && row.user_id.match(/^\d+$/)) { // If user_id looks like an employee_id
      const emp = await identityDb("employee_master").where("employee_id", row.user_id).first();
      if (emp) {
        await projectDb("project_team_members").where("id", row.id).update({
          employee_id: row.user_id,
          user_id: emp.user_id || row.user_id,
          user_name: emp.full_name || row.user_name
        });
        console.log(`Fixed user/emp ID for team member ${row.id}`);
      }
    }
  }

  // 2. Fix missing cost info
  const noCostRows = await projectDb("project_team_members").whereNull("daily_cost_inr");
  console.log(`Found ${noCostRows.length} rows missing daily_cost_inr`);
  
  for (const row of noCostRows) {
    if (row.rate_band_id) {
      const band = await projectDb("employee_rate_bands").where("id", row.rate_band_id).first();
      if (band) {
        await projectDb("project_team_members").where("id", row.id).update({
          daily_cost_inr: band.daily_cost_inr,
          daily_billable_rate_inr: band.daily_billable_rate_inr,
          planned_days: row.planned_days || 0,
          planned_cost_inr: (row.planned_days || 0) * (band.daily_cost_inr || 0),
          planned_billable_inr: (row.planned_days || 0) * (band.daily_billable_rate_inr || 0)
        });
        console.log(`Fixed cost for team member ${row.id} based on rate_band_id`);
      }
    }
  }
  
  console.log("Done.");
  process.exit(0);
}

repair().catch(console.error);
