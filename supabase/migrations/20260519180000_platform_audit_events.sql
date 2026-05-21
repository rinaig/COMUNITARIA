create table if not exists public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id text,
  consorcio_id uuid references public.consorcios(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.log_platform_audit_event()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id_value uuid := auth.uid();
  next_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  previous_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  consorcio_id_value text := coalesce(next_row ->> 'consorcio_id', previous_row ->> 'consorcio_id');
  target_id_value text := coalesce(next_row ->> 'id', previous_row ->> 'id');
begin
  insert into public.platform_audit_events (
    actor_id,
    action,
    target_table,
    target_id,
    consorcio_id,
    detail
  )
  values (
    actor_id_value,
    lower(tg_table_name || '_' || tg_op),
    tg_table_name,
    nullif(target_id_value, ''),
    nullif(consorcio_id_value, '')::uuid,
    jsonb_build_object(
      'operation', lower(tg_op),
      'new', next_row,
      'old', previous_row
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists platform_settings_audit_trigger on public.platform_settings;
create trigger platform_settings_audit_trigger
after update on public.platform_settings
for each row execute function public.log_platform_audit_event();

drop trigger if exists consorcio_suscripciones_audit_trigger on public.consorcio_suscripciones;
create trigger consorcio_suscripciones_audit_trigger
after insert or update on public.consorcio_suscripciones
for each row execute function public.log_platform_audit_event();

drop trigger if exists admin_payment_events_audit_trigger on public.admin_payment_events;
create trigger admin_payment_events_audit_trigger
after insert or update on public.admin_payment_events
for each row execute function public.log_platform_audit_event();

alter table public.platform_audit_events enable row level security;

create policy "platform_audit_superadmin_read"
on public.platform_audit_events
for select
using (public.is_superadmin());

create policy "platform_audit_actor_insert"
on public.platform_audit_events
for insert
with check (
  public.is_superadmin()
  or public.current_role() = 'admin'
  or actor_id is null
);
