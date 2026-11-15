begin;

select plan(3);

-- Extensions the schema relies on must be available on the Postgres image we run against.
select ok(
  exists(select 1 from pg_available_extensions where name = 'btree_gist'),
  'btree_gist is available (exclusion constraint against double booking)'
);
select ok(
  exists(select 1 from pg_available_extensions where name = 'pg_cron'),
  'pg_cron is available (Supabase Cron)'
);
select ok(
  exists(select 1 from pg_available_extensions where name = 'pg_net'),
  'pg_net is available (HTTP calls from cron jobs)'
);

select * from finish();

rollback;
