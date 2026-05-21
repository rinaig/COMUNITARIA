create table if not exists public.notificacion_lecturas (
  id uuid primary key default gen_random_uuid(),
  notificacion_id uuid not null references public.notificaciones(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  leida_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (notificacion_id, profile_id)
);

create or replace function public.mark_visible_notifications_read(
  p_notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  marked_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  with visible_notifications as (
    select notification.id
    from public.notificaciones notification
    where (
      public.is_superadmin()
      or notification.destinatario_id = current_user_id
      or (
        notification.consorcio_id = public.current_consorcio_id()
        and notification.rol_destino = public.current_role()
      )
      or (
        notification.consorcio_id = public.current_consorcio_id()
        and public.current_role() = 'admin'
      )
    )
    and (p_notification_ids is null or notification.id = any(p_notification_ids))
  ),
  upsert_reads as (
    insert into public.notificacion_lecturas (notificacion_id, profile_id, leida_at)
    select visible_notifications.id, current_user_id, timezone('utc', now())
    from visible_notifications
    on conflict (notificacion_id, profile_id)
    do update set leida_at = excluded.leida_at
    returning notificacion_id
  )
  select count(*) into marked_count
  from upsert_reads;

  update public.notificaciones notification
  set leida_at = timezone('utc', now())
  where notification.destinatario_id = current_user_id
    and (p_notification_ids is null or notification.id = any(p_notification_ids));

  return marked_count;
end;
$$;

grant execute on function public.mark_visible_notifications_read(uuid[]) to authenticated;

alter table public.notificacion_lecturas enable row level security;

drop policy if exists "tenant_notification_reads_select" on public.notificacion_lecturas;

create policy "tenant_notification_reads_select"
on public.notificacion_lecturas
for select
using (
  public.is_superadmin()
  or profile_id = auth.uid()
  or (
    public.current_role() = 'admin'
    and exists (
      select 1
      from public.notificaciones notification
      where notification.id = public.notificacion_lecturas.notificacion_id
        and notification.consorcio_id = public.current_consorcio_id()
    )
  )
);

drop policy if exists "tenant_notification_reads_insert" on public.notificacion_lecturas;

create policy "tenant_notification_reads_insert"
on public.notificacion_lecturas
for insert
with check (
  public.is_superadmin()
  or profile_id = auth.uid()
);

drop policy if exists "tenant_notification_reads_update" on public.notificacion_lecturas;

create policy "tenant_notification_reads_update"
on public.notificacion_lecturas
for update
using (
  public.is_superadmin()
  or profile_id = auth.uid()
)
with check (
  public.is_superadmin()
  or profile_id = auth.uid()
);
