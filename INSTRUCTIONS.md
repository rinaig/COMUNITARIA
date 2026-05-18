# Comunitaria Master Blueprint

## Contexto

Desarrollar un SaaS multi-tenant para gestion de consorcios y barrios privados en Argentina. El objetivo principal es eficiencia operativa, transparencia documental y mejor experiencia para residentes, administradores y seguridad.

## Stack objetivo

- Next.js 16+ con App Router
- TypeScript
- Tailwind CSS 4
- Supabase para Auth, PostgreSQL y Storage
- PWA instalable en moviles

## Reglas de arquitectura

- Toda tabla operativa debe incluir consorcio_id.
- La separacion entre tenants debe reforzarse con Row Level Security en Supabase.
- Deben existir cuatro roles: superadmin, admin, residente y seguridad.
- La UI debe ser mobile-first, clara y con pocas acciones por pantalla.

## Modulos MVP

1. Reservas de amenities con bloqueo de horarios y limite por unidad.
2. Tablon de anuncios del consorcio.
3. Reclamos con flujo de estados y historial.
4. Documentacion de reglamentos y liquidaciones.
5. Carga y transparencia de gastos con comprobantes.
6. Autorizacion de visitas y control de proveedores con ART/seguro.
7. Auth real con Email, Google y onboarding por codigo de invitacion.

## Diferenciales comerciales

- Transparencia radical: cada gasto con comprobante.
- Menos caos por WhatsApp: tickets, anuncios e historial unificado.
- Seguridad operativa: QR para visitas y bloqueo por documentacion vencida.

## Orden sugerido de implementacion

1. Aprobacion administrativa de altas y guardas por rol.
2. Persistencia real con Supabase y RLS.
3. Dashboard administrativo con gastos y comprobantes.
4. Reservas y reglas de negocio.
5. Reclamos y tablero operativo.
6. Seguridad, proveedores y accesos.