alter table public.consorcios add column if not exists tipo text not null default 'edificio';
alter table public.consorcios add column if not exists tipo_otro text;
alter table public.consorcios add column if not exists trial_unit_limit integer not null default 3;
alter table public.consorcios add column if not exists trial_guard_post_limit integer not null default 1;
alter table public.consorcios add column if not exists contacto_email text;
alter table public.consorcios add column if not exists contacto_telefono text;

alter table public.consorcio_suscripciones add column if not exists trial_expires_at timestamptz;
alter table public.consorcio_suscripciones add column if not exists unit_price_override numeric(12,2);
alter table public.consorcio_suscripciones add column if not exists payment_link_url text;

create table if not exists public.platform_settings (
  id boolean primary key default true,
  support_email text,
  support_phone text,
  instagram_url text,
  x_url text,
  facebook_url text,
  default_unit_price numeric(12,2) not null default 0,
  transfer_alias text,
  transfer_cbu text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (id = true)
);

insert into public.platform_settings (id, support_email, support_phone, default_unit_price)
values (true, 'rnahueliglesias@gmail.com', '', 0)
on conflict (id) do nothing;

create table if not exists public.platform_superusers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.platform_superusers (email, activo)
values ('rnahueliglesias@gmail.com', true)
on conflict (email) do update set activo = excluded.activo;

alter table public.padron_accesos_importados add column if not exists puesto_vigilancia text;
alter table public.padron_accesos_importados add column if not exists codigo_acceso text;
alter table public.padron_accesos_importados add column if not exists codigo_acceso_expires_at timestamptz;
alter table public.padron_accesos_importados add column if not exists codigo_reclamado_at timestamptz;
alter table public.padron_accesos_importados add column if not exists codigo_reclamado_por uuid references auth.users(id) on delete set null;

create unique index if not exists padron_accesos_importados_codigo_acceso_key on public.padron_accesos_importados (codigo_acceso) where codigo_acceso is not null;

create or replace function public.generate_access_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad((floor(random() * 10000000))::int::text, 7, '0');
    exit when not exists (
      select 1 from public.padron_accesos_importados where codigo_acceso = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.ensure_access_code_on_roster()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.codigo_acceso is null or trim(new.codigo_acceso) = '' then
    new.codigo_acceso := public.generate_access_code();
  end if;

  if new.codigo_acceso_expires_at is null or tg_op = 'INSERT' then
    new.codigo_acceso_expires_at := timezone('utc', now()) + interval '48 hours';
  end if;

  if new.email is not null then
    new.email := lower(trim(new.email));
  end if;

  if new.puesto_vigilancia is not null and trim(new.puesto_vigilancia) = '' then
    new.puesto_vigilancia := null;
  end if;

  return new;
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
  is_platform_superuser boolean := false;
begin
  if p_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select * into auth_user from auth.users where id = p_user_id;

  resolved_email := lower(
    coalesce(
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(auth_user.email, '')), '')
    )
  );

  select exists (
    select 1
    from public.platform_superusers
    where lower(email) = lower(coalesce(resolved_email, ''))
      and activo = true
  )
  into is_platform_superuser;

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

  if is_platform_superuser then
    update public.profiles
    set rol = 'superadmin', estado = 'activo', updated_at = timezone('utc', now())
    where id = p_user_id;
  end if;

  return p_user_id;
end;
$$;

create or replace function public.complete_admin_registration(
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
returns table(profile_id uuid, consorcio_id uuid, codigo_invitacion text, trial_expires_at timestamptz)
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

  select coalesce(default_unit_price, 0) into default_price from public.platform_settings where id = true;

  generated_code := public.generate_invitation_code(p_consorcio_nombre);

  insert into public.consorcios (
    nombre, direccion, cuit, tipo, tipo_otro, codigo_invitacion,
    trial_unit_limit, trial_guard_post_limit, contacto_email, contacto_telefono
  )
  values (
    trim(p_consorcio_nombre), trim(p_consorcio_direccion), nullif(trim(coalesce(p_cuit, '')), ''),
    trim(p_tipo), case when trim(p_tipo) = 'otro' then trim(coalesce(p_tipo_otro, '')) else null end,
    generated_code, 3, 1,
    (select email from public.profiles where id = current_user_id),
    nullif(trim(coalesce(p_telefono, '')), '')
  )
  returning id into created_consorcio_id;

  update public.profiles
  set consorcio_id = created_consorcio_id,
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
    consorcio_id, admin_id, plan, estado, monto_mensual, precio_lista_por_unidad, trial_expires_at, proximo_vencimiento, observaciones
  )
  values (
    created_consorcio_id, current_user_id, 'base', 'trial', 0, default_price, trial_deadline, trial_deadline::date,
    'Alta inicial con prueba de 30 dias, hasta 3 unidades funcionales y 1 puesto de vigilancia.'
  )
  on conflict on constraint consorcio_suscripciones_consorcio_id_key do update
  set admin_id = excluded.admin_id,
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

  return query select current_user_id, created_consorcio_id, generated_code, trial_deadline;
