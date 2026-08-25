-- P2-1, 2026-08-25.  APPLIED LIVE VIA SUPABASE MCP — this file is committed for
-- version control only; running an installer does NOT apply it.
--
-- Index every foreign key whose columns are not already the leading prefix of an
-- index. Pure addition — no behaviour change, nothing to roll back, and no query
-- result can differ.
--
-- Why this matters more than the row counts suggest: every child of `jobs` is
-- ON DELETE CASCADE, and admin_delete_job / admin-delete-account / withdraw_job
-- / remove_client_request are all live buttons. An unindexed FK on a cascade
-- path means deleting one row sequentially scans the whole child table while
-- holding locks. Free at 172 rows, an outage at a million.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: the largest table here is 172
-- rows, so the lock is measured in microseconds, and CONCURRENTLY cannot run
-- inside a migration's transaction anyway.
--
-- Deliberately NOT indexed: the four FKs on social_actions / social_conversations.
-- Those tables have 0 rows and CLAUDE.md carries an open decision to either build
-- the admin review UI or drop the whole social-bot feature. Indexing tables that
-- may be dropped is churn; revisit when that decision is made. A coverage query
-- run after this migration will still report those four, and that is expected.

-- ON DELETE CASCADE paths -- highest value, these are the ones that lock up.
create index if not exists bid_thread_reads_contractor_idx on public.bid_thread_reads (contractor_id);
create index if not exists bid_thread_reads_user_idx       on public.bid_thread_reads (user_id);
create index if not exists favorites_contractor_idx        on public.favorites (contractor_id);
create index if not exists hidden_jobs_request_idx         on public.hidden_jobs (request_id);
create index if not exists job_time_logs_contractor_idx    on public.job_time_logs (contractor_id);
create index if not exists message_reads_user_idx          on public.message_reads (user_id);
create index if not exists reviews_client_idx              on public.reviews (client_id);
-- messages_request_thread_idx is (request_id, thread_contractor_id); request_id
-- leads, so a lookup by contractor alone is not covered by it.
create index if not exists messages_thread_contractor_idx  on public.messages (thread_contractor_id);

-- ON DELETE SET NULL paths -- same scan, just writing NULLs instead of deleting.
create index if not exists admin_messages_sender_idx            on public.admin_messages (sender_id);
create index if not exists client_requests_recurring_parent_idx on public.client_requests (recurring_parent_id);
create index if not exists jobs_chat_time_by_idx                on public.jobs (chat_time_by);
create index if not exists jobs_prepayment_idx                  on public.jobs (prepayment_id);
create index if not exists messages_sender_idx                  on public.messages (sender_id);
create index if not exists notifications_job_idx                on public.notifications (job_id);
create index if not exists recurring_prepayments_contractor_idx on public.recurring_prepayments (contractor_id);

-- NO ACTION paths -- no cascade scan, but these columns are joined and filtered
-- on directly (dispute parties, contract parties) so the index earns its keep.
create index if not exists disputes_client_idx          on public.disputes (client_id);
create index if not exists disputes_contractor_idx      on public.disputes (contractor_id);
create index if not exists job_contracts_client_idx     on public.job_contracts (client_id);
create index if not exists job_contracts_contractor_idx on public.job_contracts (contractor_id);
