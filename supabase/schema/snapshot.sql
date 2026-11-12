-- The read-only query that produces functions.sql and tables.sql in this
-- folder. Run it through the Supabase MCP (execute_sql), then split the JSON
-- into the two files: `functions` -> functions.sql, everything else -> tables.sql.
-- The anon key is masked so the snapshot never carries a token.
select jsonb_build_object(
 'functions', (select jsonb_agg(jsonb_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'def', regexp_replace(pg_get_functiondef(p.oid), 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '<ANON_KEY>', 'g'), 'acl', coalesce(p.proacl::text, 'default')) order by p.proname, pg_get_function_identity_arguments(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'),
 'tables', (select jsonb_agg(jsonb_build_object('table', c.table_name, 'col', c.column_name, 'type', c.data_type || case when c.data_type='ARRAY' then ' '||c.udt_name else '' end, 'nullable', c.is_nullable, 'default', c.column_default, 'generated', c.generation_expression) order by c.table_name, c.ordinal_position) from information_schema.columns c where c.table_schema='public'),
 'constraints', (select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'def', pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname) from pg_constraint where connamespace='public'::regnamespace),
 'indexes', (select jsonb_agg(indexdef order by tablename, indexname) from pg_indexes where schemaname='public'),
 'policies', (select jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'cmd', cmd, 'roles', roles::text, 'using', qual, 'check', with_check) order by tablename, policyname) from pg_policies where schemaname in ('public','storage')),
 'triggers', (select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgrelid::regclass::text, t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','auth','storage')),
 'cron', (select jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'command', command, 'active', active) order by jobname) from cron.job),
 'views', (select jsonb_agg(jsonb_build_object('name', viewname, 'def', definition)) from pg_views where schemaname='public'),
 'rls', (select jsonb_agg(c.relname order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relrowsecurity)
) as snapshot;
