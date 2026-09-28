

const { itsmDb, projectDb, closeAll } = require("../db-config");
async function check() {
  console.log('--- ITSM DB ---');
  for (const t of ['companies', 'departments', 'service_groups', 'requesters', 'tickets', 'change_requests', 'releases', 'project_contexts']) {
    const r = await itsmDb.raw(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = ?`, [t]);
    console.log(t + ':\n  ' + r.rows.map(x => `${x.column_name} (${x.data_type})`).join(', '));
  }
  console.log('\n--- PROJECT DB ---');
  for (const t of ['projects', 'project_wbs', 'project_milestones', 'project_risks', 'governance_reviews', 'project_team_members', 'employee_rate_bands', 'timesheets']) {
    const r = await projectDb.raw(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = ?`, [t]);
    console.log(t + ':\n  ' + r.rows.map(x => `${x.column_name} (${x.data_type})`).join(', '));
  }
  process.exit(0);
}

check().catch((err) => {
  console.error('Schema check failed:', err);
  process.exitCode = 1;
}).finally(closeAll);
