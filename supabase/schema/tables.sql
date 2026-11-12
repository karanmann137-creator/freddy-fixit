-- GENERATED from the live database on 2026-11-12. Do not edit by hand and do not apply.
-- This is a read-only reference so the repo can show what production runs.
-- The public anon key is replaced with <ANON_KEY>.
-- Regenerate after any DB change: tools/write_schema_snapshot.py.

-- 56 tables in schema public

-- table admin_audit_log   (RLS on)
--   id  bigint  not null  default nextval('admin_audit_log_id_seq'::regclass)
--   created_at  timestamp with time zone  not null  default now()
--   actor_id  uuid
--   actor_email  text
--   action  text  not null
--   target_table  text
--   target_id  text
--   detail  jsonb  not null  default '{}'::jsonb
--   via  text  not null  default 'rpc'::text

-- table admin_messages   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   batch_id  uuid  not null  default gen_random_uuid()
--   sender_id  uuid
--   recipient_id  uuid
--   recipient_email  text  not null
--   recipient_name  text
--   subject  text  not null
--   body  text  not null
--   status  text  not null  default 'sent'::text
--   error  text
--   created_at  timestamp with time zone  not null  default now()

-- table agent_actions   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   conversation_id  uuid
--   kind  text  not null
--   payload  jsonb  not null  default '{}'::jsonb
--   claim_token  uuid  not null  default gen_random_uuid()
--   status  text  not null  default 'pending'::text
--   approved_by  uuid
--   approved_at  timestamp with time zone
--   expires_at  timestamp with time zone  not null  default (now() + '7 days'::interval)
--   result  jsonb  not null  default '{}'::jsonb
--   created_at  timestamp with time zone  not null  default now()
--   agent  text  not null  default 'social-bot'::text
--   dedupe_key  text
--   run_id  uuid

-- table agent_registry   (RLS on)
--   agent  text  not null
--   label  text  not null
--   purpose  text  not null  default ''::text
--   enabled  boolean  not null  default true
--   autonomy  text  not null  default 'propose'::text
--   expected_every  interval
--   created_at  timestamp with time zone  not null  default now()
--   model  text  not null  default 'none'::text
--   max_model_calls_per_run  integer  not null  default 0
--   max_proposals_per_run  integer  not null  default 5
--   max_pending  integer  not null  default 20

-- table agent_runs   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   agent  text  not null
--   trigger  text  not null  default 'schedule'::text
--   status  text  not null  default 'running'::text
--   started_at  timestamp with time zone  not null  default now()
--   finished_at  timestamp with time zone
--   summary  text
--   details  jsonb  not null  default '{}'::jsonb
--   proposals_created  integer  not null  default 0
--   error  text
--   model_calls  integer  not null  default 0

-- table alert_throttle_log   (RLS on)
--   key  text  not null
--   last_sent_at  timestamp with time zone  not null  default now()
--   hits  integer  not null  default 1
--   created_at  timestamp with time zone  not null  default now()

-- table bid_thread_reads   (RLS on)
--   request_id  uuid  not null
--   contractor_id  uuid  not null
--   user_id  uuid  not null
--   last_read_at  timestamp with time zone  not null  default now()

-- table bids   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   request_id  uuid  not null
--   contractor_id  uuid  not null
--   amount  numeric
--   message  text
--   status  text  not null  default 'pending'::text
--   created_at  timestamp with time zone  not null  default now()
--   labour_amount  numeric
--   parts_amount  numeric
--   callout_fee  numeric
--   assumptions  text
--   subject_to_inspection  boolean  not null  default false
--   price_low  numeric
--   price_high  numeric
--   used_base_price  boolean  not null  default false
--   walkthrough_requested  boolean  not null  default false
--   declined_by_client_at  timestamp with time zone

-- table blog_posts   (RLS on)
--   slug  text  not null
--   title  text  not null
--   tag  text  not null  default 'Tips'::text
--   description  text  not null  default ''::text
--   body_md  text  not null
--   published_at  timestamp with time zone  not null  default now()

-- table chat_rate_limit   (RLS on)
--   ip  text  not null
--   window_start  timestamp with time zone  not null  default now()
--   count  integer  not null  default 0

-- table client_requests   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   user_id  uuid
--   first_name  text
--   last_name  text
--   email  text
--   phone  text
--   service_needed  text
--   preferred_schedule  text
--   location  text
--   job_description  text
--   status  text  not null  default 'pending'::text
--   assigned_contractor_id  uuid
--   created_at  timestamp with time zone  default now()
--   photo_path  text
--   estimated_quote  numeric
--   quote_notes  text
--   client_type  text  not null  default 'individual'::text
--   business_name  text
--   business_type  text
--   locations  text
--   recurring  boolean  not null  default false
--   billing_preference  text
--   vehicle_details  jsonb
--   recurring_frequency  text
--   recurring_start_date  date
--   recurring_end_date  date
--   dispatched_to  ARRAY _uuid  not null  default '{}'::uuid[]
--   no_bid_escalated_at  timestamp with time zone
--   preferred_contractor_id  uuid
--   recurring_interval_km  integer
--   recurring_prepay_pref  integer  not null  default 0
--   recurring_plan_status  text  not null  default 'active'::text
--   recurring_next_due  date
--   recurring_parent_id  uuid
--   recurring_dates  ARRAY _date
--   recurring_source_date  date
--   budget_min  numeric
--   budget_max  numeric
--   budget_flexible  boolean  not null  default false
--   refire_count  integer  not null  default 0
--   refire_last_at  timestamp with time zone
--   waitlisted  boolean  not null  default false
--   pick_token  uuid  not null  default gen_random_uuid()
--   reposted_at  timestamp with time zone
--   repost_count  integer  not null  default 0
--   pick_first_viewed_at  timestamp with time zone
--   pick_last_viewed_at  timestamp with time zone
--   pick_views  integer  not null  default 0

-- table contractor_outreach   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   company_name  text  not null
--   contact_name  text
--   email  text  not null
--   status  text  not null  default 'pending'::text
--   resend_id  text
--   error  text
--   sent_at  timestamp with time zone
--   created_at  timestamp with time zone  not null  default now()
--   trade  text
--   source  text
--   city  text  default 'Calgary'::text
--   queued_at  timestamp with time zone
--   queued_for  uuid
--   unsubscribed  boolean  not null  default false

-- table contractors   (RLS on)
--   id  uuid  not null
--   specialties  ARRAY _text  default '{}'::text[]
--   years_of_experience  integer  default 0
--   service_area  ARRAY _text  default '{}'::text[]
--   availability  jsonb  default '{}'::jsonb
--   photo_url  text
--   rating  numeric  default 0
--   total_jobs  integer  default 0
--   total_earned  numeric  default 0
--   status  text  not null  default 'pending'::text
--   created_at  timestamp with time zone  default now()
--   google_reviews_url  text
--   rating_price  numeric
--   rating_experience  numeric
--   rating_result  numeric
--   rating_count  integer  not null  default 0
--   company_name  text
--   licensed  boolean
--   license_number  text
--   has_liability_insurance  boolean
--   insurance_provider  text
--   insurance_expiry  text
--   has_wcb  boolean
--   work_references  text
--   doc_urls  jsonb  default '{}'::jsonb
--   review_result  jsonb
--   review_status  text  default 'pending'::text
--   jobs_dispatched  integer  not null  default 0
--   work_type  text
--   stripe_account_id  text
--   stripe_charges_enabled  boolean  not null  default false
--   stripe_payouts_enabled  boolean  not null  default false
--   stripe_onboarded_at  timestamp with time zone
--   hourly_rate  numeric
--   min_callout  numeric
--   weekly_goal  numeric
--   setup_skipped  ARRAY _text  not null  default '{}'::text[]
--   operates_alone  boolean  not null  default false

-- table deleted_account_flags   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   email_hash  text
--   phone_hash  text
--   name_hash  text
--   review_count  integer  not null  default 0
--   avg_score  numeric
--   was_poor  boolean  not null  default false
--   deleted_at  timestamp with time zone  not null  default now()

-- table dispatch_log   (RLS on)
--   id  bigint  not null  default nextval('dispatch_log_id_seq'::regclass)
--   request_id  uuid  not null
--   contractor_id  uuid
--   ok  boolean  not null
--   status_code  integer
--   error  text
--   reserved  boolean  not null  default false
--   created_at  timestamp with time zone  not null  default now()

-- table disputes   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   job_id  uuid  not null
--   client_id  uuid  not null
--   contractor_id  uuid
--   reason  text  not null
--   description  text
--   photo_paths  ARRAY _text  not null  default '{}'::text[]
--   status  text  not null  default 'open'::text
--   refund_amount  numeric
--   resolution_note  text
--   resolved_by  uuid
--   resolved_at  timestamp with time zone
--   created_at  timestamp with time zone  not null  default now()
--   service_date  date
--   agreed_scope  text
--   requested_remedy  text
--   amount_in_dispute  numeric
--   declarant_name  text
--   declaration_signed  boolean  not null  default false
--   contractor_response  text
--   contractor_response_photos  ARRAY _text  not null  default '{}'::text[]
--   contractor_responded_at  timestamp with time zone
--   response_deadline  timestamp with time zone

-- table favorites   (RLS on)
--   client_id  uuid  not null
--   contractor_id  uuid  not null
--   created_at  timestamp with time zone  not null  default now()

-- table hidden_jobs   (RLS on)
--   contractor_id  uuid  not null
--   request_id  uuid  not null
--   hidden_at  timestamp with time zone  not null  default now()

-- table image_scans   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   bucket  text  not null
--   path  text  not null
--   scanned_by  uuid
--   verdict  text  not null
--   categories  ARRAY _text  not null  default '{}'::text[]
--   detail  text
--   created_at  timestamp with time zone  not null  default now()

