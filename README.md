# Comunitaria

Comunitaria es una plataforma de gestion para consorcios y barrios privados en Argentina. El proyecto corre sobre Next.js 16, App Router, Tailwind CSS 4, Supabase y una PWA instalable.

## Lo que ya queda resuelto

- Landing corporativa orientada a administradores de consorcios.
- Landing actualizada con flyers institucionales, modal de bienvenida en la primera visita y acceso directo a la plataforma.
- Portales reales por rol: Administrador, Residente, Seguridad y SuperUser.
- Modo test local desde SuperUser para mostrar recorridos demo de Administrador, Usuario y Seguridad sin tocar sesiones reales.
- Consola interna real de plataforma para seguimiento agregado de administradores, suscripciones y pagos.
- Configuracion publica de Home editable desde SuperUser: email, telefono, Instagram, X, Facebook y compatibilidad transitoria para LinkedIn.
- Seguimiento comercial real de administradores en prueba vencida sin pago, con exportacion de contacto.
- Motor de validacion de reservas con bloqueo por superposicion y limite mensual por unidad.
- Aprobacion administrativa real de altas pendientes y guard de acceso por estado de cuenta.
- Importacion de padron por CSV para residentes, administradores y seguridad con invitaciones por codigo, vencimiento y regeneracion.
- Onboarding por invitacion preservando unidad funcional para residentes y puesto de vigilancia para seguridad.
- Moderacion adulta de reservas, visitas y mensajes enviados por perfiles menores.
- Registro operativo de ingresos de proveedores con validacion documental.
- Lectura de notificaciones por perfil y trazabilidad reciente de plataforma con compatibilidad ante schema remoto desfasado.
- Manifest, icono y service worker basico para instalacion como PWA.
- Esquema SQL para Supabase con enfoque multi-tenant y politicas RLS base.
- Capa de entorno y cliente para conectar la app a Supabase cuando cargues credenciales reales.
- Hub de autenticacion con acceso por email/password y activacion por codigo administrado.

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
- /portal/demo/admin
- /portal/demo/residente
- /portal/demo/seguridad
- /auth

## Estructura clave

- src/app: rutas y layout global
- src/components: shell del portal y registro PWA
- src/lib/domain.ts: helpers de dominio y configuracion compartida
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

Conviene hacerlo ahora y no al final. Gran parte del valor del producto ya depende de Supabase real: autenticacion, consorcios, reservas, reclamos, chat, aprobaciones y notificaciones. Si esperas al final, vas a seguir viendo solo la capa visual y vas a retrasar validaciones importantes.

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
npm test
npm run lint
npm run typecheck
npm run build
```

Estado actual verificado: npm test, lint, typecheck y build pasan correctamente en el workspace local.

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
8. En Authentication > URL Configuration definir:
	- Site URL: http://localhost:3000
	- Redirect URLs: http://localhost:3000/auth
9. Iniciar la app desde la carpeta COMUNITARIA con npm run dev.
10. Abrir http://localhost:3000 y entrar por /auth.
11. Crear un usuario administrador y registrar el consorcio.
12. Una vez dentro del portal admin, probar estos modulos nuevos:
	- integraciones de email y WhatsApp
	- bandeja operativa de salidas
	- precios/cargos de plataforma
	- importacion de unidades con limite de prueba inicial
13. Para que el procesador real de la cola funcione en local, la variable SUPABASE_SERVICE_ROLE_KEY debe estar cargada; sin eso el endpoint /api/outbound/process no puede despachar pendientes.
14. Para que los envios reales funcionen, dentro del portal admin cargar credenciales del proveedor por consorcio:
	- Email: hoy el procesador soporta Resend
	- WhatsApp: hoy el procesador soporta Meta WhatsApp Cloud API

### Que deberias ver en localhost

- Si no configuraste Supabase, vas a seguir viendo solo la base visual y mensajes de entorno incompleto.
- Si configuraste Supabase pero no aplicaste schema.sql, faltaran tablas, RPCs y permisos.
- Si aplicaste schema + seed + .env.local, ya puedes probar onboarding real, chat por temas, moderacion de menores, reservas, visitas, reclamos, documentos y la cola operativa.
- Lo nuevo no aparece como una pagina publica separada: vive dentro del portal autenticado, sobre todo en /auth y /portal/admin.

### Orden recomendado de prueba

1. Crear cuenta administradora y registrar el consorcio.
2. Crear o importar unidades funcionales.
3. Configurar email y WhatsApp desde el portal admin.
4. Encolar una prueba desde la bandeja saliente.
5. Ejecutar “Procesar pendientes ahora”.
6. Probar chat de menor con aprobacion desde adulto responsable.

## Pendientes remotos o de integracion

1. Aplicar en la base remota las migraciones de Supabase que en local ya existen, especialmente las relacionadas con social links de plataforma, auditoria, validacion de proveedores, lecturas de notificaciones, regeneracion de codigos del padron y asignacion automatica de seguridad por puesto.
2. Ejecutar una validacion funcional completa contra Supabase real de los flujos criticos: alta admin, invitacion residente, invitacion seguridad, rechazo y reemision desde padron, aprobaciones, pagos, proveedores y cola saliente.
3. Configurar credenciales reales por entorno y por consorcio para despacho transaccional, en particular Resend o proveedor SMTP equivalente y Meta WhatsApp Cloud API donde corresponda.
4. Publicar o completar la configuracion operativa de GitHub Actions y Supabase remoto para despliegue de base y procesamiento de outbound sin intervencion manual.
5. Ampliar la cobertura automatizada mas alla de la base local actual. El repo ya incluye tests unitarios para copy trial, compatibilidad de schema y diagnostico server-side de Supabase, pero todavia faltan pruebas funcionales o end-to-end contra flujos completos.
6. Revisar documentacion operativa secundaria si existe material fuera de este README, para que onboarding, soporte comercial y despliegue reflejen el flujo actual cuando se conecte el entorno remoto.
