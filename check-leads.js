const knex = require('knex');

const projectDb = knex({
  client: "pg",
  connection: {
    host: "127.0.0.1",
    port: 5432,
    user: "postgres",
    password: "Sabarnik@0803",
    database: "project_db"
  }
});

async function run() {
  try {
    const last = await projectDb("leads").orderBy("lead_number", "desc").first("lead_number");
    console.log("LAST ROW:", last);
    const m = await projectDb("leads").max("lead_number as m").first();
    console.log("MAX ROW:", m);
  } catch (e) {
    console.error(e);
  } finally {
    projectDb.destroy();
  }
}

run();
