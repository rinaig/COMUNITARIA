create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.generate_invitation_code(seed text)
returns text
language plpgsql
set search_path = public
as $$
declare
  normalized text;
begin
  normalized := upper(regexp_replace(coalesce(seed, 'COM'), '[^A-Za-z0-9]+', '', 'g'));
  normalized := left(normalized || 'CONS', 6);

  return normalized || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
end;
$$;

create or replace function public.ensure_profile_for_auth_user(
  p_user_id uuid default auth.uid(),
  p_email text default null,
  p_nombre text default null,
  p_apellido text default null,
  p_telefono text default null,
  p_dni text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_user auth.users%rowtype;
  resolved_email text;
begin
  if p_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select *
  into auth_user
  from auth.users
  where id = p_user_id;

  resolved_email := lower(
    coalesce(
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(auth_user.email, '')), '')
    )
  );

  insert into public.profiles (id, email, nombre, apellido, telefono, dni)
  values (
    p_user_id,
    coalesce(resolved_email, ''),
    trim(coalesce(p_nombre, auth_user.raw_user_meta_data ->> 'nombre', '')),
    trim(coalesce(p_apellido, auth_user.raw_user_meta_data ->> 'apellido', '')),
    nullif(trim(coalesce(p_telefono, auth_user.raw_user_meta_data ->> 'telefono', '')), ''),
    nullif(trim(coalesce(p_dni, auth_user.raw_user_meta_data ->> 'dni', '')), '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    nombre = case when trim(coalesce(excluded.nombre, '')) <> '' then excluded.nombre else public.profiles.nombre end,
    apellido = case when trim(coalesce(excluded.apellido, '')) <> '' then excluded.apellido else public.profiles.apellido end,
    telefono = coalesce(excluded.telefono, public.profiles.telefono),
    dni = coalesce(excluded.dni, public.profiles.dni),
    updated_at = timezone('utc', now());

  return p_user_id;
end;
$$;

create or replace function public.complete_admin_onboarding(
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_dni text,
  p_consorcio_nombre text,
  p_consorcio_direccion text,
  p_cuit text default null
)
returns table(profile_id uuid, consorcio_id uuid, codigo_invitacion text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  generated_code text;
  created_consorcio_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  perform public.ensure_profile_for_auth_user(current_user_id, null, p_nombre, p_apellido, p_telefono, p_dni);

  if coalesce(trim(p_consorcio_nombre), '') = '' then
    raise exception 'El nombre del consorcio es obligatorio';
  end if;

  generated_code := public.generate_invitation_code(p_consorcio_nombre);

  insert into public.consorcios (nombre, direccion, cuit, codigo_invitacion)
  values (
    trim(p_consorcio_nombre),
    trim(p_consorcio_direccion),
    nullif(trim(coalesce(p_cuit, '')), ''),
    generated_code
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
    updated_at = timezone('utc', now())
  where id = current_user_id;

  insert into public.consorcio_channel_integrations (consorcio_id, canal, proveedor, remitente, credenciales, modo_prueba, activo, updated_by)
  values
    (created_consorcio_id, 'email', 'smtp', null, '{}'::jsonb, true, false, current_user_id),
    (created_consorcio_id, 'whatsapp', 'meta', null, '{}'::jsonb, true, false, current_user_id)
  on conflict on constraint consorcio_channel_integrations_consorcio_id_canal_key do nothing;

  return query
  select current_user_id, created_consorcio_id, generated_code;
end;
$$;

create or replace function public.complete_demo_onboarding(
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_dni text,
  p_consorcio_nombre text,
  p_consorcio_direccion text default 'Modo demo Comunitaria',
  p_cuit text default null
)
returns table(profile_id uuid, consorcio_id uuid, codigo_invitacion text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  generated_code text;
  created_consorcio_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  perform public.ensure_profile_for_auth_user(current_user_id, null, p_nombre, p_apellido, p_telefono, p_dni);

  if coalesce(trim(p_consorcio_nombre), '') = '' then
    raise exception 'El nombre del espacio demo es obligatorio';
  end if;

  generated_code := public.generate_invitation_code(concat(trim(p_consorcio_nombre), '-demo'));

  insert into public.consorcios (
    nombre,
    direccion,
    cuit,
    codigo_invitacion,
    es_demo,
    demo_unit_limit,
    cantidad_unidades
  )
  values (
    trim(p_consorcio_nombre),
    trim(coalesce(nullif(p_consorcio_direccion, ''), 'Modo demo Comunitaria')),
    nullif(trim(coalesce(p_cuit, '')), ''),
    generated_code,
    true,
    3,
    0
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
    updated_at = timezone('utc', now())
  where id = current_user_id;

  insert into public.consorcio_suscripciones (
    consorcio_id,
    admin_id,
    plan,
    estado,
    monto_mensual,
    observaciones
  )
  values (
    created_consorcio_id,
    current_user_id,
    'base',
    'trial',
    0,
    'Tenant demo autogestionado con limite de 3 unidades funcionales.'
  )
  on conflict on constraint consorcio_suscripciones_consorcio_id_key do nothing;

  insert into public.consorcio_channel_integrations (consorcio_id, canal, proveedor, remitente, credenciales, modo_prueba, activo, updated_by)
  values
    (created_consorcio_id, 'email', 'smtp', null, '{}'::jsonb, true, false, current_user_id),
    (created_consorcio_id, 'whatsapp', 'meta', null, '{}'::jsonb, true, false, current_user_id)
  on conflict on constraint consorcio_channel_integrations_consorcio_id_canal_key do nothing;

  return query
  select current_user_id, created_consorcio_id, generated_code;
end;
$$;

create or replace function public.upsert_channel_integration(
  p_canal public.notification_delivery_channel,
  p_proveedor text,
  p_remitente text,
  p_credenciales jsonb default '{}'::jsonb,
  p_modo_prueba boolean default true,
  p_activo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_consorcio uuid := public.current_consorcio_id();
  current_access_role public.app_role := public.current_role();
  integration_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if current_access_role <> 'admin' then
    raise exception 'Solo administracion puede configurar canales';
  end if;

  if current_consorcio is null then
    raise exception 'Tu perfil no esta vinculado a un consorcio';
  end if;

  insert into public.consorcio_channel_integrations (
    consorcio_id,
    canal,
    proveedor,
    remitente,
    credenciales,
    modo_prueba,
    activo,
    updated_by
  )
  values (
    current_consorcio,
    p_canal,
    trim(coalesce(p_proveedor, '')),
    nullif(trim(coalesce(p_remitente, '')), ''),
    coalesce(p_credenciales, '{}'::jsonb),
    coalesce(p_modo_prueba, true),
    coalesce(p_activo, false),
    current_user_id
  )
  on conflict on constraint consorcio_channel_integrations_consorcio_id_canal_key
  do update set
    proveedor = excluded.proveedor,
    remitente = excluded.remitente,
    credenciales = excluded.credenciales,
    modo_prueba = excluded.modo_prueba,
    activo = excluded.activo,
    updated_by = excluded.updated_by,
    updated_at = timezone('utc', now())
  returning id into integration_id;

  return integration_id;
end;
$$;

create or replace function public.upsert_subscription_charge_config(
  p_precio_lista_por_unidad numeric,
  p_modalidad public.subscription_charge_mode,
  p_valor_cobro numeric,
  p_destino_cobro public.subscription_charge_target,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_consorcio uuid := public.current_consorcio_id();
  current_access_role public.app_role := public.current_role();
  subscription_id uuid;
  total_units integer := 0;
  computed_monthly_amount numeric(12,2);
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_superadmin() and current_access_role <> 'admin' then
    raise exception 'No tienes permisos para configurar el esquema comercial';
  end if;

  if current_consorcio is null and not public.is_superadmin() then
    raise exception 'Tu perfil no esta vinculado a un consorcio';
  end if;

  if p_precio_lista_por_unidad is null or p_precio_lista_por_unidad < 0 then
    raise exception 'El precio por unidad debe ser igual o mayor a cero';
  end if;

  if p_valor_cobro is null or p_valor_cobro < 0 then
    raise exception 'El valor de cobro debe ser igual o mayor a cero';
  end if;

  if p_modalidad = 'porcentaje_por_unidad' and p_valor_cobro > 100 then
    raise exception 'El porcentaje de cobro no puede superar 100';
  end if;

  select greatest(
    coalesce(c.cantidad_unidades, 0),
    coalesce((select count(*) from public.unidades_funcionales uf where uf.consorcio_id = c.id), 0)
  )
  into total_units
  from public.consorcios c
  where c.id = current_consorcio;

  computed_monthly_amount := round(coalesce(p_precio_lista_por_unidad, 0) * greatest(coalesce(total_units, 0), 0), 2);

  insert into public.consorcio_suscripciones (
    consorcio_id,
    admin_id,
    monto_mensual,
    precio_lista_por_unidad,
    modalidad_cobro,
    valor_cobro,
    destino_cobro,
    observaciones
  )
  values (
    current_consorcio,
    case when current_access_role = 'admin' then current_user_id else null end,
    computed_monthly_amount,
    p_precio_lista_por_unidad,
    p_modalidad,
    p_valor_cobro,
    p_destino_cobro,
    nullif(trim(coalesce(p_observaciones, '')), '')
  )
  on conflict on constraint consorcio_suscripciones_consorcio_id_key
  do update set
    admin_id = case when current_access_role = 'admin' then current_user_id else public.consorcio_suscripciones.admin_id end,
    monto_mensual = excluded.monto_mensual,
    precio_lista_por_unidad = excluded.precio_lista_por_unidad,
    modalidad_cobro = excluded.modalidad_cobro,
    valor_cobro = excluded.valor_cobro,
    destino_cobro = excluded.destino_cobro,
    observaciones = excluded.observaciones,
    updated_at = timezone('utc', now())
  returning id into subscription_id;

  return subscription_id;
end;
$$;

create or replace function public.generate_platform_unit_charges(
  p_periodo_referencia text,
  p_fecha_vencimiento date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_consorcio uuid := public.current_consorcio_id();
  current_access_role public.app_role := public.current_role();
  active_subscription public.consorcio_suscripciones%rowtype;
  charge_amount numeric(12,2);
  rows_upserted integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if current_access_role <> 'admin' then
    raise exception 'Solo administracion puede generar cargos';
  end if;

  if current_consorcio is null then
    raise exception 'Tu perfil no esta vinculado a un consorcio';
  end if;

  if nullif(trim(coalesce(p_periodo_referencia, '')), '') is null then
    raise exception 'Debes informar un periodo de referencia';
  end if;

  select *
  into active_subscription
  from public.consorcio_suscripciones
  where consorcio_id = current_consorcio;

  if active_subscription.id is null then
    raise exception 'Todavia no hay un esquema comercial configurado para este consorcio';
  end if;

  if active_subscription.modalidad_cobro = 'admin_absorbe' then
    raise exception 'La administracion absorbe el costo. No hay cargos para generar';
  end if;

  if active_subscription.modalidad_cobro = 'monto_fijo_por_unidad' then
    charge_amount := round(coalesce(active_subscription.valor_cobro, 0), 2);
  else
    charge_amount := round(coalesce(active_subscription.precio_lista_por_unidad, 0) * (coalesce(active_subscription.valor_cobro, 0) / 100), 2);
  end if;

  if coalesce(charge_amount, 0) <= 0 then
    raise exception 'El monto por unidad debe ser mayor a cero para generar cargos';
  end if;

  insert into public.cargos_plataforma_unidad (
    consorcio_id,
    suscripcion_id,
    unidad_id,
    periodo_referencia,
    destino_cobro,
    monto,
    estado,
    fecha_vencimiento,
    detalle,
    generado_por
  )
  select
    current_consorcio,
    active_subscription.id,
    unidad.id,
    trim(p_periodo_referencia),
    active_subscription.destino_cobro,
    charge_amount,
    'pendiente',
    p_fecha_vencimiento,
    format(
      'Cargo plataforma %s. Esquema %s aplicado sobre %s.',
      trim(p_periodo_referencia),
      active_subscription.modalidad_cobro,
      unidad.codigo
    ),
    current_user_id
  from public.unidades_funcionales unidad
  where unidad.consorcio_id = current_consorcio
  on conflict on constraint cargos_plataforma_unidad_consorcio_id_unidad_id_periodo_refere_key
  do update set
    suscripcion_id = excluded.suscripcion_id,
    destino_cobro = excluded.destino_cobro,
    monto = excluded.monto,
    estado = case when public.cargos_plataforma_unidad.estado = 'pagado' then public.cargos_plataforma_unidad.estado else 'pendiente' end,
    fecha_vencimiento = excluded.fecha_vencimiento,
    detalle = excluded.detalle,
    generado_por = excluded.generado_por,
    updated_at = timezone('utc', now());

  get diagnostics rows_upserted = row_count;

  return rows_upserted;
end;
$$;

do $$
declare
  routine_signature text;
begin
  for routine_signature in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format('revoke all on function public.%s from public, anon', routine_signature);
  end loop;
end;
$$;

grant execute on function public.current_consorcio_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.current_profile_is_active() to authenticated;

grant execute on function public.complete_admin_onboarding(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.complete_demo_onboarding(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.request_admin_access(text, text, text, text, text) to authenticated;
grant execute on function public.request_resident_access(text, text, text, text, text, text) to authenticated;
grant execute on function public.review_profile_request(uuid, public.profile_status, public.app_role) to authenticated;
grant execute on function public.submit_chat_message(uuid, text) to authenticated;
grant execute on function public.list_pending_dependent_chat_messages() to authenticated;
grant execute on function public.review_dependent_chat_message(uuid, text) to authenticated;
grant execute on function public.create_reservation_request(uuid, date, time, time) to authenticated;
grant execute on function public.review_reservation_request(uuid, text) to authenticated;
grant execute on function public.list_pending_dependent_reservations() to authenticated;
grant execute on function public.review_dependent_reservation_request(uuid, text) to authenticated;
grant execute on function public.cancel_reservation_request(uuid, text) to authenticated;
grant execute on function public.reschedule_reservation_request(uuid, date, time, time) to authenticated;
grant execute on function public.create_claim_ticket(text, text, text, text) to authenticated;
grant execute on function public.update_claim_ticket(uuid, public.ticket_status, text) to authenticated;
grant execute on function public.create_visit_authorization(text, text, date, time, time, uuid, text, text, integer, text, boolean) to authenticated;
grant execute on function public.list_pending_dependent_visits() to authenticated;
grant execute on function public.review_dependent_visit_authorization(uuid, text) to authenticated;
grant execute on function public.validate_visit_entry(text, text, uuid) to authenticated;
grant execute on function public.create_notification(uuid, text, text, text, public.app_role, uuid, jsonb) to authenticated;
grant execute on function public.upsert_channel_integration(public.notification_delivery_channel, text, text, jsonb, boolean, boolean) to authenticated;
grant execute on function public.upsert_subscription_charge_config(numeric, public.subscription_charge_mode, numeric, public.subscription_charge_target, text) to authenticated;
grant execute on function public.enqueue_notification_whatsapp(uuid, uuid, text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.enqueue_test_channel_delivery(public.notification_delivery_channel, text, text, text) to authenticated;
grant execute on function public.notify_profile_via_configured_channels(uuid, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.generate_platform_unit_charges(text, date) to authenticated;
grant execute on function public.update_platform_unit_charge_collection(uuid, date, text, text) to authenticated;
grant execute on function public.mark_platform_unit_charge_paid(uuid, text, text) to authenticated;
grant execute on function public.enqueue_notification_email(uuid, uuid, text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.enqueue_notification_email_to_role(uuid, uuid, public.app_role, text, text, jsonb) to authenticated;