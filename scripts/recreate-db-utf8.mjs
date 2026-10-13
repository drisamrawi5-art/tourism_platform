/* One-off: recreate dev databases with UTF-8 encoding (WIN1252 can't store Arabic). */
import pg from "pg";

const client = new pg.Client({
  host: "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 5433),
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

await client.connect();
for (const dbName of ["visit_imedwan", "visit_imedwan_test"]) {
  await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await client.query(
    `CREATE DATABASE "${dbName}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
  );
  console.log(`recreated ${dbName} as UTF8`);
}
const enc = await client.query(
  "SELECT datname, pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname LIKE 'visit%'",
);
console.table(enc.rows);
await client.end();
