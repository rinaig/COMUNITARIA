drop function if exists public.complete_admin_registration(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

create function public.complete_admin_registration(
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_dni text,
  p_consorcio_nombre text,
  p_consorcio_direccion text,
  p_cuit text default null,
  p_tipo text default 'edificio',
  p_tipo_otro text default null
)
returns table(
  profile_id uuid,
  consorcio_id uuid,
  codigo_invitacion text,
  trial_expires_at timestamptz,
  trial_unit_limit integer,
  trial_guard_post_limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  generated_code text;
  created_consorcio_id uuid;
  default_price numeric(12,2) := 0;
  trial_deadline timestamptz := timezone('utc', now()) + interval '30 days';
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  perform public.ensure_profile_for_auth_user(current_user_id, null, p_nombre, p_apellido, p_telefono, p_dni);

  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellido), '') = '' then
    raise exception 'Nombre y apellido son obligatorios';
  end if;

  if nullif(trim(coalesce(p_dni, '')), '') is null or trim(p_dni) !~ '^\d{7,8}$' then
    raise exception 'El DNI debe tener 7 u 8 digitos';
  end if;

  if coalesce(trim(p_consorcio_nombre), '') = '' then
    raise exception 'El nombre del consorcio o barrio es obligatorio';
  end if;

  if coalesce(trim(p_consorcio_direccion), '') = '' then
    raise exception 'La direccion es obligatoria';
  end if;

  if trim(coalesce(p_tipo, '')) not in ('edificio', 'barrio_privado', 'country', 'otro') then
    raise exception 'Tipo de consorcio invalido';
  end if;

  if trim(coalesce(p_tipo, '')) = 'otro' and coalesce(trim(p_tipo_otro), '') = '' then
    raise exception 'Debes indicar el tipo cuando eliges Otros';
  end if;

  select coalesce(default_unit_price, 0)
  into default_price
  from public.platform_settings
  where id = true;

  generated_code := public.generate_invitation_code(p_consorcio_nombre);

  insert into public.consorcios (
    nombre,
    direccion,
    cuit,
    tipo,
    tipo_otro,
    codigo_invitacion,
    trial_unit_limit,
    trial_guard_post_limit,
    contacto_email,
    contacto_telefono
  )
  values (
    trim(p_consorcio_nombre),
    trim(p_consorcio_direccion),
    nullif(trim(coalesce(p_cuit, '')), ''),
    trim(p_tipo),
    case when trim(p_tipo) = 'otro' then trim(coalesce(p_tipo_otro, '')) else null end,
    generated_code,
    3,
    1,
    (select email from public.profiles where id = current_user_id),
    nullif(trim(coalesce(p_telefono, '')), '')
  )
  returning id into created_consorcio_id;

  update public.profiles
  set
    consorcio_id = created_consorcio_id,
    rol = 'admin',
    estado = 'activo',
    nombre = trim(coalesce(p_nombre, '')),
    apellido = trim(coalesce(p_apellido, '')),
    telefono = nullif(trim(coalesce(p_telefono, '')), ''),
    dni = nullif(trim(coalesce(p_dni, '')), ''),
    unidad_funcional = null,
    updated_at = timezone('utc', now())
  where id = current_user_id;

  insert into public.consorcio_suscripciones (
    consorcio_id,
    admin_id,
    plan,
    estado,
    monto_mensual,
    precio_lista_por_unidad,
    trial_expires_at,
    proximo_vencimiento,
    observaciones
  )
  values (
    created_consorcio_id,
    current_user_id,
    'base',
    'trial',
    0,
    default_price,
    trial_deadline,
    trial_deadline::date,
    'Alta inicial con prueba de 30 dias, hasta 3 unidades funcionales y 1 puesto de vigilancia.'
  )
  on conflict on constraint consorcio_suscripciones_consorcio_id_key do update
  set
    admin_id = excluded.admin_id,
    estado = excluded.estado,
    precio_lista_por_unidad = excluded.precio_lista_por_unidad,
    trial_expires_at = excluded.trial_expires_at,
    proximo_vencimiento = excluded.proximo_vencimiento,
    observaciones = excluded.observaciones,
    updated_at = timezone('utc', now());

  insert into public.consorcio_channel_integrations (consorcio_id, canal, proveedor, remitente, credenciales, modo_prueba, activo, updated_by)
  values
    (created_consorcio_id, 'email', 'smtp', null, '{}'::jsonb, true, false, current_user_id),
    (created_consorcio_id, 'whatsapp', 'meta', null, '{}'::jsonb, true, false, current_user_id)
  on conflict on constraint consorcio_channel_integrations_consorcio_id_canal_key do nothing;

  return query
  select current_user_id, created_consorcio_id, generated_code, trial_deadline, 3, 1;
end;
$$;

grant execute on function public.complete_admin_registration(text, text, text, text, text, text, text, text, text) to authenticated;