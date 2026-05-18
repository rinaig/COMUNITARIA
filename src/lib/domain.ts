export type AppRole = "superadmin" | "admin" | "residente" | "seguridad";
export type DemoRole = Exclude<AppRole, "superadmin">;

export type Metric = {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning";
};

export type BoardItem = {
  title: string;
  description: string;
  status: string;
};

export type RecordRow = {
  primary: string;
  secondary: string;
  state: string;
  date: string;
};

export type RoleDashboard = {
  eyebrow: string;
  title: string;
  intro: string;
  stats: Metric[];
  priorities: BoardItem[];
  communications: BoardItem[];
  records: RecordRow[];
  recordsTitle: string;
  recordsHint: string;
};

export type ReservationRecord = {
  id: string;
  consorcioId: string;
  unitId: string;
  amenityId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  residentName: string;
};

export const dashboardRoles: AppRole[] = [
  "superadmin",
  "admin",
  "residente",
  "seguridad",
];

export const demoRoles: DemoRole[] = ["admin", "residente", "seguridad"];

export const roleLabels: Record<AppRole, string> = {
  superadmin: "SuperAdmin",
  admin: "Administrador",
  residente: "Residente",
  seguridad: "Seguridad",
};

export const tenantSnapshot = {
  id: "cons-alvear",
  code: "ALVEAR-2026",
  name: "Consorcio Torre Alvear",
  address: "Av. del Libertador 4120, CABA",
  units: 48,
  admins: 2,
  residents: 132,
  plan: "Plan Barrio Premium",
};

export const platformHighlights = [
  {
    title: "Aislamiento de datos por consorcio",
    description:
      "Cada tabla se modela con consorcio_id y politicas RLS para impedir cruces de informacion.",
  },
  {
    title: "Portal por rol",
    description:
      "Administrador, Residente y Seguridad ven solo lo necesario para operar dentro del consorcio.",
  },
  {
    title: "Transparencia con comprobantes",
    description:
      "Gastos, documentos y liquidaciones preparados para adjuntar PDFs o imagenes desde Storage.",
  },
  {
    title: "Operaciones diarias",
    description:
      "Reservas, reclamos, anuncios, visitas y proveedores se consolidan en un flujo trazable.",
  },
];

export const onboardingSteps = [
  "Administrador crea el consorcio y obtiene un codigo de invitacion unico.",
  "Residente se registra con email o Google, carga el codigo y queda pendiente.",
  "Administrador aprueba el alta y asigna la unidad funcional correspondiente.",
  "Seguridad o encargado operan ingresos y proveedores desde un portal simplificado.",
];

export const platformDemoSummary = {
  activeConsorcios: 18,
  activeAdmins: 26,
  pendingAdmins: 5,
  totalUsers: 1342,
  monthlyGrowth: "+11%",
};

export const platformDemoAccounts = [
  {
    id: "plt-1",
    adminName: "Marina Costa",
    company: "Costa Administraciones",
    consorcio: "Torre Alvear",
    city: "CABA",
    usersCount: 132,
    status: "Activo",
    plan: "Premium",
  },
  {
    id: "plt-2",
    adminName: "Estudio Roldan",
    company: "Roldan & Asociados",
    consorcio: "Barrio Los Fresnos",
    city: "Pilar",
    usersCount: 218,
    status: "Onboarding",
    plan: "Barrio",
  },
  {
    id: "plt-3",
    adminName: "Paula Iriarte",
    company: "Iriarte Gestion Urbana",
    consorcio: "Edificio Libertad 820",
    city: "Rosario",
    usersCount: 76,
    status: "Activo",
    plan: "Base",
  },
  {
    id: "plt-4",
    adminName: "Grupo Delta",
    company: "Delta Property Services",
    consorcio: "Complejo Las Tipas",
    city: "Nordelta",
    usersCount: 304,
    status: "Expansion",
    plan: "Premium",
  },
];

export const platformDemoNotes = [
  "La consola interna muestra administradores, consorcios y volumen agregado de usuarios, sin exponer residentes individuales.",
  "El seguimiento de pagos y facturacion queda reservado para una integracion posterior con el panel real del operador.",
  "La demo comercial mantiene datos ficticios realistas para que un cliente recorra la experiencia como si ya estuviera operativa.",
];

export const sampleReservations: ReservationRecord[] = [
  {
    id: "res-1",
    consorcioId: tenantSnapshot.id,
    unitId: "UF-4B",
    amenityId: "sum",
    date: "2026-05-22",
    startsAt: "18:00",
    endsAt: "21:00",
    residentName: "Juan Perez",
  },
  {
    id: "res-2",
    consorcioId: tenantSnapshot.id,
    unitId: "UF-4B",
    amenityId: "sum",
    date: "2026-05-10",
    startsAt: "12:00",
    endsAt: "15:00",
    residentName: "Juan Perez",
  },
  {
    id: "res-3",
    consorcioId: tenantSnapshot.id,
    unitId: "UF-7A",
    amenityId: "parrilla",
    date: "2026-05-18",
    startsAt: "20:00",
    endsAt: "23:00",
    residentName: "Laura Rossi",
  },
];