-- table internal_tokens   (RLS on)
--   token  text  not null
--   purpose  text  not null
--   created_at  timestamp with time zone  not null  default now()
--   expires_at  timestamp with time zone  not null  default (now() + '00:10:00'::interval)
--   used_at  timestamp with time zone

-- table job_contracts   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   job_id  uuid  not null
--   status  text  not null  default 'draft'::text
--   source  text  not null  default 'generated'::text
--   body_md  text
--   custom_clauses  text
--   uploaded_path  text
--   uploaded_ack  boolean  not null  default false
--   contractor_id  uuid
--   contractor_signed_at  timestamp with time zone
--   contractor_sig_name  text
--   contractor_sig_ip  text
--   client_id  uuid
--   client_signed_at  timestamp with time zone
--   client_sig_name  text
--   client_sig_ip  text
--   signed_html  text
--   signed_at  timestamp with time zone
--   created_at  timestamp with time zone  not null  default now()
--   updated_at  timestamp with time zone  not null  default now()

-- table job_expenses   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   job_id  uuid  not null
--   contractor_id  uuid  not null
--   label  text  not null
--   amount  numeric  not null
--   created_at  timestamp with time zone  not null  default now()

-- table job_milestones   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   job_id  uuid  not null
--   seq  integer  not null
--   title  text  not null
--   amount  numeric  not null
--   client_fee  numeric  not null  default 0
--   contractor_payout  numeric  not null  default 0
--   platform_fee  numeric  not null  default 0
--   status  text  not null  default 'pending'::text
--   stripe_session_id  text
--   stripe_payment_intent  text
--   stripe_transfer_id  text
--   completion_photo_path  text
--   funded_at  timestamp with time zone
--   completed_at  timestamp with time zone
--   client_approved_at  timestamp with time zone
--   released_at  timestamp with time zone
--   disputed_at  timestamp with time zone
--   dispute_reason  text
--   created_at  timestamp with time zone  not null  default now()
--   refunded_at  timestamp with time zone
--   stripe_refund_id  text
--   receipt_sent_at  timestamp with time zone

-- table job_time_logs   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   job_id  uuid  not null
--   contractor_id  uuid  not null
--   started_at  timestamp with time zone  not null  default now()
--   ended_at  timestamp with time zone

-- table jobs   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   request_id  uuid
--   contractor_id  uuid
--   client_id  uuid
--   status  text  not null  default 'assigned'::text
--   scheduled_date  date
--   amount  numeric
--   notes  text
--   created_at  timestamp with time zone  default now()
--   scheduled_at  timestamp with time zone
--   schedule_proposed_at  timestamp with time zone
--   client_approved_at  timestamp with time zone
--   contractor_completed_at  timestamp with time zone
--   client_confirmed_at  timestamp with time zone
--   completion_photo_path  text
--   client_fee  numeric
--   platform_fee  numeric
--   total_charged  numeric
--   contractor_payout  numeric
--   stripe_payment_intent_id  text
--   stripe_transfer_id  text
--   payment_status  text  not null  default 'unpaid'::text
--   paid_at  timestamp with time zone
--   released_at  timestamp with time zone
--   disputed_at  timestamp with time zone
--   on_my_way_at  timestamp with time zone
--   labour_amount  numeric
--   parts_amount  numeric
--   callout_fee  numeric
--   quote_assumptions  text
--   subject_to_inspection  boolean  not null  default false
--   price_low  numeric
--   price_high  numeric
--   used_base_price  boolean  not null  default false
--   is_milestone  boolean  not null  default false
--   milestone_schedule_status  text
--   contract_copy_sent_at  timestamp with time zone
--   prepayment_id  uuid
--   prepayment_seq  integer
--   visit_reminder_sent_at  timestamp with time zone
--   client_confirmed_visit_at  timestamp with time zone
--   client_rescheduled_at  timestamp with time zone
--   reschedule_accepted_at  timestamp with time zone
--   price_change_pending  jsonb
--   price_change_proposed_at  timestamp with time zone
--   extra_charge_intent_ids  ARRAY _text  not null  default '{}'::text[]
--   quote_items  jsonb
--   checklist  jsonb
--   walkthrough_proposed_at  timestamp with time zone
--   walkthrough_at  timestamp with time zone
--   walkthrough_approved_at  timestamp with time zone
--   walkthrough_done_at  timestamp with time zone
--   walkthrough_note  text
--   receipt_sent_at  timestamp with time zone
--   price_hike_from  numeric
--   price_hike_reason  text
--   price_hike_at  timestamp with time zone
--   chat_time_at  timestamp with time zone
--   chat_time_by  uuid
--   chat_time_proposed_at  timestamp with time zone
--   chat_time_msg  text
--   chat_time_resolved_at  timestamp with time zone
--   hour_reminder_sent_at  timestamp with time zone
--   before_photo_path  text
--   before_photo_at  timestamp with time zone
--   after_photo_at  timestamp with time zone
--   slot_released_at  timestamp with time zone
--   slot_released_from  timestamp with time zone
--   funded_amount  numeric  not null  default 0
--   deposit_rate  numeric  not null  default 0.40
--   deposit_paid_at  timestamp with time zone
--   fully_funded  boolean  generated: ((total_charged IS NOT NULL) AND (funded_amount >= (total_charged - 0.01)))
--   checkout_started_at  timestamp with time zone
--   stripe_transfer_ids  ARRAY _text
--   stripe_customer_id  text
--   stripe_payment_method_id  text
--   autopay_balance  boolean  not null  default true
--   autopay_attempts  integer  not null  default 0
--   autopay_last_attempt_at  timestamp with time zone
--   autopay_last_error  text
--   stripe_session_id  text
--   service_address  text
--   service_address_at  timestamp with time zone

-- table message_email_log   (RLS on)
--   job_id  uuid  not null
--   recipient_id  uuid  not null
--   last_emailed_at  timestamp with time zone  not null  default now()

-- table message_reads   (RLS on)
--   job_id  uuid  not null
--   user_id  uuid  not null
--   last_read_at  timestamp with time zone  not null  default now()

-- table messages   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   job_id  uuid
--   sender_id  uuid
--   content  text  not null
--   created_at  timestamp with time zone  default now()
--   attachment_path  text
--   attachment_type  text
--   blocked  boolean  not null  default false
--   flag_reasons  ARRAY _text
--   request_id  uuid
--   thread_contractor_id  uuid

-- table mfa_challenges   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   user_id  uuid  not null
--   code_hash  text  not null
--   purpose  text  not null
--   expires_at  timestamp with time zone  not null
--   attempts  integer  not null  default 0
--   consumed_at  timestamp with time zone
--   created_at  timestamp with time zone  not null  default now()

-- table newsletter_content   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   audience  text  not null
--   seq  integer  not null
--   subject  text  not null
--   preheader  text
--   body_md  text  not null
--   blog_title  text
--   blog_tag  text  default 'Tips'::text
--   status  text  not null  default 'queued'::text
--   sent_at  timestamp with time zone
--   blog_slug  text
--   created_by  text  not null  default 'bank'::text
--   created_at  timestamp with time zone  not null  default now()

-- table newsletter_subscribers   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   email  text  not null
--   audience  text  not null
--   first_name  text
--   source  text  not null  default 'footer_form'::text
--   consent  text  not null  default 'express'::text
--   consent_at  timestamp with time zone  not null  default now()
--   unsubscribed_at  timestamp with time zone
--   unsub_token  uuid  not null  default gen_random_uuid()
--   created_at  timestamp with time zone  not null  default now()

-- table notifications   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   user_id  uuid  not null
--   type  text  not null
--   title  text  not null
--   body  text
--   job_id  uuid
--   read_at  timestamp with time zone
--   created_at  timestamp with time zone  not null  default now()

-- table platform_settings   (RLS on)
--   key  text  not null
--   value  jsonb  not null
--   updated_at  timestamp with time zone  not null  default now()
--   updated_by  uuid

-- table portfolio_items   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   contractor_id  uuid  not null
--   title  text
--   description  text
--   photo_path  text
--   created_at  timestamp with time zone  not null  default now()

-- table profiles   (RLS on)
--   id  uuid  not null
--   email  text
--   first_name  text
--   last_name  text
--   phone  text
--   role  text  not null  default 'client'::text
--   created_at  timestamp with time zone  default now()
--   referral_code  text
--   referred_by  uuid

-- table quote_leads   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   name  text
--   email  text
--   phone  text
--   service_needed  text
--   location  text
--   details  text
--   status  text  not null  default 'new'::text
--   created_at  timestamp with time zone  not null  default now()

-- table rate_limit_hits   (RLS on)
--   bucket  text  not null
--   key  text  not null
--   window_start  timestamp with time zone  not null  default now()
--   count  integer  not null  default 0

-- table recurring_prepayments   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   plan_request_id  uuid  not null
--   client_id  uuid  not null
--   contractor_id  uuid
--   occurrences_total  integer  not null
--   occurrences_released  integer  not null  default 0
--   amount_per_occurrence  numeric  not null
--   client_fee_per  numeric  not null  default 0
--   payout_per  numeric  not null
--   commission_per  numeric  not null  default 0
--   total_charged  numeric  not null
--   stripe_payment_intent  text
--   status  text  not null  default 'pending'::text
--   created_at  timestamp with time zone  not null  default now()
--   refunded_at  timestamp with time zone
--   stripe_refund_id  text
--   fee_waived  boolean  not null  default false

-- table referrals   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   referrer_id  uuid  not null
--   referred_id  uuid  not null
--   status  text  not null  default 'pending'::text
--   reward_applied_job_id  uuid
--   created_at  timestamp with time zone  not null  default now()
--   rewarded_at  timestamp with time zone

-- table reminder_log   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   user_id  uuid  not null
--   kind  text  not null
--   sent_at  timestamp with time zone  not null  default now()

