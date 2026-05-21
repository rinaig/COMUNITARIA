create or replace function public.refresh_roster_access_code(
  p_roster_id uuid
)
returns table(roster_id uuid, codigo_acceso text, codigo_acceso_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_access_role public.app_role := public.current_role();
  roster_row public.padron_accesos_importados%rowtype;
  next_code text;
  next_expiration timestamptz := timezone('utc', now()) + interval '48 hours';
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_superadmin() and current_access_role <> 'admin' then
    raise exception 'No tienes permisos para regenerar codigos de acceso';
  end if;

  select *
  into roster_row
  from public.padron_accesos_importados
  where id = p_roster_id
    and (
      public.is_superadmin()
      or consorcio_id = public.current_consorcio_id()
    )
  limit 1;

  if roster_row.id is null then
    raise exception 'No se encontro el registro del padron';
  end if;

  next_code := public.generate_access_code();

  update public.padron_accesos_importados
  set codigo_acceso = next_code,
      codigo_acceso_expires_at = next_expiration,
      updated_at = timezone('utc', now())
  where id = roster_row.id;

  return query
  select roster_row.id, next_code, next_expiration;
end;
$$;

grant execute on function public.refresh_roster_access_code(uuid) to authenticated;
