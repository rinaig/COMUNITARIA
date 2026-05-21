export const HOME_CONTENT_STORAGE_KEY = "comunitaria.home.content.preview.v1";

export type HomeModuleId =
  | "reservas"
  | "reclamos"
  | "expensas"
  | "seguridad"
  | "operacion"
  | "eficiencia";

export type HomeModuleContent = {
  id: HomeModuleId;
  title: string;
  description: string;
  summary: string;
  detailTitle: string;
  details: string[];
  image: string;
  alt: string;
};

export type HomeContentConfig = {
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  heroPanelEyebrow: string;
  heroPanelTitle: string;
  welcomeEyebrow: string;
  welcomeTitle: string;
  welcomeDescription: string;
  modulesSectionEyebrow: string;
  modulesSectionTitle: string;
  modules: HomeModuleContent[];
};

export const HOME_IMAGE_OPTIONS = [
  { label: "Presentacion 1", value: "/media/flyers/presentacion-1.png" },
  { label: "Presentacion 2", value: "/media/flyers/presentacion-2.png" },
  { label: "Presentacion 3", value: "/media/flyers/presentacion-3.png" },
  { label: "Consorcio integrado 1", value: "/media/flyers/consorcio-integrado-1.png" },
  { label: "Consorcio integrado 2", value: "/media/flyers/consorcio-integrado-2.png" },
  { label: "Reservas", value: "/media/flyers/reservas.png" },
  { label: "Reclamos", value: "/media/flyers/reclamos-1.png" },
  { label: "Reclamos alternativo", value: "/media/flyers/reclamos-2.png" },
  { label: "Transparencia financiera", value: "/media/flyers/transparencia-financiera.png" },
  { label: "Ingreso seguridad", value: "/media/flyers/ingreso-seguridad.png" },
  { label: "Ahorro energetico", value: "/media/flyers/ahorro-energia.png" },
] as const;

const DEFAULT_HOME_CONTENT: HomeContentConfig = {
  heroEyebrow: "Plataforma operativa para consorcios y barrios privados",
  heroTitle: "Gestion simple para consorcios, barrios privados y countries.",
  heroDescription: "Comunitaria unifica administracion, residentes, seguridad, amenities, reclamos, expensas, proveedores y comunicaciones en una misma plataforma con perfiles claros y datos aislados por consorcio.",
  heroPanelEyebrow: "Vision integral del producto",
  heroPanelTitle: "Una sola plataforma para gestionar expensas, accesos, reclamos, reservas y seguimiento comercial.",
  welcomeEyebrow: "Bienvenido",
  welcomeTitle: "Bienvenido a Comunitaria.",
  welcomeDescription: "Este acceso inicial aparece una sola vez y te permite ingresar de inmediato o recorrer primero los modulos clave del producto.",
  modulesSectionEyebrow: "Modulos operativos del producto",
  modulesSectionTitle: "Toca cada modulo para desplegar el detalle de como funciona dentro del proyecto general.",
  modules: [
    {
      id: "reservas",
      title: "Reserva de amenities y espacios comunes",
      description: "Agenda visual, reglas por espacio y aprobaciones cuando el edificio lo necesita.",
      summary: "Este modulo organiza SUM, pileta, quincho o canchas con reglas operativas claras.",
      detailTitle: "Como opera este modulo",
      details: [
        "Cada amenity puede tener cupos, topes mensuales, anticipacion minima y ventanas horarias propias.",
        "El administrador define si una reserva entra directa o si requiere revision manual antes de confirmarse.",
        "El residente ve disponibilidad real, evita superposiciones y recibe trazabilidad completa del pedido.",
      ],
      image: "/media/flyers/reservas.png",
      alt: "Flyer de reservas",
    },
    {
      id: "reclamos",
      title: "Reclamos y mantenimiento con seguimiento",
      description: "Tickets operativos, estados visibles y seguimiento real hasta el cierre.",
      summary: "Convierte incidentes dispersos en tickets ordenados con historial y responsables visibles.",
      detailTitle: "Como opera este modulo",
      details: [
        "Los reclamos se registran con titulo, descripcion, categoria, adjuntos y visibilidad segun el tipo de incidente.",
        "Administracion puede priorizar, actualizar estados y dejar trazabilidad para evitar duplicados o perdida de contexto.",
        "El vecino y la guardia ven el avance del caso sin depender de mensajes informales por fuera del sistema.",
      ],
      image: "/media/flyers/reclamos-1.png",
      alt: "Flyer de reclamos",
    },
    {
      id: "expensas",
      title: "Expensas y transparencia financiera",
      description: "Expensas, comprobantes y estados en una vista mas clara para residentes y administracion.",
      summary: "Da visibilidad al frente economico del consorcio con informacion mas facil de leer y justificar.",
      detailTitle: "Como opera este modulo",
      details: [
        "El administrador publica documentos, comprobantes, periodos de liquidacion y enlaces de pago dentro del portal.",
        "El residente consulta importes, vencimientos y respaldo documental sin pedir archivos por canales externos.",
        "Tambien soporta cargos de plataforma y seguimiento comercial dentro del circuito operativo general.",
      ],
      image: "/media/flyers/transparencia-financiera.png",
      alt: "Flyer de transparencia financiera",
    },
    {
      id: "seguridad",
      title: "Seguridad, QR y control de accesos",
      description: "Cabina, QR activo, puestos y validaciones desde el rol de seguridad.",
      summary: "Lleva al puesto de guardia una vista clara para ingresos, visitas, proveedores y movimientos diarios.",
      detailTitle: "Como opera este modulo",
      details: [
        "Cada puesto de vigilancia puede operar visitas autorizadas, ingresos de proveedores y validaciones documentales.",
        "El sistema cruza QR, datos del visitante, estado del acceso y observaciones antes de registrar el ingreso.",
        "Seguridad trabaja con puestos, asignaciones y trazabilidad sin depender de planillas manuales.",
      ],
      image: "/media/flyers/ingreso-seguridad.png",
      alt: "Flyer de ingreso de seguridad",
    },
    {
      id: "operacion",
      title: "Operacion integral del consorcio",
      description: "Todo el circuito operativo conectado en un mismo sistema multi-consorcio.",
      summary: "Explica la idea central del producto: unificar administracion, vecino y guardia en la misma plataforma.",
      detailTitle: "Como opera este modulo",
      details: [
        "El mismo tenant concentra onboarding, aprobaciones, reservas, reclamos, expensas, proveedores y outbound.",
        "Los datos quedan aislados por consorcio y cada rol entra solo al alcance que le corresponde mediante RLS.",
        "SuperUser puede supervisar el conjunto y ahora tambien abrir demos locales para mostrar el producto sin tocar produccion.",
      ],
      image: "/media/flyers/consorcio-integrado-2.png",
      alt: "Flyer de consorcio integrado",
    },
    {
      id: "eficiencia",
      title: "Ahorro energetico y eficiencia operativa",
      description: "Tambien queda cubierto el frente de consumo, seguimiento y ahorro energetico previsto para la plataforma.",
      summary: "Representa la linea de evolucion del producto sobre consumo, medicion y eficiencia del complejo.",
      detailTitle: "Como opera este modulo",
      details: [
        "El enfoque contempla tableros de seguimiento para consumos, desvio operativo y oportunidades de ahorro.",
        "Sirve como frente comercial para mostrar que Comunitaria no solo ordena gestion sino tambien control y eficiencia.",
        "Queda alineado con la arquitectura multi-modulo del sistema para crecer sin romper la operacion actual.",
      ],
      image: "/media/flyers/ahorro-energia.png",
      alt: "Flyer de ahorro de energia",
    },
  ],
};