-- table repair_scans   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   created_at  timestamp with time zone  not null  default now()
--   ip  text
--   user_id  uuid
--   image_count  integer  not null  default 0
--   description  text
--   item  text
--   difficulty  text
--   services  ARRAY _text  not null  default '{}'::text[]

-- table reviews   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   job_id  uuid  not null
--   contractor_id  uuid  not null
--   client_id  uuid  not null
--   price_score  integer  not null
--   experience_score  integer  not null
--   result_score  integer  not null
--   comment  text
--   created_at  timestamp with time zone  not null  default now()

-- table saved_addresses   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   user_id  uuid  not null
--   label  text
--   address  text  not null
--   created_at  timestamp with time zone  not null  default now()

-- table saved_vehicles   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   user_id  uuid  not null
--   year  text
--   make  text
--   model  text
--   notes  text
--   created_at  timestamp with time zone  not null  default now()

-- table scan_rate_limit   (RLS on)
--   ip  text  not null
--   window_start  timestamp with time zone  not null  default now()
--   count  integer  not null  default 1

-- table service_compulsory   (RLS on)
--   service  text  not null
--   compulsory  boolean  not null  default false
--   trade  text
--   note  text
--   updated_at  timestamp with time zone  not null  default now()

-- table service_pricing   (RLS on)
--   service  text  not null
--   base_price  numeric
--   typical_low  numeric
--   typical_high  numeric
--   unit  text
--   updated_at  timestamp with time zone  not null  default now()

-- table service_specialty_map   (RLS on)
--   service  text  not null
--   specialties  ARRAY _text  not null

-- table signup_rescue_log   (RLS on)
--   id  bigint  not null  default nextval('signup_rescue_log_id_seq'::regclass)
--   user_id  uuid  not null
--   kind  text  not null
--   ok  boolean  not null
--   detail  text
--   sent_at  timestamp with time zone  not null  default now()

-- table social_bot_config   (RLS on)
--   key  text  not null
--   value  text  not null
--   updated_at  timestamp with time zone  not null  default now()

-- table social_conversations   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   channel  text  not null
--   external_user_id  text  not null
--   display_name  text
--   intent  text  not null  default 'unknown'::text
--   state  jsonb  not null  default '{}'::jsonb
--   last_inbound_at  timestamp with time zone
--   last_outbound_at  timestamp with time zone
--   window_expires_at  timestamp with time zone
--   handed_off  boolean  not null  default false
--   disclosed  boolean  not null  default false
--   consent_at  timestamp with time zone
--   linked_user_id  uuid
--   created_request_id  uuid
--   turn_count  integer  not null  default 0
--   created_at  timestamp with time zone  not null  default now()

-- table social_leads   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   platform  text  not null  default 'reddit'::text
--   external_id  text  not null
--   subreddit  text
--   author  text
--   title  text
--   url  text
--   snippet  text
--   lead_type  text  not null
--   drafted_reply  text
--   status  text  not null  default 'new'::text
--   created_at  timestamp with time zone  not null  default now()
--   emailed_at  timestamp with time zone

-- table social_messages   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   conversation_id  uuid  not null
--   direction  text  not null
--   external_message_id  text
--   body  text
--   meta  jsonb  not null  default '{}'::jsonb
--   created_at  timestamp with time zone  not null  default now()

-- table ui_dismissals   (RLS on)
--   user_id  uuid  not null
--   key  text  not null
--   dismissed_at  timestamp with time zone  not null  default now()

-- table user_mfa   (RLS on)
--   user_id  uuid  not null
--   enabled  boolean  not null  default false
--   enrolled_at  timestamp with time zone
--   recovery_hashes  ARRAY _text  not null  default '{}'::text[]
--   recovery_used  integer  not null  default 0
--   last_verified_at  timestamp with time zone
--   created_at  timestamp with time zone  not null  default now()

-- table waitlist   (RLS on)
--   id  uuid  not null  default gen_random_uuid()
--   name  text
--   email  text  not null
--   phone  text
--   service  text
--   description  text
--   source  text  default 'paused_onboarding'::text
--   created_at  timestamp with time zone  not null  default now()
--   notified_at  timestamp with time zone

