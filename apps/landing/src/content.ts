import {
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  Printer,
  ReceiptText,
  ScanBarcode,
  ShieldCheck,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Solo funciones que el sistema ya tiene (ver docs/). Sin cifras ni clientes inventados. */
export const benefits: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ScanBarcode,
    title: "Vendé más rápido",
    text: "Punto de venta con lector de código de barras, varios medios de pago en una misma venta y ticket al instante.",
  },
  {
    icon: CalendarClock,
    title: "Stock bajo control",
    text: "Stock por lote y vencimiento, venta por vencimiento más próximo y avisos de lotes por vencer.",
  },
  {
    icon: Wallet,
    title: "Caja ordenada",
    text: "Apertura y cierre de caja con efectivo esperado, contado y diferencias registradas.",
  },
  {
    icon: BarChart3,
    title: "Decidí con datos",
    text: "Reportes de ventas, ganancia estimada, medios de pago y productos, comparando con el período anterior.",
  },
];

export const features: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ReceiptText,
    title: "Punto de venta",
    text: "Búsqueda por nombre o código, descuentos, pagos mixtos y vuelto.",
  },
  {
    icon: FileText,
    title: "Facturación electrónica",
    text: "Conectado con ARCA: tus comprobantes salen con CAE y código QR.",
  },
  {
    icon: Printer,
    title: "Tickets térmicos",
    text: "Imprimí tickets al instante en tu impresora térmica.",
  },
  {
    icon: Boxes,
    title: "Inventario por lote",
    text: "Lotes, vencimientos, ajustes con motivo y movimientos trazables.",
  },
  {
    icon: Truck,
    title: "Compras y proveedores",
    text: "Pedidos, recepciones parciales y facturas de proveedores con vencimientos.",
  },
  {
    icon: CreditCard,
    title: "Cuentas corrientes",
    text: "Ventas a cuenta, cobros parciales, vencimientos y comprobante de cobro.",
  },
  {
    icon: Tags,
    title: "Listas de precios",
    text: "Varias listas, aumentos masivos y actualización de precios de referencia.",
  },
  {
    icon: Building2,
    title: "Varias sucursales",
    text: "Stock y caja por sucursal, transferencias entre sucursales y reportes de todas.",
  },
  {
    icon: Users,
    title: "Usuarios y permisos",
    text: "Roles con permisos a medida y acceso por sucursal.",
  },
];

export const steps: { title: string; text: string }[] = [
  {
    title: "Contactanos",
    text: "Te mostramos el sistema funcionando con datos de ejemplo.",
  },
  {
    title: "Preparamos tu farmacia",
    text: "Creamos tu cuenta y te ayudamos a cargar productos, precios y usuarios.",
  },
  {
    title: "Capacitación",
    text: "Acompañamos a tu equipo en las primeras ventas y cierres de caja.",
  },
  {
    title: "Empezás a vender",
    text: "Desde cualquier computadora con navegador, en una o varias sucursales.",
  },
];

export const trust: { icon: LucideIcon; text: string }[] = [
  { icon: ShieldCheck, text: "Cada farmacia ve solo sus datos" },
  { icon: Users, text: "Permisos por rol y por sucursal" },
  { icon: Building2, text: "En la nube, sin instalar servidores" },
];

export const faqs: { question: string; answer: string }[] = [
  {
    question: "¿Tengo que instalar algo?",
    answer:
      "No. Funciona en el navegador de cualquier computadora con internet. En Chrome o Edge también se puede instalar como aplicación.",
  },
  {
    question: "¿Sirve para varias sucursales?",
    answer:
      "Sí. Cada sucursal tiene su stock y su caja, se pueden transferir productos entre sucursales y los reportes muestran todas juntas o por separado.",
  },
  {
    question: "¿Emite factura electrónica?",
    answer:
      "Sí. El sistema está conectado con ARCA y emite tus comprobantes con CAE y código QR. También emite tickets internos.",
  },
  {
    question: "¿Funciona sin internet?",
    answer:
      "No. El sistema trabaja en línea para que el stock, la caja y las ventas estén siempre al día en todas las computadoras.",
  },
  {
    question: "¿Qué impresora necesito?",
    answer:
      "Para tickets, una impresora térmica. Los reportes y listas se pueden imprimir o descargar desde cualquier impresora.",
  },
  {
    question: "¿Cuánto cuesta?",
    answer:
      "Depende de la cantidad de sucursales y usuarios. Escribinos y te pasamos una propuesta.",
  },
];
