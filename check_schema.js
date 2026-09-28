const knex = require('knex')({
  client: 'pg',
  connection: { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'Sabarnik@0803', database: 'itsm_db' }
});
knex.raw("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tickets'").then(res => {
  console.log(res.rows);
  process.exit(0);
}).catch(console.error);
