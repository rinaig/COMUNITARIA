create extension if not exists pgcrypto;

create type public.app_role as enum ('superadmin', 'admin', 'residente', 'seguridad');
create type public.profile_status as enum ('pendiente', 'activo', 'rechazado');
create type public.expense_kind as enum ('fijo', 'extraordinario');
create type public.ticket_status as enum ('pendiente', 'en_presupuesto', 'en_reparacion', 'finalizado');
create type public.document_kind as enum ('reglamento', 'estatuto', 'liquidacion', 'acta', 'aviso');

do $$
begin
  alter type public.document_kind add value if not exists 'estatuto';
exception
  when duplicate_object then null;
end;
$$;
create type public.provider_document_kind as enum ('art', 'seguro', 'habilitacion');
create type public.platform_plan as enum ('base', 'barrio', 'premium');
create type public.subscription_status as enum ('trial', 'activa', 'past_due', 'pausada', 'cancelada');
create type public.payment_status as enum ('pagado', 'pendiente', 'vencido', 'fallido');
create type public.subscription_charge_mode as enum ('admin_absorbe', 'monto_fijo_por_unidad', 'porcentaje_por_unidad');
create type public.subscription_charge_target as enum ('propietario', 'inquilino', 'todos');
create type public.notification_delivery_channel as enum ('email');
create type public.notification_delivery_status as enum ('pendiente', 'enviado', 'fallido', 'omitido');

do $$
begin
  alter type public.notification_delivery_channel add value if not exists 'whatsapp';
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.consorcios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text not null,
  cuit text,
  codigo_invitacion text not null unique,
  logo_url text,
  cantidad_unidades integer not null default 0,
  es_demo boolean not null default false,
  demo_unit_limit integer not null default 3,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.consorcios add column if not exists es_demo boolean not null default false;
alter table public.consorcios add column if not exists demo_unit_limit integer not null default 3;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  consorcio_id uuid references public.consorcios(id) on delete set null,
  rol public.app_role not null default 'residente',
  nombre text not null default '',
  apellido text not null default '',
  email text not null unique,
  telefono text,
  dni text,
  unidad_funcional text,
  es_menor boolean not null default false,
  adulto_responsable_id uuid,
  adulto_responsable_email text,
  estado public.profile_status not null default 'pendiente',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists es_menor boolean not null default false;
alter table public.profiles add column if not exists adulto_responsable_id uuid;
alter table public.profiles add column if not exists adulto_responsable_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_adulto_responsable_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_adulto_responsable_id_fkey
      foreign key (adulto_responsable_id)
      references public.profiles(id)
      on delete set null;
  end if;
end;
$$;

create table if not exists public.unidades_funcionales (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  codigo text not null,
  piso text,
  departamento text,
  propietario_nombre text,
  propietario_email text,
  coeficiente numeric(10,4),
  max_reservas_mensuales integer not null default 2,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, codigo)
);

create table if not exists public.consorcio_channel_integrations (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  canal public.notification_delivery_channel not null,
  proveedor text not null default '',
  remitente text,
  credenciales jsonb not null default '{}'::jsonb,
  modo_prueba boolean not null default true,
  activo boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, canal)
);

create table if not exists public.consorcio_suscripciones (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null unique references public.consorcios(id) on delete cascade,
  admin_id uuid references public.profiles(id) on delete set null,
  plan public.platform_plan not null default 'base',
  estado public.subscription_status not null default 'trial',
  monto_mensual numeric(12,2) not null default 0,
  precio_lista_por_unidad numeric(12,2) not null default 0,
  modalidad_cobro public.subscription_charge_mode not null default 'admin_absorbe',
  valor_cobro numeric(12,2) not null default 0,
  destino_cobro public.subscription_charge_target not null default 'propietario',
  proximo_vencimiento date,
  ultimo_pago_at timestamptz,
  observaciones text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.consorcio_suscripciones add column if not exists precio_lista_por_unidad numeric(12,2) not null default 0;
alter table public.consorcio_suscripciones add column if not exists modalidad_cobro public.subscription_charge_mode not null default 'admin_absorbe';
alter table public.consorcio_suscripciones add column if not exists valor_cobro numeric(12,2) not null default 0;
alter table public.consorcio_suscripciones add column if not exists destino_cobro public.subscription_charge_target not null default 'propietario';

create table if not exists public.admin_payment_events (
  id uuid primary key default gen_random_uuid(),
  suscripcion_id uuid not null references public.consorcio_suscripciones(id) on delete cascade,
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  registrado_por uuid references public.profiles(id) on delete set null,
  importe numeric(12,2) not null check (importe > 0),
  estado public.payment_status not null default 'pendiente',
  metodo text,
  referencia text,
  fecha_pago timestamptz,
  fecha_vencimiento date,
  nota text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cargos_plataforma_unidad (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  suscripcion_id uuid not null references public.consorcio_suscripciones(id) on delete cascade,
  unidad_id uuid not null references public.unidades_funcionales(id) on delete cascade,
  periodo_referencia text not null,
  destino_cobro public.subscription_charge_target not null default 'propietario',
  monto numeric(12,2) not null default 0,
  estado public.payment_status not null default 'pendiente',
  fecha_vencimiento date,
  enlace_pago text,
  pagado_at timestamptz,
  referencia_pago text,
  comprobante_url text,
  detalle text,
  generado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, unidad_id, periodo_referencia)
);

alter table public.cargos_plataforma_unidad add column if not exists enlace_pago text;
alter table public.cargos_plataforma_unidad add column if not exists comprobante_url text;

create table if not exists public.padron_accesos_importados (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  rol_objetivo public.app_role not null,
  nombre text not null,
  apellido text not null,
  email text not null,
  telefono text,
  dni text,
  unidad_funcional text,
  es_menor boolean not null default false,
  adulto_responsable_email text,
  origen text not null default 'csv',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, rol_objetivo, email)
);

alter table public.padron_accesos_importados add column if not exists es_menor boolean not null default false;
alter table public.padron_accesos_importados add column if not exists adulto_responsable_email text;

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid references public.consorcios(id) on delete cascade,
  destinatario_id uuid references public.profiles(id) on delete cascade,
  rol_destino public.app_role,
  categoria text not null,
  titulo text not null,
  detalle text not null,
  metadata jsonb not null default '{}'::jsonb,
  leida_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (destinatario_id is not null or rol_destino is not null)
);

create table if not exists public.notificacion_salidas (
  id uuid primary key default gen_random_uuid(),
  notificacion_id uuid not null references public.notificaciones(id) on delete cascade,
  consorcio_id uuid references public.consorcios(id) on delete cascade,
  canal public.notification_delivery_channel not null default 'email',
  destinatario_id uuid references public.profiles(id) on delete set null,
  destinatario_email text,
  destinatario_ref text,
  asunto text not null,
  cuerpo text not null,
  estado public.notification_delivery_status not null default 'pendiente',
  proveedor text,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.notificacion_salidas alter column destinatario_email drop not null;
alter table public.notificacion_salidas add column if not exists destinatario_ref text;

create table if not exists public.chat_topics (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  titulo text not null,
  descripcion text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, titulo)
);

create table if not exists public.chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  topic_id uuid not null references public.chat_topics(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  cuerpo text not null,
  estado text not null default 'publicado',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (length(trim(cuerpo)) > 0)
);

alter table public.chat_mensajes add column if not exists estado text not null default 'publicado';
alter table public.chat_mensajes add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.chat_mensajes add column if not exists reviewed_at timestamptz;

create index if not exists chat_topics_consorcio_idx on public.chat_topics (consorcio_id, activo, orden, updated_at desc);
create index if not exists chat_mensajes_topic_idx on public.chat_mensajes (topic_id, created_at desc);

create table if not exists public.categorias_gastos (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, nombre)
);

create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  categoria_id uuid not null references public.categorias_gastos(id) on delete restrict,
  uploader_id uuid references public.profiles(id) on delete set null,
  tipo public.expense_kind not null default 'fijo',
  descripcion text not null,
  monto numeric(12,2) not null check (monto > 0),
  fecha_gasto date not null,
  comprobante_url text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.documentos_consorcio (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  uploader_id uuid references public.profiles(id) on delete set null,
  tipo public.document_kind not null,
  titulo text not null,
  archivo_url text not null,
  periodo_referencia text,
  enlace_pago text,
  visible_para_residentes boolean not null default true,
  publicado_at timestamptz not null default timezone('utc', now())
);

alter table public.documentos_consorcio add column if not exists periodo_referencia text;
alter table public.documentos_consorcio add column if not exists enlace_pago text;

create table if not exists public.anuncios (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  titulo text not null,
  contenido text not null,
  prioridad smallint not null default 0,
  publicado_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  nombre text not null,
  capacidad integer,
  hora_apertura time not null,
  hora_cierre time not null,
  max_reservas_mensuales integer not null default 2 check (max_reservas_mensuales > 0),
  anticipacion_min_horas integer not null default 0 check (anticipacion_min_horas >= 0),
  duracion_max_horas integer not null default 4 check (duracion_max_horas > 0),
  requiere_aprobacion_manual boolean not null default false,
  requiere_aceptacion_reglamento boolean not null default true,
  activo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, nombre)
);

alter table public.amenities add column if not exists max_reservas_mensuales integer not null default 2;
alter table public.amenities add column if not exists anticipacion_min_horas integer not null default 0;
alter table public.amenities add column if not exists duracion_max_horas integer not null default 4;
alter table public.amenities add column if not exists requiere_aprobacion_manual boolean not null default false;

create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  unidad_id uuid not null references public.unidades_funcionales(id) on delete cascade,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  estado text not null default 'confirmada',
  reglas_aceptadas boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  check (hora_fin > hora_inicio)
);

create index if not exists reservas_lookup_idx on public.reservas (consorcio_id, amenity_id, fecha, hora_inicio, hora_fin);

