with nuevo_consorcio as (
  insert into public.consorcios (nombre, direccion, cuit, codigo_invitacion, cantidad_unidades)
  values (
    'Consorcio Torre Alvear',
    'Av. del Libertador 4120, CABA',
    '30-71234567-9',
    'ALVEAR-2026',
    48
  )
  on conflict (codigo_invitacion) do update
    set nombre = excluded.nombre
  returning id
)
insert into public.categorias_gastos (consorcio_id, nombre, descripcion)
select id, categoria.nombre, categoria.descripcion
from nuevo_consorcio
cross join (
  values
    ('Sueldos', 'Encargados, seguridad y cargas sociales'),
    ('Servicios Publicos', 'Edenor, Aysa, Metrogas y similares'),
    ('Abonos Fijos', 'Ascensores, matafuegos, tanques, monitoreo'),
    ('Mantenimiento', 'Electricista, plomeria, cerrajeria y pintura'),
    ('Seguros', 'Integral de consorcio, ART y vida obligatorio'),
    ('Administrativos', 'Honorarios, bancos y papeleria'),
    ('Extraordinarios', 'Fondo de reserva, obras grandes y juicios')
) as categoria(nombre, descripcion)
on conflict (consorcio_id, nombre) do nothing;

with consorcio as (
  select id from public.consorcios where codigo_invitacion = 'ALVEAR-2026' limit 1
)
insert into public.amenities (consorcio_id, nombre, capacidad, hora_apertura, hora_cierre)
select id, amenity.nombre, amenity.capacidad, amenity.apertura, amenity.cierre
from consorcio
cross join (
  values
    ('SUM', 40, '09:00'::time, '23:00'::time),
    ('Parrilla', 12, '11:00'::time, '23:00'::time),
    ('Cancha', 8, '08:00'::time, '22:00'::time)
) as amenity(nombre, capacidad, apertura, cierre)
on conflict (consorcio_id, nombre) do nothing;

with consorcio as (
  select id from public.consorcios where codigo_invitacion = 'ALVEAR-2026' limit 1
)
insert into public.anuncios (consorcio_id, titulo, contenido, prioridad)
select
  id,
  'Corte de agua programado',
  'Mantenimiento de bombas de 10 a 12 hs. Se recomienda hacer reserva previa de agua.',
  2
from consorcio
where not exists (
  select 1 from public.anuncios where titulo = 'Corte de agua programado' and consorcio_id = consorcio.id
);