export function getDefaultHomeContent() {
  return structuredClone(DEFAULT_HOME_CONTENT);
}

export function normalizeHomeContent(input: Partial<HomeContentConfig> | null | undefined): HomeContentConfig {
  const defaults = getDefaultHomeContent();
  const inputModules = Array.isArray(input?.modules) ? input.modules : [];

  return {
    heroEyebrow: input?.heroEyebrow?.trim() || defaults.heroEyebrow,
    heroTitle: input?.heroTitle?.trim() || defaults.heroTitle,
    heroDescription: input?.heroDescription?.trim() || defaults.heroDescription,
    heroPanelEyebrow: input?.heroPanelEyebrow?.trim() || defaults.heroPanelEyebrow,
    heroPanelTitle: input?.heroPanelTitle?.trim() || defaults.heroPanelTitle,
    welcomeEyebrow: input?.welcomeEyebrow?.trim() || defaults.welcomeEyebrow,
    welcomeTitle: input?.welcomeTitle?.trim() || defaults.welcomeTitle,
    welcomeDescription: input?.welcomeDescription?.trim() || defaults.welcomeDescription,
    modulesSectionEyebrow: input?.modulesSectionEyebrow?.trim() || defaults.modulesSectionEyebrow,
    modulesSectionTitle: input?.modulesSectionTitle?.trim() || defaults.modulesSectionTitle,
    modules: defaults.modules.map((defaultModule) => {
      const incoming = inputModules.find((item) => item?.id === defaultModule.id);
      return {
        ...defaultModule,
        title: incoming?.title?.trim() || defaultModule.title,
        description: incoming?.description?.trim() || defaultModule.description,
        summary: incoming?.summary?.trim() || defaultModule.summary,
        detailTitle: incoming?.detailTitle?.trim() || defaultModule.detailTitle,
        details: Array.isArray(incoming?.details) && incoming.details.length > 0
          ? incoming.details.map((detail) => detail.trim()).filter(Boolean)
          : defaultModule.details,
        image: incoming?.image?.trim() || defaultModule.image,
        alt: incoming?.alt?.trim() || defaultModule.alt,
      };
    }),
  };
}