-- constraints
--   admin_audit_log.admin_audit_log_pkey: PRIMARY KEY (id)
--   admin_messages.admin_messages_pkey: PRIMARY KEY (id)
--   admin_messages.admin_messages_recipient_id_fkey: FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE SET NULL
--   admin_messages.admin_messages_sender_id_fkey: FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL
--   agent_actions.agent_actions_approved_by_fkey: FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL
--   agent_actions.agent_actions_conversation_id_fkey: FOREIGN KEY (conversation_id) REFERENCES social_conversations(id) ON DELETE CASCADE
--   agent_actions.agent_actions_kind_chk: CHECK ((kind ~ '^[a-z][a-z0-9_]{1,63}$'::text))
--   agent_actions.agent_actions_pkey: PRIMARY KEY (id)
--   agent_actions.agent_actions_run_id_fkey: FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
--   agent_actions.agent_actions_status_chk: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'claimed'::text, 'rejected'::text, 'sent'::text, 'failed'::text, 'expired'::text])))
--   agent_registry.agent_registry_autonomy_chk: CHECK ((autonomy = ANY (ARRAY['propose'::text, 'notify'::text, 'auto'::text])))
--   agent_registry.agent_registry_caps_check: CHECK (((max_model_calls_per_run >= 0) AND (max_proposals_per_run > 0) AND (max_pending > 0)))
--   agent_registry.agent_registry_model_budget_check: CHECK (((model = 'none'::text) = (max_model_calls_per_run = 0)))
--   agent_registry.agent_registry_model_check: CHECK ((model = ANY (ARRAY['none'::text, 'haiku'::text, 'sonnet'::text, 'opus'::text])))
--   agent_registry.agent_registry_pkey: PRIMARY KEY (agent)
--   agent_runs.agent_runs_pkey: PRIMARY KEY (id)
--   agent_runs.agent_runs_status_chk: CHECK ((status = ANY (ARRAY['running'::text, 'ok'::text, 'warn'::text, 'error'::text])))
--   agent_runs.agent_runs_trigger_chk: CHECK ((trigger = ANY (ARRAY['schedule'::text, 'event'::text, 'manual'::text])))
--   alert_throttle_log.alert_throttle_log_pkey: PRIMARY KEY (key)
--   bid_thread_reads.bid_thread_reads_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id) ON DELETE CASCADE
--   bid_thread_reads.bid_thread_reads_pkey: PRIMARY KEY (request_id, contractor_id, user_id)
--   bid_thread_reads.bid_thread_reads_request_id_fkey: FOREIGN KEY (request_id) REFERENCES client_requests(id) ON DELETE CASCADE
--   bid_thread_reads.bid_thread_reads_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
--   bids.bids_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id) ON DELETE CASCADE
--   bids.bids_pkey: PRIMARY KEY (id)
--   bids.bids_request_id_contractor_id_key: UNIQUE (request_id, contractor_id)
--   bids.bids_request_id_fkey: FOREIGN KEY (request_id) REFERENCES client_requests(id) ON DELETE CASCADE
--   bids.bids_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
--   blog_posts.blog_posts_pkey: PRIMARY KEY (slug)
--   chat_rate_limit.chat_rate_limit_pkey: PRIMARY KEY (ip)
--   client_requests.client_requests_assigned_contractor_id_fkey: FOREIGN KEY (assigned_contractor_id) REFERENCES profiles(id) ON DELETE SET NULL
--   client_requests.client_requests_budget_sane: CHECK ((((budget_min IS NULL) OR (budget_min >= (0)::numeric)) AND ((budget_max IS NULL) OR (budget_max >= (0)::numeric)) AND ((budget_min IS NULL) OR (budget_max IS NULL) OR (budget_max >= budget_min))))
--   client_requests.client_requests_client_type_check: CHECK ((client_type = ANY (ARRAY['individual'::text, 'business'::text])))
--   client_requests.client_requests_pkey: PRIMARY KEY (id)
--   client_requests.client_requests_recurring_frequency_check: CHECK ((recurring_frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text])))
--   client_requests.client_requests_recurring_parent_id_fkey: FOREIGN KEY (recurring_parent_id) REFERENCES client_requests(id) ON DELETE SET NULL
--   client_requests.client_requests_recurring_plan_status_check: CHECK ((recurring_plan_status = ANY (ARRAY['active'::text, 'paused'::text, 'ended'::text])))
--   client_requests.client_requests_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'matched'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
--   client_requests.client_requests_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
--   contractor_outreach.contractor_outreach_pkey: PRIMARY KEY (id)
--   contractor_outreach.contractor_outreach_status_check: CHECK ((status = ANY (ARRAY['new'::text, 'pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text, 'unsubscribed'::text])))
--   contractors.contractors_id_fkey: FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE
--   contractors.contractors_pkey: PRIMARY KEY (id)
--   contractors.contractors_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'inactive'::text])))
--   deleted_account_flags.deleted_account_flags_pkey: PRIMARY KEY (id)
--   dispatch_log.dispatch_log_pkey: PRIMARY KEY (id)
--   dispatch_log.dispatch_log_request_id_fkey: FOREIGN KEY (request_id) REFERENCES client_requests(id) ON DELETE CASCADE
--   disputes.disputes_client_id_fkey: FOREIGN KEY (client_id) REFERENCES profiles(id)
--   disputes.disputes_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id)
--   disputes.disputes_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
--   disputes.disputes_pkey: PRIMARY KEY (id)
--   disputes.disputes_status_check: CHECK ((status = ANY (ARRAY['open'::text, 'resolved_refund'::text, 'resolved_partial'::text, 'resolved_released'::text, 'rejected'::text])))
--   favorites.favorites_client_id_fkey: FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   favorites.favorites_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   favorites.favorites_pkey: PRIMARY KEY (client_id, contractor_id)
--   hidden_jobs.hidden_jobs_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   hidden_jobs.hidden_jobs_pkey: PRIMARY KEY (contractor_id, request_id)
--   hidden_jobs.hidden_jobs_request_id_fkey: FOREIGN KEY (request_id) REFERENCES client_requests(id) ON DELETE CASCADE
--   image_scans.image_scans_pkey: PRIMARY KEY (id)
--   image_scans.image_scans_verdict_check: CHECK ((verdict = ANY (ARRAY['ok'::text, 'flag'::text, 'reject'::text, 'unknown'::text])))
--   internal_tokens.internal_tokens_pkey: PRIMARY KEY (token)
--   job_contracts.job_contracts_client_id_fkey: FOREIGN KEY (client_id) REFERENCES profiles(id)
--   job_contracts.job_contracts_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id)
--   job_contracts.job_contracts_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
--   job_contracts.job_contracts_job_id_key: UNIQUE (job_id)
--   job_contracts.job_contracts_pkey: PRIMARY KEY (id)
--   job_expenses.job_expenses_amount_check: CHECK (((amount > (0)::numeric) AND (amount <= (100000)::numeric)))
--   job_expenses.job_expenses_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id) ON DELETE CASCADE
--   job_expenses.job_expenses_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
--   job_expenses.job_expenses_label_check: CHECK (((char_length(label) >= 1) AND (char_length(label) <= 120)))
--   job_expenses.job_expenses_pkey: PRIMARY KEY (id)
--   job_milestones.job_milestones_amount_check: CHECK ((amount > (0)::numeric))
--   job_milestones.job_milestones_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
--   job_milestones.job_milestones_job_id_seq_key: UNIQUE (job_id, seq)
--   job_milestones.job_milestones_pkey: PRIMARY KEY (id)
--   job_milestones.job_milestones_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'funded'::text, 'completed'::text, 'released'::text, 'disputed'::text, 'refunded'::text])))
--   job_time_logs.job_time_logs_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id) ON DELETE CASCADE
--   job_time_logs.job_time_logs_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
--   job_time_logs.job_time_logs_pkey: PRIMARY KEY (id)
--   jobs.jobs_chat_time_by_fkey: FOREIGN KEY (chat_time_by) REFERENCES profiles(id) ON DELETE SET NULL
--   jobs.jobs_client_id_fkey: FOREIGN KEY (client_id) REFERENCES profiles(id) ON DELETE SET NULL
--   jobs.jobs_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id) ON DELETE SET NULL
--   jobs.jobs_milestone_schedule_status_check: CHECK ((milestone_schedule_status = ANY (ARRAY['proposed'::text, 'approved'::text])))
--   jobs.jobs_payment_status_check: CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'processing'::text, 'held'::text, 'released'::text, 'refunded'::text, 'failed'::text, 'disputed'::text])))
--   jobs.jobs_pkey: PRIMARY KEY (id)
--   jobs.jobs_prepayment_id_fkey: FOREIGN KEY (prepayment_id) REFERENCES recurring_prepayments(id) ON DELETE SET NULL
--   jobs.jobs_request_id_fkey: FOREIGN KEY (request_id) REFERENCES client_requests(id) ON DELETE SET NULL
--   jobs.jobs_status_check: CHECK ((status = ANY (ARRAY['assigned'::text, 'scheduled'::text, 'in_progress'::text, 'pending_confirmation'::text, 'completed'::text, 'cancelled'::text])))
--   message_email_log.message_email_log_pkey: PRIMARY KEY (job_id, recipient_id)
--   message_reads.message_reads_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
--   message_reads.message_reads_pkey: PRIMARY KEY (job_id, user_id)
--   message_reads.message_reads_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
--   messages.messages_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
--   messages.messages_one_thread: CHECK ((((job_id IS NOT NULL) <> (request_id IS NOT NULL)) AND ((request_id IS NULL) OR (thread_contractor_id IS NOT NULL))))
--   messages.messages_pkey: PRIMARY KEY (id)
--   messages.messages_request_id_fkey: FOREIGN KEY (request_id) REFERENCES client_requests(id) ON DELETE CASCADE
--   messages.messages_sender_id_fkey: FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL
--   messages.messages_thread_contractor_id_fkey: FOREIGN KEY (thread_contractor_id) REFERENCES profiles(id) ON DELETE CASCADE
--   mfa_challenges.mfa_challenges_pkey: PRIMARY KEY (id)
--   mfa_challenges.mfa_challenges_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   newsletter_content.newsletter_content_audience_check: CHECK ((audience = ANY (ARRAY['client'::text, 'contractor'::text])))
--   newsletter_content.newsletter_content_audience_seq_key: UNIQUE (audience, seq)
--   newsletter_content.newsletter_content_pkey: PRIMARY KEY (id)
--   newsletter_content.newsletter_content_status_check: CHECK ((status = ANY (ARRAY['draft'::text, 'queued'::text, 'sent'::text, 'skipped'::text])))
--   newsletter_subscribers.newsletter_subscribers_audience_check: CHECK ((audience = ANY (ARRAY['client'::text, 'contractor'::text])))
--   newsletter_subscribers.newsletter_subscribers_email_audience_key: UNIQUE (email, audience)
--   newsletter_subscribers.newsletter_subscribers_pkey: PRIMARY KEY (id)
--   notifications.notifications_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
--   notifications.notifications_pkey: PRIMARY KEY (id)
--   notifications.notifications_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
--   platform_settings.platform_settings_pkey: PRIMARY KEY (key)
--   portfolio_items.portfolio_items_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id) ON DELETE CASCADE
--   portfolio_items.portfolio_items_pkey: PRIMARY KEY (id)
--   profiles.profiles_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
--   profiles.profiles_pkey: PRIMARY KEY (id)
--   profiles.profiles_role_check: CHECK ((role = ANY (ARRAY['client'::text, 'contractor'::text, 'admin'::text])))
--   quote_leads.quote_leads_pkey: PRIMARY KEY (id)
--   rate_limit_hits.rate_limit_hits_pkey: PRIMARY KEY (bucket, key)
--   recurring_prepayments.recurring_prepayments_amount_per_occurrence_check: CHECK ((amount_per_occurrence > (0)::numeric))
--   recurring_prepayments.recurring_prepayments_client_id_fkey: FOREIGN KEY (client_id) REFERENCES profiles(id) ON DELETE CASCADE
--   recurring_prepayments.recurring_prepayments_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES contractors(id) ON DELETE SET NULL
--   recurring_prepayments.recurring_prepayments_occurrences_total_check: CHECK (((occurrences_total >= 1) AND (occurrences_total <= 12)))
--   recurring_prepayments.recurring_prepayments_pkey: PRIMARY KEY (id)
--   recurring_prepayments.recurring_prepayments_plan_request_id_fkey: FOREIGN KEY (plan_request_id) REFERENCES client_requests(id) ON DELETE CASCADE
--   recurring_prepayments.recurring_prepayments_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'held'::text, 'partially_released'::text, 'released'::text, 'refunded'::text, 'canceled'::text])))
--   referrals.referrals_pkey: PRIMARY KEY (id)
--   referrals.referrals_referred_id_fkey: FOREIGN KEY (referred_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   referrals.referrals_referred_id_key: UNIQUE (referred_id)
--   referrals.referrals_referrer_id_fkey: FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   reminder_log.reminder_log_pkey: PRIMARY KEY (id)
--   reminder_log.reminder_log_user_id_kind_key: UNIQUE (user_id, kind)
--   repair_scans.repair_scans_pkey: PRIMARY KEY (id)
--   reviews.reviews_client_id_fkey: FOREIGN KEY (client_id) REFERENCES profiles(id) ON DELETE CASCADE
--   reviews.reviews_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id) ON DELETE CASCADE
--   reviews.reviews_experience_score_check: CHECK (((experience_score >= 1) AND (experience_score <= 10)))
--   reviews.reviews_job_id_fkey: FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
--   reviews.reviews_job_id_key: UNIQUE (job_id)
--   reviews.reviews_pkey: PRIMARY KEY (id)
--   reviews.reviews_price_score_check: CHECK (((price_score >= 1) AND (price_score <= 10)))
--   reviews.reviews_result_score_check: CHECK (((result_score >= 1) AND (result_score <= 10)))
--   saved_addresses.saved_addresses_pkey: PRIMARY KEY (id)
--   saved_addresses.saved_addresses_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   saved_vehicles.saved_vehicles_pkey: PRIMARY KEY (id)
--   saved_vehicles.saved_vehicles_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   scan_rate_limit.scan_rate_limit_pkey: PRIMARY KEY (ip)
--   service_compulsory.service_compulsory_pkey: PRIMARY KEY (service)
--   service_pricing.service_pricing_pkey: PRIMARY KEY (service)
--   service_specialty_map.service_specialty_map_pkey: PRIMARY KEY (service)
--   signup_rescue_log.signup_rescue_log_pkey: PRIMARY KEY (id)
--   social_bot_config.social_bot_config_pkey: PRIMARY KEY (key)
--   social_conversations.social_conversations_channel_check: CHECK ((channel = ANY (ARRAY['fb'::text, 'ig'::text, 'reddit'::text])))
--   social_conversations.social_conversations_channel_external_user_id_key: UNIQUE (channel, external_user_id)
--   social_conversations.social_conversations_created_request_id_fkey: FOREIGN KEY (created_request_id) REFERENCES client_requests(id) ON DELETE SET NULL
--   social_conversations.social_conversations_intent_check: CHECK ((intent = ANY (ARRAY['client'::text, 'contractor'::text, 'unknown'::text, 'other'::text])))
--   social_conversations.social_conversations_linked_user_id_fkey: FOREIGN KEY (linked_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
--   social_conversations.social_conversations_pkey: PRIMARY KEY (id)
--   social_leads.social_leads_lead_type_check: CHECK ((lead_type = ANY (ARRAY['client'::text, 'contractor'::text])))
--   social_leads.social_leads_pkey: PRIMARY KEY (id)
--   social_leads.social_leads_platform_external_id_key: UNIQUE (platform, external_id)
--   social_leads.social_leads_status_check: CHECK ((status = ANY (ARRAY['new'::text, 'emailed'::text, 'posted'::text, 'skipped'::text])))
--   social_messages.social_messages_conversation_id_fkey: FOREIGN KEY (conversation_id) REFERENCES social_conversations(id) ON DELETE CASCADE
--   social_messages.social_messages_direction_check: CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])))
--   social_messages.social_messages_pkey: PRIMARY KEY (id)
--   ui_dismissals.ui_dismissals_key_len: CHECK (((length(key) >= 1) AND (length(key) <= 80)))
--   ui_dismissals.ui_dismissals_pkey: PRIMARY KEY (user_id, key)
--   ui_dismissals.ui_dismissals_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   user_mfa.user_mfa_pkey: PRIMARY KEY (user_id)
--   user_mfa.user_mfa_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   waitlist.waitlist_pkey: PRIMARY KEY (id)