export const roleDashboards: Record<AppRole, RoleDashboard> = {
  superadmin: {
    eyebrow: "Vista global del SaaS",
    title: "Operacion multi-consorcio y expansion comercial",
    intro:
      "Panel para gestionar onboarding de nuevas administraciones, salud operativa del producto y expansion por cartera.",
    stats: [
      { label: "Consorcios activos", value: "18", detail: "+3 este trimestre", tone: "success" },
      { label: "MRR estimado", value: "$ 4.8M", detail: "Facturacion recurrente mensual", tone: "success" },
      { label: "Altas pendientes", value: "7", detail: "Administradores en onboarding", tone: "warning" },
      { label: "Riesgo de churn", value: "2", detail: "Clientes con bajo uso", tone: "warning" },
    ],
    priorities: [
      {
        title: "Activar 4 edificios de Rosario",
        description: "Migracion inicial de unidades y configuracion de categorias por defecto.",
        status: "En onboarding",
      },
      {
        title: "Cerrar beta con administracion de Palermo",
        description: "Presentar tablero de transparencia y KPI de reclamos resueltos.",
        status: "Demo comercial",
      },
      {
        title: "Ajustar plantillas de liquidacion",
        description: "Versionar resumen mensual y exportable de comprobantes por categoria.",
        status: "Producto",
      },
    ],
    communications: [
      {
        title: "4 solicitudes de soporte premium",
        description: "Dos ligadas a QR de invitados y dos a carga masiva de unidades.",
        status: "Soporte",
      },
      {
        title: "Alertas de proveedores vencidos",
        description: "Cinco barrios privados tienen ART criticas esta semana.",
        status: "Riesgo legal",
      },
      {
        title: "Campana LinkedIn activa",
        description: "Prospectos nuevos en CABA, Cordoba y Rosario para administradores.",
        status: "Ventas",
      },
    ],
    records: [
      { primary: "Edificio Mirador", secondary: "31 unidades", state: "Onboarding", date: "Alta 17 mayo" },
      { primary: "Barrio Los Fresnos", secondary: "Control ART premium", state: "Activo", date: "Renovacion 31 mayo" },
      { primary: "Torre Alvear", secondary: "132 residentes", state: "Salud alta", date: "Uso 92%" },
    ],
    recordsTitle: "Cartera prioritaria",
    recordsHint: "Concentrar ventas por administracion permite captar varios edificios en un solo acuerdo.",
  },
  admin: {
    eyebrow: "Operacion del consorcio",
    title: "Control diario de reservas, reclamos y gastos",
    intro:
      "Vista del administrador para centralizar procesos, aprobar vecinos pendientes y reducir consultas operativas repetidas.",
    stats: [
      { label: "Reclamos abiertos", value: "12", detail: "4 en reparacion", tone: "warning" },
      { label: "Reservas del mes", value: "84", detail: "SUM concentra el 44%", tone: "success" },
      { label: "Vecinos pendientes", value: "6", detail: "Solicitudes por codigo", tone: "warning" },
      { label: "Gastos cargados", value: "$ 12.4M", detail: "100% con comprobante", tone: "success" },
    ],
    priorities: [
      {
        title: "Aprobar 6 residentes nuevos",
        description: "Validar unidad funcional y telefono antes de habilitar acceso.",
        status: "Pendiente",
      },
      {
        title: "Bloquear SUM por mantenimiento",
        description: "Cierre del 24 al 26 de mayo por pintura y revision electrica.",
        status: "Configurar",
      },
      {
        title: "Publicar liquidacion abril",
        description: "Adjuntar PDF, enlace de pago y grafico por categoria.",
        status: "Finanzas",
      },
    ],
    communications: [
      {
        title: "Aviso de corte de agua",
        description: "Mantenimiento de bombas, manana de 10 a 12 hs.",
        status: "Anuncio",
      },
      {
        title: "Proveedor con ART por vencer",
        description: "Jardineria Verde Sur vence el 18 de mayo.",
        status: "Legal",
      },
      {
        title: "2 reclamos duplicados fusionados",
        description: "Iluminacion de pasillo cuarto piso ya vinculada a ticket principal.",
        status: "Mantenimiento",
      },
    ],
    records: [
      { primary: "Luz quemada piso 4", secondary: "Area comun", state: "En reparacion", date: "Actualizado hoy" },
      { primary: "Reserva SUM 22/05", secondary: "UF-4B · Juan Perez", state: "Confirmada", date: "18:00 a 21:00" },
      { primary: "Liquidacion abril", secondary: "PDF y comprobantes", state: "Lista para publicar", date: "Cierre mensual" },
    ],
    recordsTitle: "Tablero operativo",
    recordsHint: "La visibilidad compartida evita reclamos duplicados y reduce llamadas de seguimiento.",
  },
  residente: {
    eyebrow: "Experiencia del vecino",
    title: "Acceso rapido a reservas, anuncios, expensas y visitas",
    intro:
      "Portal simple, mobile-first y con acciones concretas para resolver la vida diaria del residente sin depender del chat del edificio.",
    stats: [
      { label: "Proxima reserva", value: "22 mayo", detail: "SUM 18:00 a 21:00", tone: "success" },
      { label: "Reclamos activos", value: "2", detail: "1 pendiente y 1 en proceso", tone: "warning" },
      { label: "Documentos nuevos", value: "3", detail: "Liquidacion + reglamento actualizado", tone: "success" },
      { label: "Visitas cargadas", value: "4", detail: "1 QR pendiente de uso", tone: "default" },
    ],
    priorities: [
      {
        title: "Reservar parrilla para el sabado",
        description: "El sistema controla solapamientos y limite mensual por unidad.",
        status: "Autoservicio",
      },
      {
        title: "Seguir ticket de ascensor",
        description: "Cambios de estado visibles sin tener que escribir a la administracion.",
        status: "Seguimiento",
      },
      {
        title: "Descargar expensas abril",
        description: "PDF disponible con detalle y acceso a comprobantes cargados.",
        status: "Documentacion",
      },
    ],
    communications: [
      {
        title: "Mantenimiento de bombas",
        description: "Se anuncia corte de agua de 10 a 12 hs y plan de contingencia.",
        status: "Anuncio",
      },
      {
        title: "Nuevo reglamento de pileta",
        description: "Se exige aceptar normas antes de confirmar la reserva.",
        status: "Normativa",
      },
      {
        title: "Expensas disponibles",
        description: "Liquidacion de abril publicada con botones de descarga y pago.",
        status: "Finanzas",
      },
    ],
    records: [
      { primary: "Ticket #204", secondary: "Luz hall cuarto piso", state: "En proceso", date: "Ultimo cambio ayer" },
      { primary: "QR visita", secondary: "Ana Gomez · DNI 28123456", state: "Vigente", date: "Hoy 20:30" },
      { primary: "Expensas abril", secondary: "PDF + enlace de pago", state: "Disponible", date: "Vencen 20 mayo" },
    ],
    recordsTitle: "Actividad de tu unidad",
    recordsHint: "Las acciones mas usadas quedan en primer plano para que la experiencia sea clara incluso en celular.",
  },
  seguridad: {
    eyebrow: "Control de accesos",
    title: "Visitas, proveedores y alertas documentales en una sola vista",
    intro:
      "Pantalla simplificada para guardia o encargado, pensada para operar rapido desde tablet o celular sin navegar modulos complejos.",
    stats: [
      { label: "Visitas autorizadas", value: "26", detail: "11 con QR vigente hoy", tone: "success" },
      { label: "Proveedores activos", value: "8", detail: "2 con documentacion critica", tone: "warning" },
      { label: "Ingresos registrados", value: "43", detail: "Ultimas 24 horas", tone: "default" },
      { label: "Bloqueos automativos", value: "2", detail: "ART vencida", tone: "warning" },
    ],
    priorities: [
      {
        title: "Validar QR de invitado",
        description: "Ingreso de visita a UF-12C sin llamada telefonica a porteria.",
        status: "Ingreso",
      },
      {
        title: "Retener proveedor sin ART",
        description: "Pinturas Delta no puede ingresar hasta subir seguro vigente.",
        status: "Bloqueado",
      },
      {
        title: "Registrar entrega programada",
        description: "Paqueteria y encomiendas asociadas a unidad funcional.",
        status: "Recepcion",
      },
    ],
    communications: [
      {
        title: "Guardia nocturna reforzada",
        description: "Evento en SUM con alta concurrencia entre 21 y 01 hs.",
        status: "Operativo",
      },
      {
        title: "Documento vencido detectado",
        description: "Seguro proveedor Jardineria Verde Sur vencido desde ayer.",
        status: "Alerta roja",
      },
      {
        title: "Entrega de materiales",
        description: "Ingreso autorizado para contratista de ascensores a las 15 hs.",
        status: "Agenda",
      },
    ],
    records: [
      { primary: "Ana Gomez", secondary: "Visita a UF-12C", state: "QR valido", date: "Hoy 20:30" },
      { primary: "Jardineria Verde Sur", secondary: "Proveedor frecuente", state: "ART vencida", date: "Bloquear ingreso" },
      { primary: "Tecnico ascensor", secondary: "Mantenimiento programado", state: "Preautorizado", date: "Hoy 15:00" },
    ],
    recordsTitle: "Control de ingresos",
    recordsHint: "El objetivo es reducir llamadas y dejar trazabilidad de cada acceso o rechazo.",
  },
};