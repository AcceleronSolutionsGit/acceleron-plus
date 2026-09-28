const knex = require('knex')({
  client: 'pg',
  connection: { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'Sabarnik@0803', database: 'itsm_db' }
});
knex.raw("SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid ORDER BY t.typname, e.enumsortorder").then(res => {
  console.log(res.rows);
  process.exit(0);
}).catch(console.error);