-- indexes
CREATE INDEX admin_audit_log_action_idx ON public.admin_audit_log USING btree (action, created_at DESC);
CREATE INDEX admin_audit_log_actor_idx ON public.admin_audit_log USING btree (actor_id, created_at DESC);
CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log USING btree (created_at DESC);
CREATE UNIQUE INDEX admin_audit_log_pkey ON public.admin_audit_log USING btree (id);
CREATE INDEX admin_messages_created_idx ON public.admin_messages USING btree (created_at DESC);
CREATE UNIQUE INDEX admin_messages_pkey ON public.admin_messages USING btree (id);
CREATE INDEX admin_messages_recipient_idx ON public.admin_messages USING btree (recipient_id);
CREATE INDEX admin_messages_sender_idx ON public.admin_messages USING btree (sender_id);
CREATE INDEX agent_actions_agent_idx ON public.agent_actions USING btree (agent, status, created_at DESC);
CREATE UNIQUE INDEX agent_actions_one_live_convo_idx ON public.agent_actions USING btree (conversation_id, kind) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text, 'sent'::text]));
CREATE UNIQUE INDEX agent_actions_one_live_key_idx ON public.agent_actions USING btree (agent, dedupe_key) WHERE ((dedupe_key IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'approved'::text, 'sent'::text])));
CREATE UNIQUE INDEX agent_actions_pkey ON public.agent_actions USING btree (id);
CREATE INDEX agent_actions_run_idx ON public.agent_actions USING btree (run_id);
CREATE INDEX agent_actions_status_idx ON public.agent_actions USING btree (status, created_at DESC);
CREATE UNIQUE INDEX agent_actions_token_idx ON public.agent_actions USING btree (claim_token);
CREATE UNIQUE INDEX agent_registry_pkey ON public.agent_registry USING btree (agent);
CREATE INDEX agent_runs_agent_idx ON public.agent_runs USING btree (agent, started_at DESC);
CREATE UNIQUE INDEX agent_runs_pkey ON public.agent_runs USING btree (id);
CREATE INDEX agent_runs_running_idx ON public.agent_runs USING btree (started_at DESC) WHERE (status = 'running'::text);
CREATE INDEX agent_runs_status_idx ON public.agent_runs USING btree (status, started_at DESC);
CREATE UNIQUE INDEX alert_throttle_log_pkey ON public.alert_throttle_log USING btree (key);
CREATE INDEX bid_thread_reads_contractor_idx ON public.bid_thread_reads USING btree (contractor_id);
CREATE UNIQUE INDEX bid_thread_reads_pkey ON public.bid_thread_reads USING btree (request_id, contractor_id, user_id);
CREATE INDEX bid_thread_reads_user_idx ON public.bid_thread_reads USING btree (user_id);
CREATE INDEX bids_contractor_idx ON public.bids USING btree (contractor_id, created_at DESC);
CREATE UNIQUE INDEX bids_pkey ON public.bids USING btree (id);
CREATE UNIQUE INDEX bids_request_id_contractor_id_key ON public.bids USING btree (request_id, contractor_id);
CREATE INDEX bids_request_idx ON public.bids USING btree (request_id);
CREATE UNIQUE INDEX blog_posts_pkey ON public.blog_posts USING btree (slug);
CREATE UNIQUE INDEX chat_rate_limit_pkey ON public.chat_rate_limit USING btree (ip);
CREATE INDEX client_requests_assigned_contractor_idx ON public.client_requests USING btree (assigned_contractor_id);
CREATE INDEX client_requests_board_age_idx ON public.client_requests USING btree (COALESCE(reposted_at, created_at) DESC) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX client_requests_pick_token_key ON public.client_requests USING btree (pick_token);
CREATE UNIQUE INDEX client_requests_pkey ON public.client_requests USING btree (id);
CREATE INDEX client_requests_recurring_parent_idx ON public.client_requests USING btree (recurring_parent_id);
CREATE INDEX client_requests_status_created_idx ON public.client_requests USING btree (status, created_at DESC);
CREATE INDEX client_requests_user_id_idx ON public.client_requests USING btree (user_id);
CREATE INDEX client_requests_waitlisted_idx ON public.client_requests USING btree (created_at DESC) WHERE waitlisted;
CREATE UNIQUE INDEX contractor_outreach_email_key ON public.contractor_outreach USING btree (lower(email));
CREATE UNIQUE INDEX contractor_outreach_email_uidx ON public.contractor_outreach USING btree (lower(email));
CREATE UNIQUE INDEX contractor_outreach_pkey ON public.contractor_outreach USING btree (id);
CREATE INDEX contractor_outreach_status_idx ON public.contractor_outreach USING btree (status);
CREATE INDEX contractor_outreach_trade_status_idx ON public.contractor_outreach USING btree (trade, status);
CREATE UNIQUE INDEX contractors_pkey ON public.contractors USING btree (id);
CREATE INDEX contractors_specialties_gin ON public.contractors USING gin (specialties);
CREATE INDEX contractors_stripe_acct_idx ON public.contractors USING btree (stripe_account_id);
CREATE UNIQUE INDEX deleted_account_flags_pkey ON public.deleted_account_flags USING btree (id);
CREATE INDEX dispatch_log_contractor_idx ON public.dispatch_log USING btree (contractor_id, created_at DESC);
CREATE INDEX dispatch_log_fail_idx ON public.dispatch_log USING btree (created_at DESC) WHERE (ok = false);
CREATE UNIQUE INDEX dispatch_log_pkey ON public.dispatch_log USING btree (id);
CREATE INDEX dispatch_log_request_idx ON public.dispatch_log USING btree (request_id, created_at DESC);
CREATE INDEX disputes_client_idx ON public.disputes USING btree (client_id);
CREATE INDEX disputes_contractor_idx ON public.disputes USING btree (contractor_id);
CREATE INDEX disputes_job_idx ON public.disputes USING btree (job_id);
CREATE UNIQUE INDEX disputes_pkey ON public.disputes USING btree (id);
CREATE INDEX disputes_status_idx ON public.disputes USING btree (status);
CREATE INDEX favorites_contractor_idx ON public.favorites USING btree (contractor_id);
CREATE UNIQUE INDEX favorites_pkey ON public.favorites USING btree (client_id, contractor_id);
CREATE UNIQUE INDEX hidden_jobs_pkey ON public.hidden_jobs USING btree (contractor_id, request_id);
CREATE INDEX hidden_jobs_request_idx ON public.hidden_jobs USING btree (request_id);
CREATE UNIQUE INDEX image_scans_path_uidx ON public.image_scans USING btree (bucket, path);
CREATE UNIQUE INDEX image_scans_pkey ON public.image_scans USING btree (id);
CREATE INDEX image_scans_verdict_idx ON public.image_scans USING btree (verdict, created_at DESC);
CREATE INDEX internal_tokens_expires_idx ON public.internal_tokens USING btree (expires_at);
CREATE UNIQUE INDEX internal_tokens_pkey ON public.internal_tokens USING btree (token);
CREATE INDEX job_contracts_client_idx ON public.job_contracts USING btree (client_id);
CREATE INDEX job_contracts_contractor_idx ON public.job_contracts USING btree (contractor_id);
CREATE UNIQUE INDEX job_contracts_job_id_key ON public.job_contracts USING btree (job_id);
CREATE INDEX job_contracts_job_idx ON public.job_contracts USING btree (job_id);
CREATE UNIQUE INDEX job_contracts_pkey ON public.job_contracts USING btree (id);
CREATE INDEX job_contracts_status_idx ON public.job_contracts USING btree (status);
CREATE INDEX job_expenses_contractor_idx ON public.job_expenses USING btree (contractor_id, created_at DESC);
CREATE INDEX job_expenses_job_idx ON public.job_expenses USING btree (job_id);
CREATE UNIQUE INDEX job_expenses_pkey ON public.job_expenses USING btree (id);
CREATE UNIQUE INDEX job_milestones_job_id_seq_key ON public.job_milestones USING btree (job_id, seq);
CREATE INDEX job_milestones_job_idx ON public.job_milestones USING btree (job_id, seq);
CREATE UNIQUE INDEX job_milestones_pkey ON public.job_milestones USING btree (id);
CREATE INDEX job_milestones_status_idx ON public.job_milestones USING btree (status);
CREATE INDEX job_time_logs_contractor_idx ON public.job_time_logs USING btree (contractor_id);
CREATE INDEX job_time_logs_job_idx ON public.job_time_logs USING btree (job_id);
CREATE UNIQUE INDEX job_time_logs_pkey ON public.job_time_logs USING btree (id);
CREATE INDEX jobs_chat_time_by_idx ON public.jobs USING btree (chat_time_by);
CREATE INDEX jobs_client_id_idx ON public.jobs USING btree (client_id);
CREATE INDEX jobs_contractor_id_idx ON public.jobs USING btree (contractor_id);
CREATE INDEX jobs_payment_intent_idx ON public.jobs USING btree (stripe_payment_intent_id);
CREATE UNIQUE INDEX jobs_pkey ON public.jobs USING btree (id);
CREATE INDEX jobs_prepayment_idx ON public.jobs USING btree (prepayment_id);
CREATE INDEX jobs_request_id_idx ON public.jobs USING btree (request_id);
CREATE INDEX jobs_underfunded_idx ON public.jobs USING btree (payment_status) WHERE (payment_status = 'held'::text);
CREATE UNIQUE INDEX message_email_log_pkey ON public.message_email_log USING btree (job_id, recipient_id);
CREATE UNIQUE INDEX message_reads_pkey ON public.message_reads USING btree (job_id, user_id);
CREATE INDEX message_reads_user_idx ON public.message_reads USING btree (user_id);
CREATE INDEX messages_blocked_idx ON public.messages USING btree (created_at DESC) WHERE blocked;
CREATE INDEX messages_job_id_idx ON public.messages USING btree (job_id);
CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);
CREATE INDEX messages_request_thread_idx ON public.messages USING btree (request_id, thread_contractor_id, created_at DESC);
CREATE INDEX messages_sender_idx ON public.messages USING btree (sender_id);
CREATE INDEX messages_thread_contractor_idx ON public.messages USING btree (thread_contractor_id);
CREATE UNIQUE INDEX mfa_challenges_pkey ON public.mfa_challenges USING btree (id);
CREATE INDEX mfa_challenges_user_idx ON public.mfa_challenges USING btree (user_id, purpose, created_at DESC);
CREATE UNIQUE INDEX newsletter_content_audience_seq_key ON public.newsletter_content USING btree (audience, seq);
CREATE UNIQUE INDEX newsletter_content_pkey ON public.newsletter_content USING btree (id);
CREATE UNIQUE INDEX newsletter_subscribers_email_audience_key ON public.newsletter_subscribers USING btree (email, audience);
CREATE UNIQUE INDEX newsletter_subscribers_pkey ON public.newsletter_subscribers USING btree (id);
CREATE INDEX idx_notifications_read_at ON public.notifications USING btree (user_id, read_at) WHERE (read_at IS NULL);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX notifications_job_idx ON public.notifications USING btree (job_id);
CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);
CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX platform_settings_pkey ON public.platform_settings USING btree (key);
CREATE INDEX portfolio_items_contractor_idx ON public.portfolio_items USING btree (contractor_id, created_at DESC);
CREATE UNIQUE INDEX portfolio_items_pkey ON public.portfolio_items USING btree (id);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX profiles_referral_code_key ON public.profiles USING btree (referral_code);
CREATE UNIQUE INDEX quote_leads_pkey ON public.quote_leads USING btree (id);
CREATE UNIQUE INDEX rate_limit_hits_pkey ON public.rate_limit_hits USING btree (bucket, key);
CREATE INDEX recurring_prepayments_client_idx ON public.recurring_prepayments USING btree (client_id);
CREATE INDEX recurring_prepayments_contractor_idx ON public.recurring_prepayments USING btree (contractor_id);
CREATE UNIQUE INDEX recurring_prepayments_pkey ON public.recurring_prepayments USING btree (id);
CREATE INDEX recurring_prepayments_plan_idx ON public.recurring_prepayments USING btree (plan_request_id);
CREATE UNIQUE INDEX referrals_one_reward_per_referrer ON public.referrals USING btree (referrer_id) WHERE (status = 'rewarded'::text);
CREATE UNIQUE INDEX referrals_pkey ON public.referrals USING btree (id);
CREATE UNIQUE INDEX referrals_referred_id_key ON public.referrals USING btree (referred_id);
CREATE INDEX referrals_referrer_status_idx ON public.referrals USING btree (referrer_id, status);
CREATE UNIQUE INDEX reminder_log_pkey ON public.reminder_log USING btree (id);
CREATE UNIQUE INDEX reminder_log_user_id_kind_key ON public.reminder_log USING btree (user_id, kind);
CREATE UNIQUE INDEX repair_scans_pkey ON public.repair_scans USING btree (id);
CREATE INDEX reviews_client_idx ON public.reviews USING btree (client_id);
CREATE INDEX reviews_contractor_idx ON public.reviews USING btree (contractor_id, created_at DESC);
CREATE UNIQUE INDEX reviews_job_id_key ON public.reviews USING btree (job_id);
CREATE UNIQUE INDEX reviews_pkey ON public.reviews USING btree (id);
CREATE UNIQUE INDEX saved_addresses_pkey ON public.saved_addresses USING btree (id);
CREATE INDEX saved_addresses_user_idx ON public.saved_addresses USING btree (user_id);
CREATE UNIQUE INDEX saved_vehicles_pkey ON public.saved_vehicles USING btree (id);
CREATE INDEX saved_vehicles_user_idx ON public.saved_vehicles USING btree (user_id);
CREATE UNIQUE INDEX scan_rate_limit_pkey ON public.scan_rate_limit USING btree (ip);
CREATE UNIQUE INDEX service_compulsory_pkey ON public.service_compulsory USING btree (service);
CREATE UNIQUE INDEX service_pricing_pkey ON public.service_pricing USING btree (service);
CREATE UNIQUE INDEX service_specialty_map_pkey ON public.service_specialty_map USING btree (service);
CREATE UNIQUE INDEX signup_rescue_log_pkey ON public.signup_rescue_log USING btree (id);
CREATE INDEX signup_rescue_log_user_idx ON public.signup_rescue_log USING btree (user_id, sent_at DESC);
CREATE UNIQUE INDEX social_bot_config_pkey ON public.social_bot_config USING btree (key);
CREATE UNIQUE INDEX social_conversations_channel_external_user_id_key ON public.social_conversations USING btree (channel, external_user_id);
CREATE UNIQUE INDEX social_conversations_pkey ON public.social_conversations USING btree (id);
CREATE UNIQUE INDEX social_leads_pkey ON public.social_leads USING btree (id);
CREATE UNIQUE INDEX social_leads_platform_external_id_key ON public.social_leads USING btree (platform, external_id);
CREATE INDEX social_messages_convo_idx ON public.social_messages USING btree (conversation_id, created_at DESC);
CREATE UNIQUE INDEX social_messages_dedupe_idx ON public.social_messages USING btree (conversation_id, external_message_id) WHERE (external_message_id IS NOT NULL);
CREATE UNIQUE INDEX social_messages_pkey ON public.social_messages USING btree (id);
CREATE UNIQUE INDEX ui_dismissals_pkey ON public.ui_dismissals USING btree (user_id, key);
CREATE UNIQUE INDEX user_mfa_pkey ON public.user_mfa USING btree (user_id);
CREATE UNIQUE INDEX waitlist_email_key ON public.waitlist USING btree (lower(email));
CREATE UNIQUE INDEX waitlist_pkey ON public.waitlist USING btree (id);