create table if not exists public.reclamos (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  creador_id uuid not null references public.profiles(id) on delete cascade,
  unidad_id uuid references public.unidades_funcionales(id) on delete set null,
  titulo text not null,
  categoria text,
  descripcion text not null,
  foto_url text,
  estado public.ticket_status not null default 'pendiente',
  visible_para_todo_consorcio boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reclamo_eventos (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  reclamo_id uuid not null references public.reclamos(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  estado public.ticket_status,
  comentario text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.autorizaciones_visitas (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  residente_id uuid not null references public.profiles(id) on delete cascade,
  unidad_id uuid references public.unidades_funcionales(id) on delete set null,
  visitante_nombre text not null,
  visitante_dni text not null,
  fecha_visita date not null,
  hora_desde time,
  hora_hasta time,
  qr_token text not null unique,
  estado text not null default 'vigente',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  nombre text not null,
  empresa text,
  rubro text,
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.proveedor_documento_requisitos (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  nombre text not null,
  codigo text not null,
  requerido boolean not null default true,
  dias_alerta integer not null default 30 check (dias_alerta >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, codigo),
  unique (consorcio_id, nombre)
);

create table if not exists public.proveedor_documentos (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  tipo public.provider_document_kind not null,
  requisito_id uuid references public.proveedor_documento_requisitos(id) on delete set null,
  nombre_documento text,
  archivo_url text not null,
  vence_el date not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.proveedor_documentos add column if not exists requisito_id uuid references public.proveedor_documento_requisitos(id) on delete set null;
alter table public.proveedor_documentos add column if not exists nombre_documento text;

create index if not exists proveedor_documentos_requisito_idx on public.proveedor_documentos (consorcio_id, requisito_id, proveedor_id);

create table if not exists public.ingresos_guardia (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  autorizacion_id uuid references public.autorizaciones_visitas(id) on delete set null,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  guardia_id uuid references public.profiles(id) on delete set null,
  descripcion text not null,
  ingreso_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.puntos_vigilancia (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  ubicacion text,
  activo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consorcio_id, nombre)
);

create table if not exists public.punto_vigilancia_guardias (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  punto_id uuid not null references public.puntos_vigilancia(id) on delete cascade,
  guardia_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (punto_id, guardia_id)
);

alter table public.autorizaciones_visitas add column if not exists punto_vigilancia_id uuid references public.puntos_vigilancia(id) on delete set null;
alter table public.autorizaciones_visitas add column if not exists telefono_contacto text;
alter table public.autorizaciones_visitas add column if not exists patente_vehiculo text;
alter table public.autorizaciones_visitas add column if not exists cantidad_invitados integer not null default 1 check (cantidad_invitados >= 1);
alter table public.autorizaciones_visitas add column if not exists observaciones text;
alter table public.autorizaciones_visitas add column if not exists compartir_whatsapp boolean not null default false;

alter table public.ingresos_guardia add column if not exists punto_vigilancia_id uuid references public.puntos_vigilancia(id) on delete set null;

create index if not exists puntos_vigilancia_consorcio_idx on public.puntos_vigilancia (consorcio_id, activo, nombre);
create index if not exists punto_vigilancia_guardias_consorcio_idx on public.punto_vigilancia_guardias (consorcio_id, guardia_id, punto_id);
create index if not exists visitas_punto_vigilancia_idx on public.autorizaciones_visitas (consorcio_id, punto_vigilancia_id, fecha_visita);
create index if not exists ingresos_guardia_punto_idx on public.ingresos_guardia (consorcio_id, punto_vigilancia_id, ingreso_at desc);

create or replace function public.current_consorcio_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select consorcio_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'superadmin', false);
$$;

create or replace function public.current_profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and estado = 'activo'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists proveedor_documento_requisitos_touch_updated_at on public.proveedor_documento_requisitos;
create trigger proveedor_documento_requisitos_touch_updated_at
before update on public.proveedor_documento_requisitos
for each row
execute function public.touch_updated_at();

drop trigger if exists puntos_vigilancia_touch_updated_at on public.puntos_vigilancia;
create trigger puntos_vigilancia_touch_updated_at
before update on public.puntos_vigilancia
for each row
execute function public.touch_updated_at();

drop trigger if exists chat_topics_touch_updated_at on public.chat_topics;
create trigger chat_topics_touch_updated_at
before update on public.chat_topics
for each row
execute function public.touch_updated_at();

create or replace function public.bump_chat_topic_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.chat_topics
  set updated_at = timezone('utc', now())
  where id = new.topic_id;

  return new;
end;
$$;

create or replace function public.submit_chat_message(
  p_topic_id uuid,
  p_cuerpo text
)
returns table(message_id uuid, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_profile public.profiles%rowtype;
  topic_record public.chat_topics%rowtype;
  next_status text := 'publicado';
  created_message_id uuid;
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if coalesce(trim(p_cuerpo), '') = '' then
    raise exception 'El mensaje no puede estar vacio';
  end if;

  select *
  into actor_profile
  from public.profiles
  where id = current_user_id;

  if actor_profile.id is null or actor_profile.consorcio_id is null or actor_profile.estado <> 'activo' then
    raise exception 'Tu perfil no esta habilitado para usar el chat';
  end if;

  select *
  into topic_record
  from public.chat_topics
  where id = p_topic_id
    and consorcio_id = actor_profile.consorcio_id
    and (activo = true or actor_profile.rol = 'admin')
  limit 1;

  if topic_record.id is null then
    raise exception 'No se encontro el tema indicado';
  end if;

  if coalesce(actor_profile.es_menor, false) then
    if actor_profile.adulto_responsable_id is null then
      raise exception 'El menor necesita un adulto responsable vinculado para publicar en el chat';
    end if;

    next_status := 'pendiente_adulto';
  end if;

  insert into public.chat_mensajes (
    consorcio_id,
    topic_id,
    autor_id,
    cuerpo,
    estado
  )
  values (
    actor_profile.consorcio_id,
    p_topic_id,
    current_user_id,
    trim(p_cuerpo),
    next_status
  )
  returning id into created_message_id;

  if next_status = 'pendiente_adulto' then
    created_notification_id := public.create_notification(
      actor_profile.consorcio_id,
      'dependientes',
      'Mensaje de chat pendiente de aprobacion',
      concat(actor_profile.nombre, ' ', actor_profile.apellido, ' envio un mensaje en ', topic_record.titulo),
      null,
      actor_profile.adulto_responsable_id,
      jsonb_build_object('chat_message_id', created_message_id, 'topic_id', p_topic_id)
    );

    perform public.notify_profile_via_configured_channels(
      created_notification_id,
      actor_profile.consorcio_id,
      actor_profile.adulto_responsable_id,
      'Mensaje de chat pendiente de aprobacion',
      concat(actor_profile.nombre, ' ', actor_profile.apellido, ' envio un mensaje en ', topic_record.titulo),
      jsonb_build_object('chat_message_id', created_message_id, 'topic_id', p_topic_id, 'tipo', 'dependent_chat_submission')
    );
  end if;

  return query select created_message_id, next_status;
end;
$$;

create or replace function public.list_pending_dependent_chat_messages()
returns table(
  message_id uuid,
  menor_id uuid,
  menor_nombre text,
  menor_apellido text,
  topic_id uuid,
  topic_titulo text,
  cuerpo text,
  estado text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    m.id,
    p.id,
    p.nombre,
    p.apellido,
    m.topic_id,
    t.titulo,
    m.cuerpo,
    m.estado,
    m.created_at
  from public.chat_mensajes m
  join public.profiles p on p.id = m.autor_id
  join public.chat_topics t on t.id = m.topic_id
  where p.adulto_responsable_id = auth.uid()
    and coalesce(p.es_menor, false) = true
    and m.estado = 'pendiente_adulto'
  order by m.created_at asc;
$$;

create or replace function public.review_dependent_chat_message(
  p_message_id uuid,
  p_estado text
)
returns table(message_id uuid, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  message_record public.chat_mensajes%rowtype;
  child_profile public.profiles%rowtype;
  topic_record public.chat_topics%rowtype;
  next_status text;
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select m.*
  into message_record
  from public.chat_mensajes m
  join public.profiles p on p.id = m.autor_id
  where m.id = p_message_id
    and p.adulto_responsable_id = current_user_id
    and coalesce(p.es_menor, false) = true
  limit 1;

  if message_record.id is null then
    raise exception 'No existe un mensaje pendiente de dependiente para este adulto';
  end if;

  if message_record.estado <> 'pendiente_adulto' then
    raise exception 'El mensaje ya no requiere aprobacion adulta';
  end if;

  select *
  into child_profile
  from public.profiles
  where id = message_record.autor_id;

  select *
  into topic_record
  from public.chat_topics
  where id = message_record.topic_id;

  if lower(trim(coalesce(p_estado, ''))) in ('aprobada', 'aprobar', 'confirmada') then
    next_status := 'publicado';
  elsif lower(trim(coalesce(p_estado, ''))) in ('rechazada', 'rechazar', 'cancelada') then
    next_status := 'rechazado';
  else
    raise exception 'Estado invalido para revision adulta del chat';
  end if;

  update public.chat_mensajes
  set
    estado = next_status,
    reviewed_by = current_user_id,
    reviewed_at = timezone('utc', now())
  where id = message_record.id;

  created_notification_id := public.create_notification(
    child_profile.consorcio_id,
    'dependientes',
    case when next_status = 'publicado' then 'Mensaje de chat aprobado' else 'Mensaje de chat rechazado' end,
    case when next_status = 'publicado' then concat('Tu mensaje en ', topic_record.titulo, ' fue aprobado.') else concat('Tu mensaje en ', topic_record.titulo, ' no fue aprobado.') end,
    null,
    child_profile.id,
    jsonb_build_object('chat_message_id', message_record.id, 'estado', next_status)
  );

  perform public.notify_profile_via_configured_channels(
    created_notification_id,
    child_profile.consorcio_id,
    child_profile.id,
    case when next_status = 'publicado' then 'Mensaje de chat aprobado' else 'Mensaje de chat rechazado' end,
    case when next_status = 'publicado' then concat('Tu mensaje en ', topic_record.titulo, ' fue aprobado.') else concat('Tu mensaje en ', topic_record.titulo, ' no fue aprobado.') end,
    jsonb_build_object('chat_message_id', message_record.id, 'estado', next_status, 'tipo', 'dependent_chat_review')
  );

  return query select message_record.id, next_status;
end;
$$;

drop trigger if exists chat_mensajes_bump_topic_updated_at on public.chat_mensajes;
create trigger chat_mensajes_bump_topic_updated_at
after insert on public.chat_mensajes
for each row
execute function public.bump_chat_topic_updated_at();

insert into public.proveedor_documento_requisitos (consorcio_id, nombre, codigo, requerido, dias_alerta)
select c.id, seed.nombre, seed.codigo, seed.requerido, seed.dias_alerta
from public.consorcios c
cross join (
  values
    ('ART o cobertura de riesgos del trabajo', 'art', true, 30),
    ('Seguro de vida o accidentes personales', 'seguro', true, 30),
    ('Habilitacion o matricula', 'habilitacion', false, 15)
) as seed(nombre, codigo, requerido, dias_alerta)
where not exists (
  select 1
  from public.proveedor_documento_requisitos req
  where req.consorcio_id = c.id
    and req.codigo = seed.codigo
);

create or replace function public.generate_invitation_code(seed text)
returns text
language plpgsql
as $$
declare
  normalized text;
begin
  normalized := upper(regexp_replace(coalesce(seed, 'COM'), '[^A-Za-z0-9]+', '', 'g'));
  normalized := left(normalized || 'CONS', 6);

  return normalized || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre, apellido, telefono, dni)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    nullif(new.raw_user_meta_data ->> 'telefono', ''),
    nullif(new.raw_user_meta_data ->> 'dni', '')
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
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
  on conflict (consorcio_id, canal) do nothing;

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
  on conflict (consorcio_id) do nothing;

  insert into public.consorcio_channel_integrations (consorcio_id, canal, proveedor, remitente, credenciales, modo_prueba, activo, updated_by)
  values
    (created_consorcio_id, 'email', 'smtp', null, '{}'::jsonb, true, false, current_user_id),
    (created_consorcio_id, 'whatsapp', 'meta', null, '{}'::jsonb, true, false, current_user_id)
  on conflict (consorcio_id, canal) do nothing;

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
  on conflict (consorcio_id, canal)
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

create or replace function public.enforce_demo_unit_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tenant_record public.consorcios%rowtype;
  next_count integer;
begin
  select *
  into tenant_record
  from public.consorcios
  where id = new.consorcio_id;

  if tenant_record.id is null or coalesce(tenant_record.es_demo, false) = false then
    return new;
  end if;

  select count(*)
  into next_count
  from public.unidades_funcionales unidad
  where unidad.consorcio_id = new.consorcio_id
    and (tg_op <> 'UPDATE' or unidad.id <> new.id);

  if next_count + 1 > greatest(coalesce(tenant_record.demo_unit_limit, 3), 0) then
    raise exception 'El modo demo permite cargar hasta % unidades funcionales', greatest(coalesce(tenant_record.demo_unit_limit, 3), 0);
  end if;

  return new;
end;
$$;

create or replace function public.request_resident_access(
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_dni text,
  p_unidad_funcional text,
  p_codigo_invitacion text
)
returns table(profile_id uuid, consorcio_id uuid, estado public.profile_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_consorcio_id uuid;
  current_profile_email text;
  imported_row public.padron_accesos_importados%rowtype;
  resolved_responsible_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select id
  into target_consorcio_id
  from public.consorcios
  where codigo_invitacion = upper(trim(p_codigo_invitacion))
  limit 1;

  if target_consorcio_id is null then
    raise exception 'Codigo de consorcio invalido';
  end if;

  select email
  into current_profile_email
  from public.profiles
  where id = current_user_id;

  select *
  into imported_row
  from public.padron_accesos_importados
  where consorcio_id = target_consorcio_id
    and rol_objetivo = 'residente'
    and lower(email) = lower(coalesce(current_profile_email, ''))
  limit 1;

  if coalesce(imported_row.adulto_responsable_email, '') <> '' then
    select id
    into resolved_responsible_id
    from public.profiles
    where consorcio_id = target_consorcio_id
      and lower(email) = lower(imported_row.adulto_responsable_email)
      and id <> current_user_id
    limit 1;
  end if;

  update public.profiles
  set
    consorcio_id = target_consorcio_id,
    rol = 'residente',
    estado = 'pendiente',
    nombre = coalesce(nullif(trim(coalesce(p_nombre, '')), ''), imported_row.nombre, ''),
    apellido = coalesce(nullif(trim(coalesce(p_apellido, '')), ''), imported_row.apellido, ''),
    telefono = coalesce(nullif(trim(coalesce(p_telefono, '')), ''), imported_row.telefono),
    dni = coalesce(nullif(trim(coalesce(p_dni, '')), ''), imported_row.dni),
    unidad_funcional = coalesce(nullif(upper(trim(coalesce(p_unidad_funcional, ''))), ''), imported_row.unidad_funcional),
    es_menor = coalesce(imported_row.es_menor, false),
    adulto_responsable_email = case when coalesce(imported_row.es_menor, false) then imported_row.adulto_responsable_email else null end,
    adulto_responsable_id = case when coalesce(imported_row.es_menor, false) then resolved_responsible_id else null end,
    updated_at = timezone('utc', now())
  where id = current_user_id;

  if coalesce(imported_row.es_menor, false) = false and current_profile_email is not null then
    update public.profiles
    set adulto_responsable_id = current_user_id,
        updated_at = timezone('utc', now())
    where consorcio_id = target_consorcio_id
      and coalesce(es_menor, false) = true
      and lower(coalesce(adulto_responsable_email, '')) = lower(current_profile_email)
      and coalesce(adulto_responsable_id, current_user_id) <> current_user_id;
  end if;

  perform public.create_notification(
    target_consorcio_id,
    'acceso',
    'Nueva solicitud de residente',
    concat('Se recibio una solicitud de acceso para ', coalesce(imported_row.nombre, trim(coalesce(p_nombre, ''))), ' ', coalesce(imported_row.apellido, trim(coalesce(p_apellido, '')))),
    'admin',
    null,
    jsonb_build_object('profile_id', current_user_id)
  );

  return query
  select current_user_id, target_consorcio_id, 'pendiente'::public.profile_status;
end;
$$;

create or replace function public.request_admin_access(
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_dni text,
  p_codigo_invitacion text
)
returns table(profile_id uuid, consorcio_id uuid, estado public.profile_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_consorcio_id uuid;
  current_profile_email text;
  imported_row public.padron_accesos_importados%rowtype;
  created_notification_id uuid;
  requester_name text;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select id
  into target_consorcio_id
  from public.consorcios
  where codigo_invitacion = upper(trim(p_codigo_invitacion))
  limit 1;

  if target_consorcio_id is null then
    raise exception 'Codigo de consorcio invalido';
  end if;

  select email
  into current_profile_email
  from public.profiles
  where id = current_user_id;

  select *
  into imported_row
  from public.padron_accesos_importados
  where consorcio_id = target_consorcio_id
    and rol_objetivo = 'admin'
    and lower(email) = lower(coalesce(current_profile_email, ''))
  limit 1;

  if imported_row.id is null then
    raise exception 'Tu email no figura en el padron importado de administradores para este consorcio';
  end if;

  update public.profiles
  set
    consorcio_id = target_consorcio_id,
    rol = 'admin',
    estado = 'pendiente',
    nombre = coalesce(nullif(trim(coalesce(p_nombre, '')), ''), imported_row.nombre, ''),
    apellido = coalesce(nullif(trim(coalesce(p_apellido, '')), ''), imported_row.apellido, ''),
    telefono = coalesce(nullif(trim(coalesce(p_telefono, '')), ''), imported_row.telefono),
    dni = coalesce(nullif(trim(coalesce(p_dni, '')), ''), imported_row.dni),
    unidad_funcional = null,
    updated_at = timezone('utc', now())
  where id = current_user_id;

  requester_name := trim(concat(coalesce(imported_row.nombre, trim(coalesce(p_nombre, ''))), ' ', coalesce(imported_row.apellido, trim(coalesce(p_apellido, '')))));

  created_notification_id := public.create_notification(
    target_consorcio_id,
    'acceso',
    'Nueva solicitud de administrador',
    concat('Se recibio una solicitud administrativa para ', requester_name),
    'admin',
    null,
    jsonb_build_object('profile_id', current_user_id, 'tipo', 'admin')
  );

  perform public.enqueue_notification_email_to_role(
    created_notification_id,
    target_consorcio_id,
    'admin',
    'Nueva solicitud administrativa en Comunitaria',
    concat('Se registro una nueva solicitud administrativa para ', requester_name, '. Ingresa al panel de aprobaciones para revisarla.'),
    jsonb_build_object('tipo', 'admin_request')
  );

  return query
  select current_user_id, target_consorcio_id, 'pendiente'::public.profile_status;
end;
$$;

create or replace function public.review_profile_request(
  p_profile_id uuid,
  p_estado public.profile_status,
  p_rol public.app_role default 'residente'
)
returns table(profile_id uuid, estado public.profile_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  acting_role public.app_role;
  acting_consorcio_id uuid;
  target_consorcio_id uuid;
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if p_estado not in ('activo', 'rechazado') then
    raise exception 'Estado invalido para revision';
  end if;

  select rol, consorcio_id
  into acting_role, acting_consorcio_id
  from public.profiles
  where id = current_user_id;

  if acting_role not in ('admin', 'superadmin') then
    raise exception 'No autorizado para revisar perfiles';
  end if;

  select consorcio_id
  into target_consorcio_id
  from public.profiles
  where id = p_profile_id;

  if target_consorcio_id is null then
    raise exception 'Perfil no encontrado';
  end if;

  if acting_role <> 'superadmin' and target_consorcio_id <> acting_consorcio_id then
    raise exception 'No puedes revisar perfiles de otro consorcio';
  end if;

  update public.profiles
  set
    estado = p_estado,
    rol = case when p_estado = 'activo' then p_rol else rol end,
    updated_at = timezone('utc', now())
  where id = p_profile_id;

  created_notification_id := public.create_notification(
    target_consorcio_id,
    'acceso',
    case when p_estado = 'activo' then 'Acceso aprobado' else 'Solicitud rechazada' end,
    case when p_estado = 'activo' then 'Tu acceso al consorcio fue aprobado por administracion.' else 'Tu solicitud fue rechazada por administracion.' end,
    null,
    p_profile_id,
    jsonb_build_object('estado', p_estado, 'rol', p_rol)
  );

  perform public.notify_profile_via_configured_channels(
    created_notification_id,
    target_consorcio_id,
    p_profile_id,
    case when p_estado = 'activo' then 'Tu acceso fue aprobado' else 'Tu solicitud fue rechazada' end,
    case when p_estado = 'activo' then concat('Tu acceso como ', p_rol::text, ' fue aprobado en Comunitaria. Ya puedes ingresar al portal correspondiente.') else 'Tu solicitud de acceso fue rechazada por la administracion del consorcio.' end,
    jsonb_build_object('estado', p_estado, 'rol', p_rol, 'tipo', 'approval_result')
  );

  return query
  select p_profile_id, p_estado;
end;
$$;

create or replace function public.assert_reservation_rules(
  p_consorcio_id uuid,
  p_unit_id uuid,
  p_amenity_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time,
  p_ignore_reservation_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  unit_max_monthly integer;
  amenity_max_monthly integer;
  effective_max_monthly integer;
  amenity_opening time;
  amenity_closing time;
  min_notice_hours integer;
  max_duration_hours integer;
  month_reservations integer;
  conflicting_reservation_id uuid;
begin
  if p_hora_fin <= p_hora_inicio then
    raise exception 'La hora de fin debe ser mayor a la hora de inicio';
  end if;

  select max_reservas_mensuales
  into unit_max_monthly
  from public.unidades_funcionales
  where id = p_unit_id
    and consorcio_id = p_consorcio_id
  limit 1;

  if unit_max_monthly is null then
    raise exception 'No existe la unidad funcional asociada a la reserva';
  end if;

  select hora_apertura, hora_cierre, max_reservas_mensuales, anticipacion_min_horas, duracion_max_horas
  into amenity_opening, amenity_closing, amenity_max_monthly, min_notice_hours, max_duration_hours
  from public.amenities
  where id = p_amenity_id
    and consorcio_id = p_consorcio_id
    and activo = true
  limit 1;

  if amenity_opening is null then
    raise exception 'El amenity seleccionado no esta disponible';
  end if;

  if p_hora_inicio < amenity_opening or p_hora_fin > amenity_closing then
    raise exception 'La reserva debe estar dentro del horario operativo del amenity';
  end if;

  if (extract(epoch from (p_hora_fin - p_hora_inicio)) / 3600.0) > coalesce(max_duration_hours, 4) then
    raise exception 'La reserva supera la duracion maxima permitida para este amenity';
  end if;

  if (p_fecha + p_hora_inicio) < (timezone('utc', now()) + make_interval(hours => coalesce(min_notice_hours, 0))) then
    raise exception 'La reserva no cumple con la anticipacion minima requerida';
  end if;

  effective_max_monthly := case
    when unit_max_monthly is null and amenity_max_monthly is null then 2
    when unit_max_monthly is null then amenity_max_monthly
    when amenity_max_monthly is null then unit_max_monthly
    else least(unit_max_monthly, amenity_max_monthly)
  end;

  select r.id
  into conflicting_reservation_id
  from public.reservas r
  where r.consorcio_id = p_consorcio_id
    and r.amenity_id = p_amenity_id
    and r.fecha = p_fecha
    and r.estado <> 'cancelada'
    and (p_ignore_reservation_id is null or r.id <> p_ignore_reservation_id)
    and r.hora_inicio < p_hora_fin
    and p_hora_inicio < r.hora_fin
  limit 1;

  if conflicting_reservation_id is not null then
    raise exception 'Ya existe una reserva en ese horario';
  end if;

  select count(*)
  into month_reservations
  from public.reservas
  where unidad_id = p_unit_id
    and amenity_id = p_amenity_id
    and date_trunc('month', fecha::timestamp) = date_trunc('month', p_fecha::timestamp)
    and estado <> 'cancelada'
    and (p_ignore_reservation_id is null or id <> p_ignore_reservation_id);

  if month_reservations >= coalesce(effective_max_monthly, 2) then
    raise exception 'La unidad alcanzo el maximo mensual de reservas para este espacio';
  end if;
end;
$$;

create or replace function public.create_reservation_request(
  p_amenity_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time
)
returns table(reservation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_consorcio_id uuid;
  profile_unit_code text;
  profile_status public.profile_status;
  profile_is_minor boolean := false;
  responsible_adult_id uuid;
  responsible_adult_email text;
  resolved_unit_id uuid;
  requires_manual_approval boolean := false;
  reservation_status text := 'confirmada';
  created_reservation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select consorcio_id, unidad_funcional, estado, coalesce(es_menor, false), adulto_responsable_id, adulto_responsable_email
  into profile_consorcio_id, profile_unit_code, profile_status, profile_is_minor, responsible_adult_id, responsible_adult_email
  from public.profiles
  where id = current_user_id;

  if profile_status <> 'activo' then
    raise exception 'Tu perfil todavia no esta activo';
  end if;

  if profile_consorcio_id is null or profile_unit_code is null then
    raise exception 'Tu cuenta no tiene unidad funcional asignada';
  end if;

  select id
  into resolved_unit_id
  from public.unidades_funcionales
  where consorcio_id = profile_consorcio_id
    and upper(codigo) = upper(profile_unit_code)
  limit 1;

  if resolved_unit_id is null then
    raise exception 'No existe la unidad funcional asignada para este usuario';
  end if;

  select requiere_aprobacion_manual
  into requires_manual_approval
  from public.amenities
  where id = p_amenity_id
    and consorcio_id = profile_consorcio_id
  limit 1;

  perform public.assert_reservation_rules(
    profile_consorcio_id,
    resolved_unit_id,
    p_amenity_id,
    p_fecha,
    p_hora_inicio,
    p_hora_fin
  );

  if profile_is_minor then
    if responsible_adult_id is null then
      raise exception 'Este perfil menor necesita un adulto responsable vinculado antes de reservar';
    end if;

    reservation_status := 'pendiente_adulto';
  else
    reservation_status := case when coalesce(requires_manual_approval, false) then 'pendiente' else 'confirmada' end;
  end if;

  insert into public.reservas (
    consorcio_id,
    amenity_id,
    usuario_id,
    unidad_id,
    fecha,
    hora_inicio,
    hora_fin,
    estado,
    reglas_aceptadas
  )
  values (
    profile_consorcio_id,
    p_amenity_id,
    current_user_id,
    resolved_unit_id,
    p_fecha,
    p_hora_inicio,
    p_hora_fin,
    reservation_status,
    true
  )
  returning id into created_reservation_id;

  if reservation_status = 'pendiente_adulto' then
    perform public.create_notification(
      profile_consorcio_id,
      'dependientes',
      'Reserva pendiente de aprobacion adulta',
      concat('El menor solicito una reserva para el ', p_fecha::text, ' de ', p_hora_inicio::text, ' a ', p_hora_fin::text),
      null,
      responsible_adult_id,
      jsonb_build_object('reservation_id', created_reservation_id, 'amenity_id', p_amenity_id, 'adulto_responsable_email', responsible_adult_email)
    );
  elsif reservation_status = 'pendiente' then
    perform public.create_notification(
      profile_consorcio_id,
      'reservas',
      'Nueva reserva pendiente',
      concat('Se solicito una reserva para el ', p_fecha::text, ' de ', p_hora_inicio::text, ' a ', p_hora_fin::text),
      'admin',
      null,
      jsonb_build_object('reservation_id', created_reservation_id, 'amenity_id', p_amenity_id)
    );
  else
    perform public.create_notification(
      profile_consorcio_id,
      'reservas',
      'Reserva confirmada',
      concat('Tu reserva para el ', p_fecha::text, ' fue confirmada.'),
      null,
      current_user_id,
      jsonb_build_object('reservation_id', created_reservation_id, 'amenity_id', p_amenity_id)
    );
  end if;

  return query select created_reservation_id;
end;
$$;

create or replace function public.list_pending_dependent_reservations()
returns table(
  reservation_id uuid,
  menor_id uuid,
  menor_nombre text,
  menor_apellido text,
  amenity_nombre text,
  fecha date,
  hora_inicio time,
  hora_fin time,
  estado text
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    p.id,
    p.nombre,
    p.apellido,
    a.nombre,
    r.fecha,
    r.hora_inicio,
    r.hora_fin,
    r.estado
  from public.reservas r
  join public.profiles p on p.id = r.usuario_id
  join public.amenities a on a.id = r.amenity_id
  where p.adulto_responsable_id = auth.uid()
    and coalesce(p.es_menor, false) = true
    and r.estado = 'pendiente_adulto'
  order by r.fecha asc, r.hora_inicio asc;
$$;

create or replace function public.review_dependent_reservation_request(
  p_reservation_id uuid,
  p_estado text
)
returns table(reservation_id uuid, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  reservation_record public.reservas%rowtype;
  child_profile public.profiles%rowtype;
  next_status text;
  requires_manual_approval boolean := false;
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select r.*
  into reservation_record
  from public.reservas r
  join public.profiles p on p.id = r.usuario_id
  where r.id = p_reservation_id
    and p.adulto_responsable_id = current_user_id
    and coalesce(p.es_menor, false) = true
  limit 1;

  if reservation_record.id is null then
    raise exception 'No existe una reserva dependiente pendiente para este adulto';
  end if;

  if reservation_record.estado <> 'pendiente_adulto' then
    raise exception 'La reserva ya no requiere aprobacion adulta';
  end if;

  select *
  into child_profile
  from public.profiles
  where id = reservation_record.usuario_id;

  if lower(trim(coalesce(p_estado, ''))) in ('aprobada', 'aprobar', 'confirmada') then
    select requiere_aprobacion_manual
    into requires_manual_approval
    from public.amenities
    where id = reservation_record.amenity_id
    limit 1;

    next_status := case when coalesce(requires_manual_approval, false) then 'pendiente' else 'confirmada' end;
  elsif lower(trim(coalesce(p_estado, ''))) in ('rechazada', 'rechazar', 'cancelada') then
    next_status := 'cancelada';
  else
    raise exception 'Estado invalido para revision adulta';
  end if;

  update public.reservas
  set estado = next_status
  where id = reservation_record.id;

  if next_status = 'pendiente' then
    perform public.create_notification(
      reservation_record.consorcio_id,
      'reservas',
      'Reserva pendiente de administracion',
      concat('La reserva del menor ', child_profile.nombre, ' ', child_profile.apellido, ' ya fue aprobada por su adulto responsable.'),
      'admin',
      null,
      jsonb_build_object('reservation_id', reservation_record.id)
    );
  elsif next_status = 'confirmada' then
    created_notification_id := public.create_notification(
      reservation_record.consorcio_id,
      'dependientes',
      'Reserva aprobada por adulto responsable',
      concat('Tu reserva del ', reservation_record.fecha::text, ' fue aprobada.'),
      null,
      child_profile.id,
      jsonb_build_object('reservation_id', reservation_record.id)
    );

    perform public.notify_profile_via_configured_channels(
      created_notification_id,
      reservation_record.consorcio_id,
      child_profile.id,
      'Reserva aprobada por adulto responsable',
      concat('Tu reserva del ', reservation_record.fecha::text, ' fue aprobada.'),
      jsonb_build_object('reservation_id', reservation_record.id, 'tipo', 'dependent_reservation_review')
    );
  else
    created_notification_id := public.create_notification(
      reservation_record.consorcio_id,
      'dependientes',
      'Reserva rechazada por adulto responsable',
      concat('Tu reserva del ', reservation_record.fecha::text, ' no fue aprobada.'),
      null,
      child_profile.id,
      jsonb_build_object('reservation_id', reservation_record.id)
    );

    perform public.notify_profile_via_configured_channels(
      created_notification_id,
      reservation_record.consorcio_id,
      child_profile.id,
      'Reserva rechazada por adulto responsable',
      concat('Tu reserva del ', reservation_record.fecha::text, ' no fue aprobada.'),
      jsonb_build_object('reservation_id', reservation_record.id, 'tipo', 'dependent_reservation_review')
    );
  end if;

  return query select reservation_record.id, next_status;
end;
$$;

create or replace function public.review_reservation_request(
  p_reservation_id uuid,
  p_estado text
)
returns table(reservation_id uuid, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role := public.current_role();
  reservation_record public.reservas%rowtype;
  normalized_status text := lower(trim(coalesce(p_estado, '')));
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_superadmin() and actor_role <> 'admin' then
    raise exception 'No tienes permisos para revisar reservas';
  end if;

  if normalized_status not in ('confirmada', 'cancelada') then
    raise exception 'Estado de revision invalido';
  end if;

  select *
  into reservation_record
  from public.reservas
  where id = p_reservation_id
    and (
      public.is_superadmin()
      or consorcio_id = public.current_consorcio_id()
    )
  limit 1;

  if reservation_record.id is null then
    raise exception 'No se encontro la reserva solicitada';
  end if;

  if reservation_record.estado <> 'pendiente' then
    raise exception 'Solo se pueden revisar reservas pendientes';
  end if;

  update public.reservas
  set estado = normalized_status
  where id = reservation_record.id;

  created_notification_id := public.create_notification(
    reservation_record.consorcio_id,
    'reservas',
    case when normalized_status = 'confirmada' then 'Reserva aprobada' else 'Reserva rechazada' end,
    case when normalized_status = 'confirmada' then 'Administracion aprobo tu solicitud de reserva.' else 'Administracion rechazo tu solicitud de reserva.' end,
    null,
    reservation_record.usuario_id,
    jsonb_build_object('reservation_id', reservation_record.id, 'estado', normalized_status)
  );

  perform public.notify_profile_via_configured_channels(
    created_notification_id,
    reservation_record.consorcio_id,
    reservation_record.usuario_id,
    case when normalized_status = 'confirmada' then 'Reserva aprobada' else 'Reserva rechazada' end,
    case when normalized_status = 'confirmada' then 'Administracion aprobo tu solicitud de reserva.' else 'Administracion rechazo tu solicitud de reserva.' end,
    jsonb_build_object('reservation_id', reservation_record.id, 'estado', normalized_status, 'tipo', 'reservation_review')
  );

  return query select reservation_record.id, normalized_status;
end;
$$;

create or replace function public.cancel_reservation_request(
  p_reservation_id uuid,
  p_reason text default null
)
returns table(reservation_id uuid, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role := public.current_role();
  reservation_record public.reservas%rowtype;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select *
  into reservation_record
  from public.reservas
  where id = p_reservation_id
    and (
      public.is_superadmin()
      or (consorcio_id = public.current_consorcio_id() and actor_role = 'admin')
      or usuario_id = current_user_id
    )
  limit 1;

  if reservation_record.id is null then
    raise exception 'No se encontro la reserva solicitada';
  end if;

  if reservation_record.estado = 'cancelada' then
    raise exception 'La reserva ya fue cancelada';
  end if;

  if (reservation_record.fecha + reservation_record.hora_inicio) <= timezone('utc', now()) then
    raise exception 'No se puede cancelar una reserva ya iniciada';
  end if;

  update public.reservas
  set estado = 'cancelada'
  where id = reservation_record.id;

  perform public.create_notification(
    reservation_record.consorcio_id,
    'reservas',
    'Reserva cancelada',
    'Una reserva fue cancelada en el consorcio.',
    'admin',
    null,
    jsonb_build_object('reservation_id', reservation_record.id, 'usuario_id', reservation_record.usuario_id)
  );

  return query select reservation_record.id, 'cancelada'::text;
end;
$$;

create or replace function public.reschedule_reservation_request(
  p_reservation_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time
)
returns table(reservation_id uuid, fecha date, hora_inicio time, hora_fin time)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role := public.current_role();
  reservation_record public.reservas%rowtype;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select *
  into reservation_record
  from public.reservas
  where id = p_reservation_id
    and (
      public.is_superadmin()
      or (consorcio_id = public.current_consorcio_id() and actor_role = 'admin')
      or usuario_id = current_user_id
    )
  limit 1;

  if reservation_record.id is null then
    raise exception 'No se encontro la reserva solicitada';
  end if;

  if reservation_record.estado = 'cancelada' then
    raise exception 'No se puede reprogramar una reserva cancelada';
  end if;

  if (reservation_record.fecha + reservation_record.hora_inicio) <= timezone('utc', now()) then
    raise exception 'No se puede reprogramar una reserva ya iniciada';
  end if;

  perform public.assert_reservation_rules(
    reservation_record.consorcio_id,
    reservation_record.unidad_id,
    reservation_record.amenity_id,
    p_fecha,
    p_hora_inicio,
    p_hora_fin,
    reservation_record.id
  );

  update public.reservas
  set fecha = p_fecha,
      hora_inicio = p_hora_inicio,
      hora_fin = p_hora_fin,
      estado = 'confirmada'
  where id = reservation_record.id;

  perform public.create_notification(
    reservation_record.consorcio_id,
    'reservas',
    'Reserva reprogramada',
    concat('La reserva fue movida al ', p_fecha::text, ' de ', p_hora_inicio::text, ' a ', p_hora_fin::text),
    'admin',
    null,
    jsonb_build_object('reservation_id', reservation_record.id, 'usuario_id', reservation_record.usuario_id)
  );

  return query select reservation_record.id, p_fecha, p_hora_inicio, p_hora_fin;
end;
$$;

create or replace function public.create_claim_ticket(
  p_titulo text,
  p_categoria text,
  p_descripcion text,
  p_foto_url text default null
)
returns table(claim_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_consorcio_id uuid;
  profile_unit_code text;
  resolved_unit_id uuid;
  created_claim_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if coalesce(trim(p_titulo), '') = '' or coalesce(trim(p_descripcion), '') = '' then
    raise exception 'Titulo y descripcion son obligatorios';
  end if;

  select consorcio_id, unidad_funcional
  into profile_consorcio_id, profile_unit_code
  from public.profiles
  where id = current_user_id;

  if profile_consorcio_id is null then
    raise exception 'Tu cuenta no esta vinculada a un consorcio';
  end if;

  if profile_unit_code is not null then
    select id
    into resolved_unit_id
    from public.unidades_funcionales
    where consorcio_id = profile_consorcio_id
      and upper(codigo) = upper(profile_unit_code)
    limit 1;
  end if;

  insert into public.reclamos (
    consorcio_id,
    creador_id,
    unidad_id,
    titulo,
    categoria,
    descripcion,
    foto_url,
    estado,
    visible_para_todo_consorcio
  )
  values (
    profile_consorcio_id,
    current_user_id,
    resolved_unit_id,
    trim(p_titulo),
    nullif(trim(coalesce(p_categoria, '')), ''),
    trim(p_descripcion),
    nullif(trim(coalesce(p_foto_url, '')), ''),
    'pendiente',
    true
  )
  returning id into created_claim_id;

  insert into public.reclamo_eventos (consorcio_id, reclamo_id, actor_id, estado, comentario)
  values (profile_consorcio_id, created_claim_id, current_user_id, 'pendiente', 'Reclamo creado desde el portal residente');

  perform public.create_notification(
    profile_consorcio_id,
    'reclamos',
    'Nuevo reclamo',
    concat('Se registro un reclamo: ', trim(p_titulo)),
    'admin',
    null,
    jsonb_build_object('claim_id', created_claim_id)
  );

  return query select created_claim_id;
end;
$$;

create or replace function public.update_claim_ticket(
  p_claim_id uuid,
  p_estado public.ticket_status,
  p_comentario text default null
)
returns table(claim_id uuid, estado public.ticket_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role := public.current_role();
  claim_record public.reclamos%rowtype;
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_superadmin() and actor_role <> 'admin' then
    raise exception 'No tienes permisos para actualizar reclamos';
  end if;

  select *
  into claim_record
  from public.reclamos
  where id = p_claim_id
    and (
      public.is_superadmin()
      or consorcio_id = public.current_consorcio_id()
    )
  limit 1;

  if claim_record.id is null then
    raise exception 'No se encontro el reclamo solicitado';
  end if;

  update public.reclamos
  set estado = p_estado
  where id = claim_record.id;

  insert into public.reclamo_eventos (
    consorcio_id,
    reclamo_id,
    actor_id,
    estado,
    comentario
  )
  values (
    claim_record.consorcio_id,
    claim_record.id,
    current_user_id,
    p_estado,
    nullif(trim(coalesce(p_comentario, '')), '')
  );

  created_notification_id := public.create_notification(
    claim_record.consorcio_id,
    'reclamos',
    'Actualizacion de reclamo',
    concat('El reclamo ', claim_record.titulo, ' paso a ', p_estado::text),
    null,
    claim_record.creador_id,
    jsonb_build_object('claim_id', claim_record.id, 'estado', p_estado)
  );

  perform public.notify_profile_via_configured_channels(
    created_notification_id,
    claim_record.consorcio_id,
    claim_record.creador_id,
    'Actualizacion de reclamo',
    concat('El reclamo ', claim_record.titulo, ' paso a ', p_estado::text),
    jsonb_build_object('claim_id', claim_record.id, 'estado', p_estado, 'tipo', 'claim_update')
  );

  return query select claim_record.id, p_estado;
end;
$$;

create or replace function public.create_visit_authorization(
  p_visitante_nombre text,
  p_visitante_dni text,
  p_fecha_visita date,
  p_hora_desde time default null,
  p_hora_hasta time default null,
  p_punto_vigilancia_id uuid default null,
  p_telefono_contacto text default null,
  p_patente_vehiculo text default null,
  p_cantidad_invitados integer default 1,
  p_observaciones text default null,
  p_compartir_whatsapp boolean default false
)
returns table(authorization_id uuid, qr_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_consorcio_id uuid;
  profile_unit_code text;
  profile_is_minor boolean := false;
  responsible_adult_id uuid;
  resolved_unit_id uuid;
  resolved_point_id uuid;
  generated_token text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  created_authorization_id uuid;
  created_whatsapp_notification_id uuid;
  next_status text := 'vigente';
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if coalesce(trim(p_visitante_nombre), '') = '' or coalesce(trim(p_visitante_dni), '') = '' then
    raise exception 'Nombre y DNI del visitante son obligatorios';
  end if;

  if p_cantidad_invitados is null or p_cantidad_invitados < 1 then
    raise exception 'La cantidad de invitados debe ser al menos 1';
  end if;

  if p_hora_desde is not null and p_hora_hasta is not null and p_hora_hasta <= p_hora_desde then
    raise exception 'La hora de salida debe ser posterior a la hora de ingreso';
  end if;

  select consorcio_id, unidad_funcional, coalesce(es_menor, false), adulto_responsable_id
  into profile_consorcio_id, profile_unit_code, profile_is_minor, responsible_adult_id
  from public.profiles
  where id = current_user_id;

  if profile_consorcio_id is null then
    raise exception 'Tu cuenta no esta vinculada a un consorcio';
  end if;

  if profile_is_minor and responsible_adult_id is null then
    raise exception 'Este perfil menor necesita un adulto responsable vinculado antes de autorizar visitas';
  end if;

  next_status := case when profile_is_minor then 'pendiente_adulto' else 'vigente' end;

  if profile_unit_code is not null then
    select id
    into resolved_unit_id
    from public.unidades_funcionales
    where consorcio_id = profile_consorcio_id
      and upper(codigo) = upper(profile_unit_code)
    limit 1;
  end if;

  if p_punto_vigilancia_id is not null then
    select id
    into resolved_point_id
    from public.puntos_vigilancia
    where id = p_punto_vigilancia_id
      and consorcio_id = profile_consorcio_id
      and activo = true
    limit 1;

    if resolved_point_id is null then
      raise exception 'El punto de vigilancia seleccionado no pertenece a este consorcio o no esta activo';
    end if;
  end if;

  insert into public.autorizaciones_visitas (
    consorcio_id,
    residente_id,
    unidad_id,
    punto_vigilancia_id,
    visitante_nombre,
    visitante_dni,
    fecha_visita,
    hora_desde,
    hora_hasta,
    telefono_contacto,
    patente_vehiculo,
    cantidad_invitados,
    observaciones,
    compartir_whatsapp,
    qr_token,
    estado
  )
  values (
    profile_consorcio_id,
    current_user_id,
    resolved_unit_id,
    resolved_point_id,
    trim(p_visitante_nombre),
    trim(p_visitante_dni),
    p_fecha_visita,
    p_hora_desde,
    p_hora_hasta,
    nullif(trim(coalesce(p_telefono_contacto, '')), ''),
    nullif(upper(trim(coalesce(p_patente_vehiculo, ''))), ''),
    p_cantidad_invitados,
    nullif(trim(coalesce(p_observaciones, '')), ''),
    coalesce(p_compartir_whatsapp, false),
    generated_token,
    next_status
  )
  returning id into created_authorization_id;

  if profile_is_minor then
    perform public.create_notification(
      profile_consorcio_id,
      'dependientes',
      'Visita pendiente de aprobacion adulta',
      concat('El menor cargo una visita para ', trim(p_visitante_nombre), ' el ', p_fecha_visita::text),
      null,
      responsible_adult_id,
      jsonb_build_object('authorization_id', created_authorization_id)
    );
  else
    perform public.create_notification(
      profile_consorcio_id,
      'visitas',
      'Nueva visita autorizada',
      concat(
        'Visita para ',
        trim(p_visitante_nombre),
        ' el ',
        p_fecha_visita::text,
        case when resolved_point_id is not null then ' · con punto asignado' else '' end
      ),
      'seguridad',
      null,
      jsonb_build_object(
        'authorization_id', created_authorization_id,
        'punto_vigilancia_id', resolved_point_id,
        'cantidad_invitados', p_cantidad_invitados,
        'patente_vehiculo', nullif(upper(trim(coalesce(p_patente_vehiculo, ''))), '')
      )
    );

    if coalesce(p_compartir_whatsapp, false) and nullif(trim(coalesce(p_telefono_contacto, '')), '') is not null then
      created_whatsapp_notification_id := public.create_notification(
        profile_consorcio_id,
        'visitas',
        'Envio WhatsApp de visita preparado',
        concat('Se preparo el envio por WhatsApp para ', trim(p_visitante_nombre), ' el ', p_fecha_visita::text),
        null,
        current_user_id,
        jsonb_build_object(
          'authorization_id', created_authorization_id,
          'telefono_contacto', nullif(trim(coalesce(p_telefono_contacto, '')), ''),
          'qr_token', generated_token
        )
      );

      perform public.enqueue_notification_whatsapp(
        created_whatsapp_notification_id,
        profile_consorcio_id,
        nullif(trim(coalesce(p_telefono_contacto, '')), ''),
        concat('Visita autorizada para ', trim(p_visitante_nombre)),
        concat('Tu acceso para el ', p_fecha_visita::text, ' quedo autorizado. Codigo QR: ', generated_token),
        current_user_id,
        jsonb_build_object(
          'authorization_id', created_authorization_id,
          'visitante_nombre', trim(p_visitante_nombre),
          'fecha_visita', p_fecha_visita,
          'qr_token', generated_token
        )
      );
    end if;
  end if;

  return query select created_authorization_id, generated_token;
end;
$$;

create or replace function public.list_pending_dependent_visits()
returns table(
  authorization_id uuid,
  menor_id uuid,
  menor_nombre text,
  menor_apellido text,
  visitante_nombre text,
  fecha_visita date,
  hora_desde time,
  hora_hasta time,
  estado text
)
language sql
security definer
set search_path = public
as $$
  select
    v.id,
    p.id,
    p.nombre,
    p.apellido,
    v.visitante_nombre,
    v.fecha_visita,
    v.hora_desde,
    v.hora_hasta,
    v.estado
  from public.autorizaciones_visitas v
  join public.profiles p on p.id = v.residente_id
  where p.adulto_responsable_id = auth.uid()
    and coalesce(p.es_menor, false) = true
    and v.estado = 'pendiente_adulto'
  order by v.fecha_visita asc, v.hora_desde asc nulls last;
$$;

create or replace function public.review_dependent_visit_authorization(
  p_authorization_id uuid,
  p_estado text
)
returns table(authorization_id uuid, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  visit_record public.autorizaciones_visitas%rowtype;
  child_profile public.profiles%rowtype;
  next_status text;
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select v.*
  into visit_record
  from public.autorizaciones_visitas v
  join public.profiles p on p.id = v.residente_id
  where v.id = p_authorization_id
    and p.adulto_responsable_id = current_user_id
    and coalesce(p.es_menor, false) = true
  limit 1;

  if visit_record.id is null then
    raise exception 'No existe una visita dependiente pendiente para este adulto';
  end if;

  if visit_record.estado <> 'pendiente_adulto' then
    raise exception 'La visita ya no requiere aprobacion adulta';
  end if;

  select *
  into child_profile
  from public.profiles
  where id = visit_record.residente_id;

  if lower(trim(coalesce(p_estado, ''))) in ('aprobada', 'aprobar', 'vigente') then
    next_status := 'vigente';
  elsif lower(trim(coalesce(p_estado, ''))) in ('rechazada', 'rechazar', 'cancelada') then
    next_status := 'rechazada';
  else
    raise exception 'Estado invalido para revision adulta';
  end if;

  update public.autorizaciones_visitas
  set estado = next_status
  where id = visit_record.id;

  if next_status = 'vigente' then
    perform public.create_notification(
      visit_record.consorcio_id,
      'visitas',
      'Visita aprobada por adulto responsable',
      concat('La visita para ', visit_record.visitante_nombre, ' quedo habilitada.'),
      'seguridad',
      null,
      jsonb_build_object('authorization_id', visit_record.id)
    );

    created_notification_id := public.create_notification(
      visit_record.consorcio_id,
      'dependientes',
      'Visita aprobada',
      concat('Tu visita para ', visit_record.visitante_nombre, ' fue aprobada.'),
      null,
      child_profile.id,
      jsonb_build_object('authorization_id', visit_record.id)
    );

    perform public.notify_profile_via_configured_channels(
      created_notification_id,
      visit_record.consorcio_id,
      child_profile.id,
      'Visita aprobada',
      concat('Tu visita para ', visit_record.visitante_nombre, ' fue aprobada.'),
      jsonb_build_object('authorization_id', visit_record.id, 'tipo', 'dependent_visit_review')
    );
  else
    created_notification_id := public.create_notification(
      visit_record.consorcio_id,
      'dependientes',
      'Visita rechazada por adulto responsable',
      concat('Tu visita para ', visit_record.visitante_nombre, ' no fue aprobada.'),
      null,
      child_profile.id,
      jsonb_build_object('authorization_id', visit_record.id)
    );

    perform public.notify_profile_via_configured_channels(
      created_notification_id,
      visit_record.consorcio_id,
      child_profile.id,
      'Visita rechazada por adulto responsable',
      concat('Tu visita para ', visit_record.visitante_nombre, ' no fue aprobada.'),
      jsonb_build_object('authorization_id', visit_record.id, 'tipo', 'dependent_visit_review')
    );
  end if;

  return query select visit_record.id, next_status;
end;
$$;

create or replace function public.validate_visit_entry(
  p_qr_token text,
  p_note text default null,
  p_punto_vigilancia_id uuid default null
)
returns table(authorization_id uuid, visitante_nombre text, estado text, entry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  access_role public.app_role := public.current_role();
  visit_record public.autorizaciones_visitas%rowtype;
  created_entry_id uuid;
  selected_point_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_superadmin() and access_role not in ('admin', 'seguridad') then
    raise exception 'No tienes permisos para validar ingresos';
  end if;

  select *
  into visit_record
  from public.autorizaciones_visitas
  where upper(qr_token) = upper(trim(p_qr_token))
    and (
      public.is_superadmin()
      or consorcio_id = public.current_consorcio_id()
    )
  limit 1;

  if visit_record.id is null then
    raise exception 'No se encontro una autorizacion valida para ese codigo';
  end if;

  if visit_record.fecha_visita <> current_date then
    raise exception 'La autorizacion solo puede validarse en la fecha programada';
  end if;

  if visit_record.estado <> 'vigente' then
    raise exception 'La autorizacion ya no esta vigente';
  end if;

  if p_punto_vigilancia_id is not null then
    select id
    into selected_point_id
    from public.puntos_vigilancia
    where id = p_punto_vigilancia_id
      and consorcio_id = visit_record.consorcio_id
      and activo = true
    limit 1;

    if selected_point_id is null then
      raise exception 'El punto de vigilancia indicado no esta disponible para este consorcio';
    end if;
  end if;

  if visit_record.punto_vigilancia_id is not null and selected_point_id is not null and visit_record.punto_vigilancia_id <> selected_point_id then
    raise exception 'La visita fue asignada a otro punto de vigilancia';
  end if;

  update public.autorizaciones_visitas
  set estado = 'usada'
  where id = visit_record.id;

  insert into public.ingresos_guardia (
    consorcio_id,
    autorizacion_id,
    guardia_id,
    punto_vigilancia_id,
    descripcion
  )
  values (
    visit_record.consorcio_id,
    visit_record.id,
    current_user_id,
    coalesce(selected_point_id, visit_record.punto_vigilancia_id),
    concat(
      'Ingreso autorizado: ',
      visit_record.visitante_nombre,
      ' DNI ',
      visit_record.visitante_dni,
      case
        when visit_record.patente_vehiculo is not null and trim(visit_record.patente_vehiculo) <> '' then concat(' · patente ', visit_record.patente_vehiculo)
        else ''
      end,
      case
        when visit_record.cantidad_invitados > 1 then concat(' · ', visit_record.cantidad_invitados::text, ' personas')
        else ''
      end,
      case
        when p_note is not null and trim(p_note) <> '' then concat(' · ', trim(p_note))
        else ''
      end
    )
  )
  returning id into created_entry_id;

  return query
  select visit_record.id, visit_record.visitante_nombre, 'usada'::text, created_entry_id;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists consorcios_touch_updated_at on public.consorcios;
create trigger consorcios_touch_updated_at
before update on public.consorcios
for each row execute function public.touch_updated_at();

drop trigger if exists consorcio_suscripciones_touch_updated_at on public.consorcio_suscripciones;
create trigger consorcio_suscripciones_touch_updated_at
before update on public.consorcio_suscripciones
for each row execute function public.touch_updated_at();

drop trigger if exists cargos_plataforma_unidad_touch_updated_at on public.cargos_plataforma_unidad;
create trigger cargos_plataforma_unidad_touch_updated_at
before update on public.cargos_plataforma_unidad
for each row execute function public.touch_updated_at();

drop trigger if exists consorcio_channel_integrations_touch_updated_at on public.consorcio_channel_integrations;
create trigger consorcio_channel_integrations_touch_updated_at
before update on public.consorcio_channel_integrations
for each row execute function public.touch_updated_at();

drop trigger if exists enforce_demo_unit_limit_trigger on public.unidades_funcionales;
create trigger enforce_demo_unit_limit_trigger
before insert or update on public.unidades_funcionales
for each row execute function public.enforce_demo_unit_limit();

drop trigger if exists padron_accesos_importados_touch_updated_at on public.padron_accesos_importados;
create trigger padron_accesos_importados_touch_updated_at
before update on public.padron_accesos_importados
for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.create_notification(
  p_consorcio_id uuid,
  p_categoria text,
  p_titulo text,
  p_detalle text,
  p_rol_destino public.app_role default null,
  p_destinatario_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_notification_id uuid;
begin
  if p_destinatario_id is null and p_rol_destino is null then
    raise exception 'La notificacion requiere destinatario o rol';
  end if;

  insert into public.notificaciones (
    consorcio_id,
    destinatario_id,
    rol_destino,
    categoria,
    titulo,
    detalle,
    metadata
  )
  values (
    p_consorcio_id,
    p_destinatario_id,
    p_rol_destino,
    trim(p_categoria),
    trim(p_titulo),
    trim(p_detalle),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into created_notification_id;

  return created_notification_id;
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
  on conflict (consorcio_id)
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
  on conflict (consorcio_id, unidad_id, periodo_referencia)
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

create or replace function public.update_platform_unit_charge_collection(
  p_charge_id uuid,
  p_fecha_vencimiento date default null,
  p_enlace_pago text default null,
  p_detalle text default null
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
  updated_charge_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if current_access_role <> 'admin' then
    raise exception 'Solo administracion puede editar la cobranza';
  end if;

  update public.cargos_plataforma_unidad
  set
    fecha_vencimiento = p_fecha_vencimiento,
    enlace_pago = nullif(trim(coalesce(p_enlace_pago, '')), ''),
    detalle = nullif(trim(coalesce(p_detalle, '')), ''),
    updated_at = timezone('utc', now())
  where id = p_charge_id
    and consorcio_id = current_consorcio
  returning id into updated_charge_id;

  if updated_charge_id is null then
    raise exception 'No se encontro el cargo a actualizar';
  end if;

  return updated_charge_id;
end;
$$;

create or replace function public.mark_platform_unit_charge_paid(
  p_charge_id uuid,
  p_referencia_pago text default null,
  p_comprobante_url text default null
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
  updated_charge_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if current_access_role <> 'admin' then
    raise exception 'Solo administracion puede imputar pagos';
  end if;

  update public.cargos_plataforma_unidad
  set
    estado = 'pagado',
    pagado_at = timezone('utc', now()),
    referencia_pago = nullif(trim(coalesce(p_referencia_pago, '')), ''),
    comprobante_url = nullif(trim(coalesce(p_comprobante_url, '')), ''),
    updated_at = timezone('utc', now())
  where id = p_charge_id
    and consorcio_id = current_consorcio
  returning id into updated_charge_id;

  if updated_charge_id is null then
    raise exception 'No se encontro el cargo a actualizar';
  end if;

  return updated_charge_id;
end;
$$;

create or replace function public.enqueue_notification_email(
  p_notification_id uuid,
  p_consorcio_id uuid,
  p_destinatario_email text,
  p_asunto text,
  p_cuerpo text,
  p_destinatario_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_delivery_id uuid;
  integration_row public.consorcio_channel_integrations%rowtype;
  resolved_payload jsonb;
  resolved_status public.notification_delivery_status := 'pendiente';
  resolved_error text := null;
begin
  if coalesce(trim(p_destinatario_email), '') = '' then
    raise exception 'El email destinatario es obligatorio';
  end if;

  select *
  into integration_row
  from public.consorcio_channel_integrations
  where consorcio_id = p_consorcio_id
    and canal = 'email'
  limit 1;

  if integration_row.id is null or coalesce(integration_row.activo, false) = false then
    resolved_status := 'omitido';
    resolved_error := 'Canal email inactivo o sin configurar';
  end if;

  resolved_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'integration_id', integration_row.id,
      'proveedor', integration_row.proveedor,
      'remitente', integration_row.remitente,
      'modo_prueba', coalesce(integration_row.modo_prueba, true),
      'credenciales', coalesce(integration_row.credenciales, '{}'::jsonb)
    );

  insert into public.notificacion_salidas (
    notificacion_id,
    consorcio_id,
    canal,
    destinatario_id,
    destinatario_email,
    destinatario_ref,
    asunto,
    cuerpo,
    estado,
    proveedor,
    payload
  )
  values (
    p_notification_id,
    p_consorcio_id,
    'email',
    p_destinatario_id,
    lower(trim(p_destinatario_email)),
    lower(trim(p_destinatario_email)),
    trim(p_asunto),
    trim(p_cuerpo),
    resolved_status,
    coalesce(nullif(trim(coalesce(integration_row.proveedor, '')), ''), 'email'),
    resolved_payload
  )
  returning id into created_delivery_id;

  if resolved_error is not null then
    update public.notificacion_salidas
    set error_message = resolved_error
    where id = created_delivery_id;
  end if;

  return created_delivery_id;
end;
$$;

create or replace function public.enqueue_notification_whatsapp(
  p_notification_id uuid,
  p_consorcio_id uuid,
  p_destinatario_ref text,
  p_asunto text,
  p_cuerpo text,
  p_destinatario_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_delivery_id uuid;
  integration_row public.consorcio_channel_integrations%rowtype;
  resolved_payload jsonb;
  resolved_status public.notification_delivery_status := 'pendiente';
  resolved_error text := null;
  normalized_ref text;
begin
  normalized_ref := nullif(trim(coalesce(p_destinatario_ref, '')), '');

  if normalized_ref is null then
    raise exception 'El destino de WhatsApp es obligatorio';
  end if;

  select *
  into integration_row
  from public.consorcio_channel_integrations
  where consorcio_id = p_consorcio_id
    and canal = 'whatsapp'
  limit 1;

  if integration_row.id is null or coalesce(integration_row.activo, false) = false then
    resolved_status := 'omitido';
    resolved_error := 'Canal WhatsApp inactivo o sin configurar';
  end if;

  resolved_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'integration_id', integration_row.id,
      'proveedor', integration_row.proveedor,
      'remitente', integration_row.remitente,
      'modo_prueba', coalesce(integration_row.modo_prueba, true),
      'credenciales', coalesce(integration_row.credenciales, '{}'::jsonb)
    );

  insert into public.notificacion_salidas (
    notificacion_id,
    consorcio_id,
    canal,
    destinatario_id,
    destinatario_email,
    destinatario_ref,
    asunto,
    cuerpo,
    estado,
    proveedor,
    payload
  )
  values (
    p_notification_id,
    p_consorcio_id,
    'whatsapp',
    p_destinatario_id,
    null,
    normalized_ref,
    trim(p_asunto),
    trim(p_cuerpo),
    resolved_status,
    coalesce(nullif(trim(coalesce(integration_row.proveedor, '')), ''), 'whatsapp'),
    resolved_payload
  )
  returning id into created_delivery_id;

  if resolved_error is not null then
    update public.notificacion_salidas
    set error_message = resolved_error
    where id = created_delivery_id;
  end if;

  return created_delivery_id;
end;
$$;

create or replace function public.enqueue_test_channel_delivery(
  p_canal public.notification_delivery_channel,
  p_destino text,
  p_asunto text,
  p_cuerpo text
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
  created_notification_id uuid;
  created_delivery_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if current_access_role <> 'admin' then
    raise exception 'Solo administracion puede generar pruebas de canal';
  end if;

  if current_consorcio is null then
    raise exception 'Tu perfil no esta vinculado a un consorcio';
  end if;

  if nullif(trim(coalesce(p_destino, '')), '') is null then
    raise exception 'Debes indicar un destino de prueba';
  end if;

  created_notification_id := public.create_notification(
    current_consorcio,
    'integraciones',
    coalesce(nullif(trim(coalesce(p_asunto, '')), ''), 'Prueba de canal saliente'),
    coalesce(nullif(trim(coalesce(p_cuerpo, '')), ''), 'Este mensaje verifica la configuracion del canal saliente.'),
    null,
    current_user_id,
    jsonb_build_object('test_channel', p_canal)
  );

  if p_canal = 'email' then
    created_delivery_id := public.enqueue_notification_email(
      created_notification_id,
      current_consorcio,
      trim(p_destino),
      coalesce(nullif(trim(coalesce(p_asunto, '')), ''), 'Prueba de email Comunitaria'),
      coalesce(nullif(trim(coalesce(p_cuerpo, '')), ''), 'Este email fue encolado como prueba desde el panel administrador.'),
      current_user_id,
      jsonb_build_object('test_channel', 'email')
    );
  else
    created_delivery_id := public.enqueue_notification_whatsapp(
      created_notification_id,
      current_consorcio,
      trim(p_destino),
      coalesce(nullif(trim(coalesce(p_asunto, '')), ''), 'Prueba de WhatsApp Comunitaria'),
      coalesce(nullif(trim(coalesce(p_cuerpo, '')), ''), 'Este mensaje fue encolado como prueba desde el panel administrador.'),
      current_user_id,
      jsonb_build_object('test_channel', 'whatsapp')
    );
  end if;

  return created_delivery_id;
end;
$$;

create or replace function public.notify_profile_via_configured_channels(
  p_notification_id uuid,
  p_consorcio_id uuid,
  p_profile_id uuid,
  p_asunto text,
  p_cuerpo text,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles%rowtype;
  delivery_count integer := 0;
begin
  select *
  into target_profile
  from public.profiles
  where id = p_profile_id
    and consorcio_id = p_consorcio_id
  limit 1;

  if target_profile.id is null then
    return 0;
  end if;

  if coalesce(trim(target_profile.email), '') <> '' then
    perform public.enqueue_notification_email(
      p_notification_id,
      p_consorcio_id,
      target_profile.email,
      p_asunto,
      p_cuerpo,
      target_profile.id,
      p_payload
    );
    delivery_count := delivery_count + 1;
  end if;

  if coalesce(trim(target_profile.telefono), '') <> '' then
    perform public.enqueue_notification_whatsapp(
      p_notification_id,
      p_consorcio_id,
      target_profile.telefono,
      p_asunto,
      p_cuerpo,
      target_profile.id,
      p_payload
    );
    delivery_count := delivery_count + 1;
  end if;

  return delivery_count;
end;
$$;

create or replace function public.enqueue_notification_email_to_role(
  p_notification_id uuid,
  p_consorcio_id uuid,
  p_role public.app_role,
  p_asunto text,
  p_cuerpo text,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_row record;
  delivery_count integer := 0;
begin
  for recipient_row in
    select id, email
    from public.profiles
    where consorcio_id = p_consorcio_id
      and rol = p_role
      and estado = 'activo'
      and coalesce(trim(email), '') <> ''
  loop
    perform public.enqueue_notification_email(
      p_notification_id,
      p_consorcio_id,
      recipient_row.email,
      p_asunto,
      p_cuerpo,
      recipient_row.id,
      p_payload
    );

    delivery_count := delivery_count + 1;
  end loop;

  return delivery_count;
end;
$$;

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

alter table public.consorcios enable row level security;
alter table public.profiles enable row level security;
alter table public.consorcio_suscripciones enable row level security;
alter table public.consorcio_channel_integrations enable row level security;
alter table public.cargos_plataforma_unidad enable row level security;
alter table public.admin_payment_events enable row level security;
alter table public.padron_accesos_importados enable row level security;
alter table public.notificaciones enable row level security;
alter table public.notificacion_salidas enable row level security;
alter table public.chat_topics enable row level security;
alter table public.chat_mensajes enable row level security;
alter table public.unidades_funcionales enable row level security;
alter table public.categorias_gastos enable row level security;
alter table public.gastos enable row level security;
alter table public.documentos_consorcio enable row level security;
alter table public.anuncios enable row level security;
alter table public.amenities enable row level security;
alter table public.reservas enable row level security;
alter table public.reclamos enable row level security;
alter table public.reclamo_eventos enable row level security;
alter table public.autorizaciones_visitas enable row level security;
alter table public.puntos_vigilancia enable row level security;
alter table public.punto_vigilancia_guardias enable row level security;
alter table public.proveedores enable row level security;
alter table public.proveedor_documentos enable row level security;
alter table public.proveedor_documento_requisitos enable row level security;
alter table public.ingresos_guardia enable row level security;

create policy "superadmin_manage_consorcios"
on public.consorcios
for all
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "superadmin_manage_suscripciones"
on public.consorcio_suscripciones
for all
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "tenant_suscripciones_select"
on public.consorcio_suscripciones
for select
using (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_profile_is_active()
  )
);

create policy "tenant_channel_integrations_select"
on public.consorcio_channel_integrations
for select
using (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
);

create policy "tenant_channel_integrations_modify"
on public.consorcio_channel_integrations
for all
using (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
)
with check (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
);

create policy "tenant_cargos_plataforma_select"
on public.cargos_plataforma_unidad
for select
using (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'residente'
    and public.current_profile_is_active()
    and exists (
      select 1
      from public.unidades_funcionales unidad
      join public.profiles perfil on perfil.id = auth.uid()
      where unidad.id = public.cargos_plataforma_unidad.unidad_id
        and unidad.consorcio_id = public.cargos_plataforma_unidad.consorcio_id
        and perfil.consorcio_id = public.cargos_plataforma_unidad.consorcio_id
        and perfil.unidad_funcional = unidad.codigo
    )
  )
);

create policy "superadmin_manage_payment_events"
on public.admin_payment_events
for all
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "members_read_own_consorcio"
on public.consorcios
for select
using (id = public.current_consorcio_id());

create policy "profiles_read_same_consorcio"
on public.profiles
for select
using (
  public.is_superadmin()
  or consorcio_id = public.current_consorcio_id()
  or id = auth.uid()
);

create policy "profiles_update_self_or_admin"
on public.profiles
for update
using (
  id = auth.uid()
  or public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
)
with check (
  id = auth.uid()
  or public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
);

create policy "profiles_insert_self"
on public.profiles
for insert
with check (id = auth.uid() or public.is_superadmin());

create policy "tenant_access_roster_select"
on public.padron_accesos_importados
for select
using (
  public.is_superadmin()
  or consorcio_id = public.current_consorcio_id()
);

create policy "tenant_access_roster_modify"
on public.padron_accesos_importados
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_notifications_select"
on public.notificaciones
for select
using (
  public.is_superadmin()
  or destinatario_id = auth.uid()
  or (
    consorcio_id = public.current_consorcio_id()
    and rol_destino = public.current_role()
  )
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
);

create policy "tenant_notifications_update"
on public.notificaciones
for update
using (
  public.is_superadmin()
  or destinatario_id = auth.uid()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
)
with check (
  public.is_superadmin()
  or destinatario_id = auth.uid()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
);

create policy "tenant_notification_deliveries_select"
on public.notificacion_salidas
for select
using (
  public.is_superadmin()
  or destinatario_id = auth.uid()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() = 'admin'
  )
);

create policy "tenant_tables_isolated_select"
on public.unidades_funcionales
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_tables_isolated_modify_unidades"
on public.unidades_funcionales
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_categories_select"
on public.categorias_gastos
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_categories_modify"
on public.categorias_gastos
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_gastos_select"
on public.gastos
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_gastos_modify"
on public.gastos
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_documentos_select"
on public.documentos_consorcio
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_documentos_modify"
on public.documentos_consorcio
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_anuncios_select"
on public.anuncios
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_anuncios_modify"
on public.anuncios
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_amenities_select"
on public.amenities
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_amenities_modify"
on public.amenities
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_reservas_select"
on public.reservas
for select
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
  or usuario_id = auth.uid()
);

create policy "tenant_reservas_modify"
on public.reservas
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_reclamos_select"
on public.reclamos
for select
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
  or creador_id = auth.uid()
);

create policy "tenant_reclamos_modify"
on public.reclamos
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_reclamo_eventos_select"
on public.reclamo_eventos
for select
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
  or exists (
    select 1
    from public.reclamos r
    where r.id = reclamo_id
      and r.creador_id = auth.uid()
  )
);

create policy "tenant_reclamo_eventos_modify"
on public.reclamo_eventos
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_visitas_select"
on public.autorizaciones_visitas
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_visitas_modify"
on public.autorizaciones_visitas
for all
using (
  public.is_superadmin()
  or consorcio_id = public.current_consorcio_id()
)
with check (
  public.is_superadmin()
  or consorcio_id = public.current_consorcio_id()
);

create policy "tenant_proveedores_select"
on public.proveedores
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_proveedores_modify"
on public.proveedores
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() in ('admin', 'seguridad'))
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() in ('admin', 'seguridad'))
);

create policy "tenant_proveedor_documentos_select"
on public.proveedor_documentos
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_proveedor_documento_requisitos_select"
on public.proveedor_documento_requisitos
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_chat_topics_select"
on public.chat_topics
for select
using (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_profile_is_active()
  )
);

create policy "tenant_chat_topics_insert"
on public.chat_topics
for insert
with check (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_profile_is_active()
    and public.current_role() = 'admin'
    and created_by = auth.uid()
  )
);

create policy "tenant_chat_topics_update"
on public.chat_topics
for update
using (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_profile_is_active()
    and public.current_role() = 'admin'
  )
)
with check (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_profile_is_active()
    and public.current_role() = 'admin'
  )
);

create policy "tenant_chat_mensajes_select"
on public.chat_mensajes
for select
using (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_profile_is_active()
    and (
      estado = 'publicado'
      or autor_id = auth.uid()
      or public.current_role() = 'admin'
    )
  )
);

create policy "tenant_chat_mensajes_insert"
on public.chat_mensajes
for insert
with check (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_profile_is_active()
    and autor_id = auth.uid()
    and (
      public.current_role() in ('admin', 'seguridad')
      or (
        public.current_role() = 'residente'
        and not exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and coalesce(p.es_menor, false) = true
        )
      )
    )
  )
);

create policy "tenant_proveedor_documento_requisitos_modify"
on public.proveedor_documento_requisitos
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_proveedor_documentos_modify"
on public.proveedor_documentos
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() in ('admin', 'seguridad'))
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() in ('admin', 'seguridad'))
);

create policy "tenant_ingresos_select"
on public.ingresos_guardia
for select
using (public.is_superadmin() or consorcio_id = public.current_consorcio_id());

create policy "tenant_ingresos_modify"
on public.ingresos_guardia
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() in ('admin', 'seguridad'))
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() in ('admin', 'seguridad'))
);

create policy "tenant_puntos_vigilancia_select"
on public.puntos_vigilancia
for select
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_profile_is_active())
);

create policy "tenant_puntos_vigilancia_modify"
on public.puntos_vigilancia
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

create policy "tenant_punto_vigilancia_guardias_select"
on public.punto_vigilancia_guardias
for select
using (
  public.is_superadmin()
  or (
    consorcio_id = public.current_consorcio_id()
    and public.current_role() in ('admin', 'seguridad')
  )
);

create policy "tenant_punto_vigilancia_guardias_modify"
on public.punto_vigilancia_guardias
for all
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
)
with check (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
);

insert into storage.buckets (id, name, public)
values
  ('expense-comprobantes', 'expense-comprobantes', true),
  ('consorcio-documents', 'consorcio-documents', true),
  ('operations-media', 'operations-media', true)
on conflict (id) do nothing;

create policy "expense_files_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-comprobantes'
  and public.current_role() = 'admin'
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);

create policy "expense_files_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-comprobantes'
  and public.current_role() = 'admin'
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
)
with check (
  bucket_id = 'expense-comprobantes'
  and public.current_role() = 'admin'
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);

create policy "expense_files_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-comprobantes'
  and public.current_role() = 'admin'
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);

create policy "document_files_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'consorcio-documents'
  and public.current_role() = 'admin'
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);

create policy "document_files_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'consorcio-documents'
  and public.current_role() = 'admin'
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
)
with check (
  bucket_id = 'consorcio-documents'
  and public.current_role() = 'admin'
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);

create policy "document_files_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'consorcio-documents'
  and public.current_role() = 'admin'
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);

create policy "operations_files_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'operations-media'
  and public.current_role() in ('admin', 'residente')
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);

create policy "operations_files_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'operations-media'
  and public.current_role() in ('admin', 'residente')
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
)
with check (
  bucket_id = 'operations-media'
  and public.current_role() in ('admin', 'residente')
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);

create policy "operations_files_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'operations-media'
  and public.current_role() in ('admin', 'residente')
  and (storage.foldername(name))[1] = public.current_consorcio_id()::text
);