create or replace function public.activate_access_with_code(
  p_codigo text,
  p_rol_esperado public.app_role,
  p_nombre text default null,
  p_apellido text default null,
  p_telefono text default null,
  p_dni text default null,
  p_unidad_funcional text default null
)
returns table(profile_id uuid, consorcio_id uuid, rol public.app_role, estado public.profile_status)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile_email text;
  roster_row public.padron_accesos_importados%rowtype;
  resolved_responsible_id uuid;
  resolved_guard_post_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  perform public.ensure_profile_for_auth_user(current_user_id, null, p_nombre, p_apellido, p_telefono, p_dni);

  select lower(email)
  into current_profile_email
  from public.profiles
  where id = current_user_id;

  select *
  into roster_row
  from public.padron_accesos_importados
  where codigo_acceso = trim(coalesce(p_codigo, ''))
  limit 1;

  if roster_row.id is null then
    raise exception 'Codigo de acceso invalido';
  end if;

  if lower(coalesce(roster_row.email, '')) <> lower(coalesce(current_profile_email, '')) then
    raise exception 'Ese mail y codigo no corresponden a la misma invitacion';
  end if;

  if roster_row.rol_objetivo <> p_rol_esperado then
    raise exception 'Ese mail y codigo estan asignados al proceso de alta de un perfil %; selecciona la opcion correcta.', roster_row.rol_objetivo::text;
  end if;

  if roster_row.codigo_acceso_expires_at is not null and roster_row.codigo_acceso_expires_at < timezone('utc', now()) then
    raise exception 'El codigo de acceso vencio. Solicita uno nuevo al administrador';
  end if;

  if roster_row.codigo_reclamado_por is not null and roster_row.codigo_reclamado_por <> current_user_id then
    raise exception 'El codigo ya fue utilizado';
  end if;

  if coalesce(roster_row.es_menor, false) and coalesce(roster_row.adulto_responsable_email, '') <> '' then
    select id
    into resolved_responsible_id
    from public.profiles
    where consorcio_id = roster_row.consorcio_id
      and lower(email) = lower(roster_row.adulto_responsable_email)
    limit 1;
  end if;

  if roster_row.rol_objetivo = 'seguridad' and coalesce(trim(roster_row.puesto_vigilancia), '') <> '' then
    select id
    into resolved_guard_post_id
    from public.puntos_vigilancia
    where consorcio_id = roster_row.consorcio_id
      and activo = true
      and lower(nombre) = lower(trim(roster_row.puesto_vigilancia))
    limit 1;
  end if;

  update public.profiles
  set
    consorcio_id = roster_row.consorcio_id,
    rol = roster_row.rol_objetivo,
    estado = 'activo',
    nombre = coalesce(nullif(trim(coalesce(p_nombre, '')), ''), roster_row.nombre, public.profiles.nombre),
    apellido = coalesce(nullif(trim(coalesce(p_apellido, '')), ''), roster_row.apellido, public.profiles.apellido),
    telefono = coalesce(nullif(trim(coalesce(p_telefono, '')), ''), roster_row.telefono, public.profiles.telefono),
    dni = coalesce(nullif(trim(coalesce(p_dni, '')), ''), roster_row.dni, public.profiles.dni),
    unidad_funcional = case
      when roster_row.rol_objetivo = 'residente' then coalesce(nullif(upper(trim(coalesce(p_unidad_funcional, ''))), ''), roster_row.unidad_funcional)
      else null
    end,
    es_menor = coalesce(roster_row.es_menor, false),
    adulto_responsable_email = case when coalesce(roster_row.es_menor, false) then roster_row.adulto_responsable_email else null end,
    adulto_responsable_id = case when coalesce(roster_row.es_menor, false) then resolved_responsible_id else null end,
    updated_at = timezone('utc', now())
  where id = current_user_id;

  update public.padron_accesos_importados
  set
    codigo_reclamado_por = current_user_id,
    codigo_reclamado_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = roster_row.id;

  if resolved_guard_post_id is not null then
    insert into public.punto_vigilancia_guardias (consorcio_id, punto_id, guardia_id)
    values (roster_row.consorcio_id, resolved_guard_post_id, current_user_id)
    on conflict (punto_id, guardia_id) do nothing;
  end if;

  return query
  select current_user_id, roster_row.consorcio_id, roster_row.rol_objetivo, 'activo'::public.profile_status;
end;
$$;