-- policies
--   admin_audit_log / admin_audit_log_admin_select [SELECT] roles={authenticated}
--     using: is_admin()
--     check: None
--   admin_messages / admin_messages_admin_select [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   agent_actions / agent_actions_admin [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   agent_registry / agent_registry_admin [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   agent_runs / agent_runs_admin [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   bid_thread_reads / bid_thread_reads own [ALL] roles={authenticated}
--     using: (user_id = ( SELECT auth.uid() AS uid))
--     check: (user_id = ( SELECT auth.uid() AS uid))
--   bids / bids admin read [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   bids / bids client read own request [SELECT] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM client_requests r
  WHERE ((r.id = bids.request_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))
--     check: None
--   bids / bids contractor read own [SELECT] roles={authenticated}
--     using: (contractor_id = ( SELECT auth.uid() AS uid))
--     check: None
--   blog_posts / blog_posts_admin_write [ALL] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   blog_posts / blog_posts_public_read [SELECT] roles={public}
--     using: true
--     check: None
--   client_requests / Admin full access to client_requests [ALL] roles={authenticated}
--     using: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::text)
--     check: None
--   client_requests / Clients insert own requests [INSERT] roles={authenticated}
--     using: None
--     check: (user_id = ( SELECT auth.uid() AS uid))
--   client_requests / Clients view own requests [SELECT] roles={authenticated}
--     using: (user_id = ( SELECT auth.uid() AS uid))
--     check: None
--   client_requests / Contractors view assigned requests [SELECT] roles={authenticated}
--     using: ((EXISTS ( SELECT 1
   FROM contractors c
  WHERE ((c.id = ( SELECT auth.uid() AS uid)) AND (c.status = 'active'::text)))) AND ((assigned_contractor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.request_id = client_requests.id) AND (j.contractor_id = ( SELECT auth.uid() AS uid)))))))
--     check: None
--   contractor_outreach / admin_all_contractor_outreach [ALL] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))
--     check: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))
--   contractors / Admin full access to contractors [ALL] roles={authenticated}
--     using: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::text)
--     check: None
--   contractors / Contractors manage own profile [ALL] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = id)
--     check: None
--   deleted_account_flags / admins read deleted_account_flags [SELECT] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))
--     check: None
--   disputes / admin manages disputes [ALL] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: ( SELECT is_admin() AS is_admin)
--   disputes / client reads own disputes [SELECT] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = client_id)
--     check: None
--   disputes / contractor reads disputes on their jobs [SELECT] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = contractor_id)
--     check: None
--   favorites / favorites_own [ALL] roles={authenticated}
--     using: (client_id = ( SELECT auth.uid() AS uid))
--     check: (client_id = ( SELECT auth.uid() AS uid))
--   hidden_jobs / hidden_jobs_delete_own [DELETE] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = contractor_id)
--     check: None
--   hidden_jobs / hidden_jobs_insert_own [INSERT] roles={authenticated}
--     using: None
--     check: (( SELECT auth.uid() AS uid) = contractor_id)
--   hidden_jobs / hidden_jobs_select_own [SELECT] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = contractor_id)
--     check: None
--   image_scans / image_scans_admin_read [SELECT] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))
--     check: None
--   job_contracts / job_contracts_select [SELECT] roles={authenticated}
--     using: (( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = job_contracts.job_id) AND ((j.client_id = ( SELECT auth.uid() AS uid)) OR (j.contractor_id = ( SELECT auth.uid() AS uid)))))))
--     check: None
--   job_expenses / job_expenses contractor delete [DELETE] roles={authenticated}
--     using: (contractor_id = ( SELECT auth.uid() AS uid))
--     check: None
--   job_expenses / job_expenses contractor insert [INSERT] roles={authenticated}
--     using: None
--     check: ((contractor_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = job_expenses.job_id) AND (j.contractor_id = ( SELECT auth.uid() AS uid))))))
--   job_expenses / job_expenses contractor select [SELECT] roles={authenticated}
--     using: ((contractor_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))
--     check: None
--   job_milestones / job_milestones_read [SELECT] roles={authenticated}
--     using: (( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = job_milestones.job_id) AND ((( SELECT auth.uid() AS uid) = j.client_id) OR (( SELECT auth.uid() AS uid) = j.contractor_id))))))
--     check: None
--   job_time_logs / time_logs admin [SELECT] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))
--     check: None
--   job_time_logs / time_logs client of job [SELECT] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = job_time_logs.job_id) AND (j.client_id = ( SELECT auth.uid() AS uid)))))
--     check: None
--   job_time_logs / time_logs contractor own [SELECT] roles={authenticated}
--     using: (contractor_id = ( SELECT auth.uid() AS uid))
--     check: None
--   jobs / Admin full access to jobs [ALL] roles={authenticated}
--     using: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::text)
--     check: None
--   jobs / Job parties see their jobs [SELECT] roles={authenticated}
--     using: ((( SELECT auth.uid() AS uid) = client_id) OR (( SELECT auth.uid() AS uid) = contractor_id))
--     check: None
--   message_reads / message_reads_admin_read [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   message_reads / message_reads_own [ALL] roles={authenticated}
--     using: (user_id = ( SELECT auth.uid() AS uid))
--     check: (user_id = ( SELECT auth.uid() AS uid))
--   messages / Admin full access to messages [ALL] roles={authenticated}
--     using: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::text)
--     check: None
--   messages / messages participant read [SELECT] roles={authenticated}
--     using: ((( SELECT auth.uid() AS uid) IN ( SELECT jobs.client_id
   FROM jobs
  WHERE (jobs.id = messages.job_id)
UNION
 SELECT jobs.contractor_id
   FROM jobs
  WHERE (jobs.id = messages.job_id))) AND ((blocked IS NOT TRUE) OR (sender_id = ( SELECT auth.uid() AS uid))))
