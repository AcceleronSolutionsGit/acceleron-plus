const knex = require('knex')({
  client: 'pg',
  connection: { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'Sabarnik@0803', database: 'itsm_db' }
});
knex.raw("SELECT table_name FROM information_schema.tables WHERE table_schema='public'").then(res => {
  console.log('itsm_db tables:', res.rows.map(r => r.table_name));
  process.exit(0);
}).catch(console.error);
