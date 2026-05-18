# Comunitaria

Comunitaria es una base profesional para un SaaS multi-tenant de gestion de consorcios y barrios privados en Argentina. El proyecto arranca con Next.js 16, App Router, Tailwind CSS 4, capa preparada para Supabase y una PWA instalable.

## Lo que ya queda resuelto

- Landing corporativa orientada a administradores de consorcios.
- Portal demo por rol: Administrador, Residente y Seguridad.
- Consola interna demo de plataforma para seguimiento agregado de administradores y usuarios.
- Motor de validacion de reservas con bloqueo por superposicion y limite mensual por unidad.
- Manifest, icono y service worker basico para instalacion como PWA.
- Esquema SQL para Supabase con enfoque multi-tenant y politicas RLS base.
- Capa de entorno y cliente para conectar la app a Supabase cuando cargues credenciales reales.
- Hub de autenticacion con login, Google OAuth y onboarding por codigo de consorcio.

## Stack

- Next.js 16 con App Router
- React 19
- Tailwind CSS 4
- TypeScript 5
- Supabase JS 2

## Rutas principales

- /
- /portal
- /portal/admin
- /portal/residente
- /portal/seguridad
- /portal/plataforma
- /auth

## Estructura clave

- src/app: rutas y layout global
- src/components: shell del portal y registro PWA
- src/lib/domain.ts: datos de dominio demo y configuracion de roles
- src/lib/reservations.ts: reglas del modulo de reservas
- src/lib/supabase.ts: factory del cliente Supabase
- supabase/schema.sql: modelo de datos multi-tenant
- supabase/seed.sql: datos base para categorias y espacios

## Variables de entorno

Crear un archivo .env.local tomando como base .env.example.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Desarrollo local

```bash
cd COMUNITARIA
npm install
npm run dev
```

Abrir http://localhost:3000.

## GitHub y Supabase

Este proyecto ya esta listo para trabajar con un flujo versionado de base de datos:

- El esquema actual tambien quedo guardado como migracion inicial en supabase/migrations/20260518120000_initial_schema.sql.
- La configuracion base de Supabase CLI vive en supabase/config.toml.
- Hay un workflow en .github/workflows/supabase-db-push.yml para ejecutar `supabase db push` cuando subas cambios a main.
- Hay un workflow adicional en .github/workflows/outbound-queue.yml que procesa automaticamente la cola saliente cada 15 minutos y tambien puede lanzarse manualmente.

### Que conviene hacer ahora

Conviene hacerlo ahora y no al final. Gran parte del valor del producto ya depende de Supabase real: autenticacion, demo tenants, reservas, reclamos, chat, aprobaciones y notificaciones. Si esperas al final, vas a seguir viendo solo la capa visual y vas a retrasar validaciones importantes.

### Que falta para conectarlo a GitHub

1. Crear un repositorio en GitHub.
2. Agregarlo como remoto de este repo local.
3. Hacer el primer push a main.
4. En GitHub > Settings > Secrets and variables > Actions crear estos secrets:
	- SUPABASE_ACCESS_TOKEN
	- SUPABASE_PROJECT_ID
	- SUPABASE_DB_PASSWORD
	- SUPABASE_SERVICE_ROLE_KEY
5. Reemplazar el project_id de supabase/config.toml por el id real del proyecto Supabase.

### Comandos locales para dejarlo enlazado

```bash
cd COMUNITARIA
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git add .
git commit -m "chore: bootstrap comunitaria"
git push -u origin main
```

### Como obtener los datos para los secrets

- SUPABASE_PROJECT_ID: aparece en la URL del dashboard del proyecto y en Project Settings.
- SUPABASE_DB_PASSWORD: es la password que definiste al crear el proyecto.
- SUPABASE_ACCESS_TOKEN: se genera en https://supabase.com/dashboard/account/tokens.
- SUPABASE_SERVICE_ROLE_KEY: se obtiene en Supabase > Project Settings > Data API junto con la anon key; este secret lo usa el workflow de procesamiento automatico de notificacion_salidas.

## Validaciones

```bash
npm run lint
npm run typecheck
npm run build
```

## Conectar Supabase

### Paso a paso completo

1. Crear un proyecto nuevo en Supabase.
2. Ir a Project Settings > Data API y copiar:
	- Project URL
	- anon public key
	- service_role secret key
3. En COMUNITARIA crear .env.local con esos 3 valores.
4. En el SQL Editor ejecutar completo el archivo supabase/schema.sql.
5. En el SQL Editor ejecutar luego supabase/seed.sql.
6. Verificar que el schema haya creado automaticamente:
	- tablas de negocio y RPCs
	- buckets de Storage expense-comprobantes, consorcio-documents y operations-media
	- politicas RLS para tablas y Storage
7. En Authentication > Sign In / Providers habilitar al menos Email.
8. Si vas a usar Google OAuth, habilitar Google y cargar redirect URL apuntando a tu dominio local o productivo.
9. En Authentication > URL Configuration definir:
	- Site URL: http://localhost:3000
	- Redirect URLs: http://localhost:3000/auth
10. Iniciar la app desde la carpeta COMUNITARIA con npm run dev.
11. Abrir http://localhost:3000 y entrar por /auth.
12. Crear un usuario admin en modo demo desde la landing con “Probar gratis hasta 3 unidades”.
13. Una vez dentro del portal admin, probar estos modulos nuevos:
	- integraciones de email y WhatsApp
	- bandeja operativa de salidas
	- precios/cargos de plataforma
	- importacion de unidades con limite demo
14. Para que el procesador real de la cola funcione en local, la variable SUPABASE_SERVICE_ROLE_KEY debe estar cargada; sin eso el endpoint /api/outbound/process no puede despachar pendientes.
15. Para que los envios reales funcionen, dentro del portal admin cargar credenciales del proveedor por consorcio:
	- Email: hoy el procesador soporta Resend
	- WhatsApp: hoy el procesador soporta Meta WhatsApp Cloud API

### Que deberias ver en localhost

- Si no configuraste Supabase, vas a seguir viendo solo la base visual y mensajes de entorno incompleto.
- Si configuraste Supabase pero no aplicaste schema.sql, faltaran tablas, RPCs y permisos.
- Si aplicaste schema + seed + .env.local, ya puedes probar onboarding real, chat por temas, moderacion de menores, reservas, visitas, reclamos, documentos, demo de 3 unidades y la cola operativa.
- Lo nuevo no aparece como una pagina publica separada: vive dentro del portal autenticado, sobre todo en /auth y /portal/admin.

### Orden recomendado de prueba

1. Crear cuenta demo admin.
2. Crear o importar hasta 3 unidades funcionales.
3. Configurar email y WhatsApp desde el portal admin.
4. Encolar una prueba desde la bandeja saliente.
5. Ejecutar “Procesar pendientes ahora”.
6. Probar chat de menor con aprobacion desde adulto responsable.

## Roadmap recomendado

1. Implementar aprobacion administrativa de altas pendientes y guardas por rol.
2. Persistir gastos, reclamos, reservas y visitas en PostgreSQL con Server Actions o Route Handlers.
3. Integrar Supabase Storage para comprobantes, reglamentos y liquidaciones PDF.
4. Incorporar notificaciones push o web notifications para anuncios, reservas y tickets.
5. Agregar carga masiva de unidades y vecinos por CSV/Excel.