end;
$$;

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
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  perform public.ensure_profile_for_auth_user(current_user_id, null, p_nombre, p_apellido, p_telefono, p_dni);

  select lower(email) into current_profile_email from public.profiles where id = current_user_id;

  select * into roster_row from public.padron_accesos_importados where codigo_acceso = trim(coalesce(p_codigo, '')) limit 1;

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
    select id into resolved_responsible_id
    from public.profiles
    where consorcio_id = roster_row.consorcio_id
      and lower(email) = lower(roster_row.adulto_responsable_email)
    limit 1;
  end if;

  update public.profiles
  set consorcio_id = roster_row.consorcio_id,
      rol = roster_row.rol_objetivo,
      estado = 'activo',
      nombre = coalesce(nullif(trim(coalesce(p_nombre, '')), ''), roster_row.nombre, public.profiles.nombre),
      apellido = coalesce(nullif(trim(coalesce(p_apellido, '')), ''), roster_row.apellido, public.profiles.apellido),
      telefono = coalesce(nullif(trim(coalesce(p_telefono, '')), ''), roster_row.telefono, public.profiles.telefono),
      dni = coalesce(nullif(trim(coalesce(p_dni, '')), ''), roster_row.dni, public.profiles.dni),
      unidad_funcional = case when roster_row.rol_objetivo = 'residente' then coalesce(nullif(upper(trim(coalesce(p_unidad_funcional, ''))), ''), roster_row.unidad_funcional) else null end,
      es_menor = coalesce(roster_row.es_menor, false),
      adulto_responsable_email = case when coalesce(roster_row.es_menor, false) then roster_row.adulto_responsable_email else null end,
      adulto_responsable_id = case when coalesce(roster_row.es_menor, false) then resolved_responsible_id else null end,
      updated_at = timezone('utc', now())
  where id = current_user_id;

  update public.padron_accesos_importados
  set codigo_reclamado_por = current_user_id,
      codigo_reclamado_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = roster_row.id;

  return query select current_user_id, roster_row.consorcio_id, roster_row.rol_objetivo, 'activo'::public.profile_status;
end;
$$;

create or replace function public.enforce_demo_unit_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tenant_record public.consorcios%rowtype;
  active_subscription public.consorcio_suscripciones%rowtype;
  next_count integer;
begin
  select * into tenant_record from public.consorcios where id = new.consorcio_id;
  select * into active_subscription from public.consorcio_suscripciones where consorcio_id = new.consorcio_id;

  if tenant_record.id is null
    or active_subscription.id is null
    or active_subscription.estado <> 'trial'
    or (active_subscription.trial_expires_at is not null and active_subscription.trial_expires_at < timezone('utc', now())) then
    return new;
  end if;

  select count(*) into next_count
  from public.unidades_funcionales unidad
  where unidad.consorcio_id = new.consorcio_id
    and (tg_op <> 'UPDATE' or unidad.id <> new.id);

  if next_count + 1 > greatest(coalesce(tenant_record.trial_unit_limit, 3), 0) then
    raise exception 'El periodo de prueba permite cargar hasta % unidades funcionales', greatest(coalesce(tenant_record.trial_unit_limit, 3), 0);
  end if;

  return new;
end;
$$;

create or replace function public.enforce_trial_guard_post_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tenant_record public.consorcios%rowtype;
  active_subscription public.consorcio_suscripciones%rowtype;
  next_count integer;
begin
  select * into tenant_record from public.consorcios where id = new.consorcio_id;
  select * into active_subscription from public.consorcio_suscripciones where consorcio_id = new.consorcio_id;

  if tenant_record.id is null
    or active_subscription.id is null
    or active_subscription.estado <> 'trial'
    or (active_subscription.trial_expires_at is not null and active_subscription.trial_expires_at < timezone('utc', now())) then
    return new;
  end if;

  select count(*) into next_count
  from public.puntos_vigilancia punto
  where punto.consorcio_id = new.consorcio_id
    and (tg_op <> 'UPDATE' or punto.id <> new.id);

  if next_count + 1 > greatest(coalesce(tenant_record.trial_guard_post_limit, 1), 0) then
    raise exception 'El periodo de prueba permite cargar hasta % puesto de vigilancia', greatest(coalesce(tenant_record.trial_guard_post_limit, 1), 0);
  end if;

  return new;
end;
$$;

drop trigger if exists padron_accesos_importados_codigo_trigger on public.padron_accesos_importados;
create trigger padron_accesos_importados_codigo_trigger
before insert or update on public.padron_accesos_importados
for each row execute function public.ensure_access_code_on_roster();

drop trigger if exists enforce_trial_guard_post_limit_trigger on public.puntos_vigilancia;
create trigger enforce_trial_guard_post_limit_trigger
before insert or update on public.puntos_vigilancia
for each row execute function public.enforce_trial_guard_post_limit();

update public.padron_accesos_importados
set codigo_acceso = public.generate_access_code(),
    codigo_acceso_expires_at = coalesce(codigo_acceso_expires_at, timezone('utc', now()) + interval '48 hours')
where codigo_acceso is null or codigo_acceso_expires_at is null;

grant execute on function public.complete_admin_registration(text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.activate_access_with_code(text, public.app_role, text, text, text, text, text) to authenticated;

grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;

alter table public.platform_settings enable row level security;
alter table public.platform_superusers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_settings' and policyname = 'platform_settings_public_read'
  ) then
    create policy "platform_settings_public_read"
    on public.platform_settings
    for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_settings' and policyname = 'platform_settings_superadmin_modify'
  ) then
    create policy "platform_settings_superadmin_modify"
    on public.platform_settings
    for all
    using (public.is_superadmin())
    with check (public.is_superadmin());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_superusers' and policyname = 'platform_superusers_superadmin_only'
  ) then
    create policy "platform_superusers_superadmin_only"
    on public.platform_superusers
    for all
    using (public.is_superadmin())
    with check (public.is_superadmin());
  end if;
end;
$$;