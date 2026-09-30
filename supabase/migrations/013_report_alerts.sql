-- ====================================================================
-- Sipply — migration 013: tell someone when a report is filed
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT FIXES
--
-- docs/terms.md promises that reports are "reviewed and acted on within 24
-- hours", and 006 says moderation happens in the dashboard. Nothing
-- connected the two: a report sat in public.reports until someone happened
-- to open the table. A promise with a deadline needs something that says
-- the clock has started.
--
-- After this file, every new report sends one short message to a webhook
-- of your choosing. The message carries the report's id, reason, whether
-- it is about a post or a person, and the time. It never carries the
-- caption, the names or anything else the report is about: that stays in
-- the database, and the moderator reads it in the dashboard.
--
-- THE URL IS NOT IN THIS FILE, AND MUST NOT BE
--
-- A webhook URL is a credential: anyone holding it can post to the
-- channel. It lives in Supabase Vault and the trigger reads it at send
-- time. Until the secret exists the trigger does nothing, so this file is
-- safe to apply first and wire up later.
--
-- The body is Slack-style JSON, {"text": "..."}, which is accepted as-is
-- by a Slack incoming webhook, a Google Chat space webhook, and a Discord
-- webhook with /slack added to the end of its URL.
--
-- To switch it on, run this once in the SQL editor with your own URL (it
-- is stored encrypted and never written to the repo):
--
--   select vault.create_secret('<your webhook url>', 'report_alert_url');
--
-- To change it later: vault.update_secret(id, '<new url>'), with the id
-- from  select id from vault.secrets where name = 'report_alert_url';
--
-- FAILURE NEVER BLOCKS A REPORT
--
-- pg_net queues the request and sends it after the transaction commits, so
-- the report insert does not wait on the network. Anything that goes wrong
-- inside the trigger (no pg_net, no vault, a malformed URL) is caught and
-- logged as a warning: losing an alert is bad, losing the report itself
-- would be worse.
--
-- ORDER
--
-- Any time after 011. Independent of 012.
--
-- BEFORE APPLYING, check nobody already set this up by hand as a Database
-- Webhook in the dashboard, which would not be in the repo. Expect no
-- rows other than reports_prepare (012) and, after this file,
-- reports_alert:
--
--   select tgname from pg_trigger
--   where tgrelid = 'public.reports'::regclass and not tgisinternal;
--
-- VERIFY AFTERWARDS (read-only)
--
--   select extname from pg_extension where extname = 'pg_net';
--   select name from vault.secrets where name = 'report_alert_url';
--   -- After filing a test report from a throwaway account: a 2xx here
--   -- means the channel received it.
--   select status_code, created from net._http_response order by created desc limit 5;
-- ====================================================================

create extension if not exists pg_net;

create or replace function public.alert_new_report()
returns trigger
language plpgsql
-- Definer, so it can read Vault, which no client role can.
security definer
set search_path = ''
as $$
declare
  target text;
begin
  select ds.decrypted_secret into target
  from vault.decrypted_secrets ds
  where ds.name = 'report_alert_url'
  limit 1;

  if target is null or btrim(target) = '' then
    return null;
  end if;

  perform net.http_post(
    url     := target,
    body    := jsonb_build_object(
      'text',
      format(
        'Sipply: new report (%s, %s) at %s. Review it in the dashboard: table public.reports, id %s.',
        new.reason,
        case when new.reported_post_id is not null then 'a post' else 'an account' end,
        to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'),
        new.id
      )
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  return null;
exception
  when others then
    raise warning 'report alert not sent for report %: %', new.id, sqlerrm;
    return null;
end;
$$;

revoke all on function public.alert_new_report() from public, anon, authenticated;

-- AFTER, so it only fires for a report that actually passed every check
-- and is about to commit.
drop trigger if exists reports_alert on public.reports;
create trigger reports_alert
  after insert on public.reports
  for each row execute function public.alert_new_report();


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('013_report_alerts') on conflict (version) do nothing;
