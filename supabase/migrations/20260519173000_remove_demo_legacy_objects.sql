alter table public.consorcios
drop column if exists es_demo,
drop column if exists demo_unit_limit;

drop trigger if exists enforce_demo_unit_limit_trigger on public.unidades_funcionales;
drop trigger if exists enforce_trial_unit_limit_trigger on public.unidades_funcionales;

drop function if exists public.complete_demo_onboarding(text, text, text, text, text, text, text);
drop function if exists public.enforce_demo_unit_limit();

create or replace function public.enforce_trial_unit_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tenant_record public.consorcios%rowtype;
  active_subscription public.consorcio_suscripciones%rowtype;
  next_count integer;
begin
  select *
  into tenant_record
  from public.consorcios
  where id = new.consorcio_id;

  select *
  into active_subscription
  from public.consorcio_suscripciones
  where consorcio_id = new.consorcio_id;

  if tenant_record.id is null
    or active_subscription.id is null
    or active_subscription.estado <> 'trial'
    or (active_subscription.trial_expires_at is not null and active_subscription.trial_expires_at < timezone('utc', now())) then
    return new;
  end if;

  select count(*)
  into next_count
  from public.unidades_funcionales unidad
  where unidad.consorcio_id = new.consorcio_id
    and (tg_op <> 'UPDATE' or unidad.id <> new.id);

  if next_count + 1 > greatest(coalesce(tenant_record.trial_unit_limit, 3), 0) then
    raise exception 'El periodo de prueba permite cargar hasta % unidades funcionales', greatest(coalesce(tenant_record.trial_unit_limit, 3), 0);
  end if;

  return new;
end;
$$;

create trigger enforce_trial_unit_limit_trigger
before insert or update on public.unidades_funcionales
for each row execute function public.enforce_trial_unit_limit();