--     check: None
--   messages / messages participant send [INSERT] roles={authenticated}
--     using: None
--     check: (( SELECT auth.uid() AS uid) IN ( SELECT jobs.client_id
   FROM jobs
  WHERE (jobs.id = messages.job_id)
UNION
 SELECT jobs.contractor_id
   FROM jobs
  WHERE (jobs.id = messages.job_id)))
--   messages / messages request thread read [SELECT] roles={authenticated}
--     using: ((request_id IS NOT NULL) AND ((( SELECT auth.uid() AS uid) = thread_contractor_id) OR (( SELECT auth.uid() AS uid) = ( SELECT r.user_id
   FROM client_requests r
  WHERE (r.id = messages.request_id)))) AND ((blocked IS NOT TRUE) OR (sender_id = ( SELECT auth.uid() AS uid))))
--     check: None
--   messages / messages request thread send [INSERT] roles={authenticated}
--     using: None
--     check: ((request_id IS NOT NULL) AND (thread_contractor_id IS NOT NULL) AND (sender_id = ( SELECT auth.uid() AS uid)) AND (((( SELECT auth.uid() AS uid) = ( SELECT r.user_id
   FROM client_requests r
  WHERE (r.id = messages.request_id))) AND (EXISTS ( SELECT 1
   FROM bids b
  WHERE ((b.request_id = messages.request_id) AND (b.contractor_id = messages.thread_contractor_id))))) OR ((( SELECT auth.uid() AS uid) = thread_contractor_id) AND bid_thread_open(request_id, thread_contractor_id))))
--   newsletter_content / newsletter_content_admin_all [ALL] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   newsletter_subscribers / newsletter_subs_admin_all [ALL] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   notifications / Admins read all notifications [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   notifications / Users read own notifications [SELECT] roles={authenticated}
--     using: (user_id = ( SELECT auth.uid() AS uid))
--     check: None
--   notifications / Users update own notifications [UPDATE] roles={authenticated}
--     using: (user_id = ( SELECT auth.uid() AS uid))
--     check: (user_id = ( SELECT auth.uid() AS uid))
--   objects / bid_media_insert [INSERT] roles={authenticated}
--     using: None
--     check: ((bucket_id = 'message-media'::text) AND bid_media_path_ok(name))
--   objects / bid_media_select [SELECT] roles={authenticated}
--     using: ((bucket_id = 'message-media'::text) AND (EXISTS ( SELECT 1
   FROM messages m
  WHERE ((m.attachment_path = objects.name) AND (m.request_id IS NOT NULL)))))
--     check: None
--   objects / client upload problem photos [INSERT] roles={authenticated}
--     using: None
--     check: ((bucket_id = 'problem-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
--   objects / contractor photos owner delete [DELETE] roles={authenticated}
--     using: ((bucket_id = 'contractor-photos'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text))
--     check: None
--   objects / contractor photos owner or admin read [SELECT] roles={authenticated}
--     using: ((bucket_id = 'contractor-photos'::text) AND ((split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) OR is_admin()))
--     check: None
--   objects / contractor photos owner update [UPDATE] roles={authenticated}
--     using: ((bucket_id = 'contractor-photos'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text))
--     check: None
--   objects / contractor photos owner upload [INSERT] roles={authenticated}
--     using: None
--     check: ((bucket_id = 'contractor-photos'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text))
--   objects / contractor upload completion photos [INSERT] roles={authenticated}
--     using: None
--     check: ((bucket_id = 'completion-photos'::text) AND (EXISTS ( SELECT 1
   FROM jobs j
  WHERE (((j.id)::text = split_part(objects.name, '/'::text, 1)) AND (j.contractor_id = auth.uid())))))
--   objects / contractor_docs_admin_select [SELECT] roles={authenticated}
--     using: ((bucket_id = 'contractor-docs'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))
--     check: None
--   objects / contractor_docs_insert [INSERT] roles={public}
--     using: None
--     check: ((bucket_id = 'contractor-docs'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid)))
--   objects / contractor_docs_select [SELECT] roles={public}
--     using: ((bucket_id = 'contractor-docs'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid)))
--     check: None
--   objects / contractor_docs_update [UPDATE] roles={public}
--     using: ((bucket_id = 'contractor-docs'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid)))
--     check: None
--   objects / contracts_insert [INSERT] roles={authenticated}
--     using: None
--     check: ((bucket_id = 'contracts'::text) AND (EXISTS ( SELECT 1
   FROM jobs j
  WHERE (((j.id)::text = (storage.foldername(objects.name))[1]) AND (j.contractor_id = ( SELECT auth.uid() AS uid))))))
--   objects / contracts_select [SELECT] roles={authenticated}
--     using: ((bucket_id = 'contracts'::text) AND (is_admin() OR (EXISTS ( SELECT 1
   FROM jobs j
  WHERE (((j.id)::text = (storage.foldername(objects.name))[1]) AND ((j.client_id = ( SELECT auth.uid() AS uid)) OR (j.contractor_id = ( SELECT auth.uid() AS uid))))))))
--     check: None
--   objects / dispute parties read problem photos [SELECT] roles={public}
--     using: ((bucket_id = 'problem-photos'::text) AND (EXISTS ( SELECT 1
   FROM disputes d
  WHERE (((auth.uid() = d.client_id) OR (auth.uid() = d.contractor_id)) AND ((objects.name = ANY (d.photo_paths)) OR (objects.name = ANY (d.contractor_response_photos)))))))
--     check: None
--   objects / job parties read completion photos [SELECT] roles={authenticated}
--     using: ((bucket_id = 'completion-photos'::text) AND (is_admin() OR (EXISTS ( SELECT 1
   FROM jobs j
  WHERE (((j.id)::text = split_part(objects.name, '/'::text, 1)) AND ((j.contractor_id = auth.uid()) OR (j.client_id = auth.uid())))))))
--     check: None
--   objects / message_media_insert [INSERT] roles={authenticated}
--     using: None
--     check: ((bucket_id = 'message-media'::text) AND ((EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = (split_part(objects.name, '/'::text, 1))::uuid) AND ((( SELECT auth.uid() AS uid) = j.client_id) OR (( SELECT auth.uid() AS uid) = j.contractor_id))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))))
--   objects / message_media_select [SELECT] roles={authenticated}
--     using: ((bucket_id = 'message-media'::text) AND ((EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = (split_part(objects.name, '/'::text, 1))::uuid) AND ((( SELECT auth.uid() AS uid) = j.client_id) OR (( SELECT auth.uid() AS uid) = j.contractor_id))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))))
--     check: None
--   objects / portfolio photos owner delete [DELETE] roles={authenticated}
--     using: ((bucket_id = 'portfolio-photos'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text))
--     check: None
--   objects / portfolio photos owner or admin read [SELECT] roles={authenticated}
--     using: ((bucket_id = 'portfolio-photos'::text) AND ((split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) OR is_admin()))
--     check: None
--   objects / portfolio photos owner upload [INSERT] roles={authenticated}
--     using: None
--     check: ((bucket_id = 'portfolio-photos'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text))
--   objects / read permitted problem photos [SELECT] roles={authenticated}
--     using: ((bucket_id = 'problem-photos'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin() OR (EXISTS ( SELECT 1
   FROM client_requests cr
  WHERE (cr.photo_path = objects.name)))))
--     check: None
--   portfolio_items / portfolio owner manage [ALL] roles={authenticated}
--     using: (contractor_id = ( SELECT auth.uid() AS uid))
--     check: (contractor_id = ( SELECT auth.uid() AS uid))
--   portfolio_items / portfolio public read [SELECT] roles={public}
--     using: true
--     check: None
--   profiles / Admins manage all profiles [ALL] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: ( SELECT is_admin() AS is_admin)
--   profiles / Connected users can view profiles [SELECT] roles={authenticated}
--     using: shares_connection(id)
--     check: None
--   profiles / Users manage own profile [ALL] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = id)
--     check: (( SELECT auth.uid() AS uid) = id)
--   quote_leads / quote_leads admin read [SELECT] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))
--     check: None
--   quote_leads / quote_leads admin update [UPDATE] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))
--     check: None
--   recurring_prepayments / rp_admin_all [ALL] roles={authenticated}
--     using: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))
--     check: None
--   recurring_prepayments / rp_client_read [SELECT] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = client_id)
--     check: None
--   recurring_prepayments / rp_contractor_read [SELECT] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = contractor_id)
--     check: None
--   referrals / referrals_mine [SELECT] roles={authenticated}
--     using: ((referrer_id = ( SELECT auth.uid() AS uid)) OR (referred_id = ( SELECT auth.uid() AS uid)))
--     check: None
--   repair_scans / repair_scans_admin_select [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   reviews / reviews_party_read [SELECT] roles={authenticated}
--     using: ((client_id = ( SELECT auth.uid() AS uid)) OR (contractor_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))
--     check: None
--   saved_addresses / saved_addresses owner all [ALL] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = user_id)
--     check: (( SELECT auth.uid() AS uid) = user_id)
--   saved_vehicles / saved_vehicles owner all [ALL] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = user_id)
--     check: (( SELECT auth.uid() AS uid) = user_id)
--   service_compulsory / service_compulsory_read [SELECT] roles={public}
--     using: true
--     check: None
--   service_pricing / service_pricing_read [SELECT] roles={public}
--     using: true
--     check: None
--   service_specialty_map / service_specialty_map_read [SELECT] roles={public}
--     using: true
--     check: None
--   social_conversations / social_conversations_admin [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   social_leads / social_leads_admin_select [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   social_messages / social_messages_admin [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   ui_dismissals / ui_dismissals_own_delete [DELETE] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = user_id)
--     check: None
--   ui_dismissals / ui_dismissals_own_insert [INSERT] roles={authenticated}
--     using: None
--     check: (( SELECT auth.uid() AS uid) = user_id)
--   ui_dismissals / ui_dismissals_own_select [SELECT] roles={authenticated}
--     using: (( SELECT auth.uid() AS uid) = user_id)
--     check: None
--   user_mfa / user_mfa_own_read [SELECT] roles={authenticated}
--     using: (user_id = ( SELECT auth.uid() AS uid))
--     check: None
--   waitlist / Admin reads waitlist [SELECT] roles={authenticated}
--     using: ( SELECT is_admin() AS is_admin)
--     check: None
--   waitlist / Anyone can join the waitlist [INSERT] roles={anon,authenticated}
--     using: None
--     check: true

-- triggers
CREATE TRIGGER on_auth_user_check_phone BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION enforce_unique_signup_phone();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER bids_block_waitlisted BEFORE INSERT OR UPDATE ON public.bids FOR EACH ROW EXECUTE FUNCTION block_bids_on_waitlisted();
CREATE TRIGGER admin_alert_new_job AFTER INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION trg_admin_alert_new_job();
CREATE TRIGGER client_requests_outreach_gap AFTER INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION auto_queue_outreach_for_request();
CREATE TRIGGER client_requests_pause_guard BEFORE INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION enforce_platform_pause();
CREATE TRIGGER "notify-admin-client " AFTER INSERT ON public.client_requests FOR EACH ROW WHEN ((NOT outbound_paused())) EXECUTE FUNCTION supabase_functions.http_request('https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/notify-admin', 'POST', '{"Content-type":"application/json"}', '{}', '5000');
CREATE TRIGGER trg_dispatch_new_request AFTER INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION trg_dispatch_new_request();
CREATE TRIGGER trg_notify_contractors_new_request AFTER INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION notify_contractors_new_request();
CREATE TRIGGER trg_notify_preferred_contractor AFTER INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION notify_preferred_contractor();
CREATE TRIGGER trg_notify_request_received AFTER INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION trg_notify_request_received();
CREATE TRIGGER admin_alert_new_contractor AFTER INSERT ON public.contractors FOR EACH ROW EXECUTE FUNCTION trg_admin_alert_new_contractor();
CREATE TRIGGER contractor_welcome_email AFTER INSERT ON public.contractors FOR EACH ROW EXECUTE FUNCTION send_contractor_welcome();
CREATE TRIGGER job_contracts_touch BEFORE UPDATE ON public.job_contracts FOR EACH ROW EXECUTE FUNCTION tg_job_contracts_touch();
CREATE TRIGGER milestone_payment_receipt AFTER UPDATE OF status ON public.job_milestones FOR EACH ROW EXECUTE FUNCTION receipt_on_milestone_release();
CREATE TRIGGER job_payment_receipt AFTER UPDATE OF payment_status ON public.jobs FOR EACH ROW EXECUTE FUNCTION receipt_on_job_release();
CREATE TRIGGER jobs_stats_aiud AFTER INSERT OR DELETE OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION jobs_stats_trigger();
CREATE TRIGGER jobs_void_contract_on_price_change AFTER UPDATE ON public.jobs FOR EACH ROW WHEN ((old.amount IS DISTINCT FROM new.amount)) EXECUTE FUNCTION void_contract_on_price_change();
CREATE TRIGGER trg_jobs_notify_client AFTER UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION trg_jobs_notify_client();
CREATE TRIGGER messages_chat_guard BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION chat_guard();
CREATE TRIGGER notify_new_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION notify_new_message();
CREATE TRIGGER "send-notification-email" AFTER INSERT ON public.notifications FOR EACH ROW WHEN (((new.type = 'health_alert'::text) OR (NOT outbound_paused()))) EXECUTE FUNCTION supabase_functions.http_request('https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/send-notification', 'POST', '{"Content-type":"application/json"}', '{}', '5000');
CREATE TRIGGER client_welcome_email AFTER INSERT ON public.profiles FOR EACH ROW WHEN ((new.role = 'client'::text)) EXECUTE FUNCTION send_client_welcome();
CREATE TRIGGER trg_assign_referral_code BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION assign_referral_code();
CREATE TRIGGER trg_prevent_role_escalation BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_escalation();
CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();
CREATE TRIGGER enforce_versioning_status_transition BEFORE UPDATE OF versioning_status ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_versioning_status_transition();
CREATE TRIGGER protect_active_lifecycle_states BEFORE DELETE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_active_lifecycle_states();
CREATE TRIGGER protect_bucket_control_insert BEFORE INSERT ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns('service_role');
CREATE TRIGGER protect_bucket_control_update BEFORE UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns();
CREATE TRIGGER protect_bucket_control_update_role AFTER UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_lifecycle_service_role('service_role');
CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
CREATE TRIGGER wake_lifecycle_on_policy_write AFTER INSERT OR UPDATE OF lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.wake_lifecycle_state();
CREATE TRIGGER wake_lifecycle_on_versioning_enable AFTER UPDATE OF versioning_status ON storage.buckets FOR EACH ROW WHEN ((new.lifecycle_configuration IS NOT NULL)) EXECUTE FUNCTION storage.wake_lifecycle_state();
CREATE TRIGGER ff_upload_rate_guard BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage_upload_rate_guard();
CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();
CREATE TRIGGER ui_dismissals_cap_guard BEFORE INSERT ON public.ui_dismissals FOR EACH ROW EXECUTE FUNCTION ui_dismissals_cap();

-- cron jobs
--   agent-lead-response  [0 14 * * *]  active=True  select public.agent_lead_response_run('schedule');
--   auto-confirm-stale-jobs  [0 9 * * *]  active=True  select public.auto_confirm_stale_jobs(3);
--   collect-balances  [52 * * * *]  active=True  select public.kick_collect_balances();
--   daily-reminders  [30 16 * * *]  active=True  select public.run_reminders();
--   escalate-unbid-requests  [7 * * * *]  active=True  select public.escalate_stale_unbid_requests(24);
--   meta-lead-scout  [43 */2 * * *]  active=True  select public.kick_meta_lead_scout();
--   newsletter-client  [0 16 * * 4]  active=True  select public.kick_newsletter('client')
--   newsletter-contractor  [0 16 * * 2]  active=True  select public.kick_newsletter('contractor')
--   owner-daily-digest  [12 14 * * *]  active=True  select public.owner_daily_digest();
--   platform-health-check  [0 15 * * *]  active=True  select public.run_platform_health_check();
--   prune-rate-limits  [17 4 * * *]  active=True  select public.prune_rate_limit_hits();
--   reconcile-payouts  [*/15 * * * *]  active=True  select public.kick_reconcile_payouts();
--   refire-stale-requests  [22 * * * *]  active=True  select public.refire_stale_requests(3);
--   release-unconfirmed-visits  [*/15 * * * *]  active=True  select public.release_unconfirmed_visits();
--   rescue-stuck-signups  [37 * * * *]  active=True  select public.rescue_stuck_signups();
--   visit-reminders  [*/10 * * * *]  active=True  select public.kick_visit_reminders();

-- views
