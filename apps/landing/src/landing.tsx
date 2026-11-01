import { useState, type ReactElement } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  LogIn,
  Mail,
  Menu,
  MessageCircle,
  X,
} from "lucide-react";
import { benefits, faqs, features, steps, trust } from "./content";
import { site, whatsappUrl } from "./site";

const nav = [
  { href: "#beneficios", label: "Beneficios" },
  { href: "#funciones", label: "Funciones" },
  { href: "#como-empezar", label: "Cómo empezar" },
  { href: "#preguntas", label: "Preguntas" },
  { href: "#contacto", label: "Contacto" },
];

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-brand-line bg-white px-5 py-3 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

function SectionTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}): ReactElement {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
      {text ? <p className="mt-3 text-base text-slate-600">{text}</p> : null}
    </div>
  );
}

function Header(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#inicio" className="flex items-center gap-2.5">
          <img src="/icons/app-192.png" alt="" className="size-9 rounded-lg" />
          <span className="leading-tight">
            <span className="block text-lg font-bold text-slate-900">
              {site.name}
            </span>
            <span className="block text-[11px] text-slate-500">
              {site.tagline}
            </span>
          </span>
        </a>
        <nav aria-label="Secciones" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-6 text-sm font-medium text-slate-600">
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="hover:text-brand">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href={site.appUrl}
          className={`${primaryButton} ml-auto hidden px-4 py-2 sm:inline-flex lg:ml-0`}
        >
          <LogIn size={16} aria-hidden />
          Ingresar
        </a>
        <button
          type="button"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="ml-auto grid size-10 place-items-center rounded-lg border border-line text-slate-700 sm:ml-0 lg:hidden"
        >
          {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
        </button>
      </div>
      {open ? (
        <nav aria-label="Secciones" className="border-t border-line lg:hidden">
          <ul className="mx-auto max-w-6xl space-y-1 px-4 py-3 text-sm font-medium text-slate-700">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 hover:bg-brand-soft"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={site.appUrl}
                className="block rounded-lg px-3 py-2 font-semibold text-brand hover:bg-brand-soft"
              >
                Ingresar al sistema
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

/** Vista ilustrativa del sistema: formas sin cifras para no inventar datos. */
function ProductPreview(): ReactElement {
  const bars = [38, 52, 44, 61, 57, 70, 66, 78, 74, 86];
  return (
    <div
      aria-hidden
      className="rounded-2xl border border-line bg-white p-4 shadow-[0_24px_60px_-28px_rgba(8,127,112,0.45)]"
    >
      <div className="flex items-center gap-1.5 border-b border-line pb-3">
        <span className="size-2.5 rounded-full bg-rose-300" />
        <span className="size-2.5 rounded-full bg-amber-300" />
        <span className="size-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 text-xs font-semibold text-slate-500">
          Reportes · Resumen
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["Ventas netas", "Ganancia", "Ticket", "Unidades"].map((label) => (
          <div key={label} className="rounded-xl border border-line p-3">
            <p className="text-[10px] font-semibold text-slate-500">{label}</p>
            <div className="mt-2 h-3 w-16 rounded bg-slate-200" />
            <div className="mt-2 h-2 w-10 rounded bg-brand-line" />
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-line p-3">
        <p className="text-[10px] font-semibold text-slate-500">
          Evolución de ventas
        </p>
        <div className="mt-3 flex h-28 items-end gap-2">
          {bars.map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t bg-gradient-to-t from-brand to-[#3fa392]"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero(): ReactElement {
  return (
    <section
      id="inicio"
      className="bg-gradient-to-b from-brand-soft via-white to-white"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white px-3 py-1 text-xs font-semibold text-brand">
            Hecho para farmacias argentinas
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Toda la gestión de tu farmacia en un solo lugar
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Ventas, caja, stock por lote y vencimiento, cuentas corrientes,
            compras, reportes y facturación electrónica. Para una o varias
            sucursales, desde el navegador.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={whatsappUrl()}
              target="_blank"
              rel="noreferrer"
              className={primaryButton}
            >
              Pedí una demo
              <ArrowRight size={16} aria-hidden />
            </a>
            <a href={site.appUrl} className={secondaryButton}>
              <LogIn size={16} aria-hidden />
              Ingresar al sistema
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            {trust.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon size={16} className="text-brand" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}

function Benefits(): ReactElement {
  return (
    <section id="beneficios" className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle
          eyebrow="Beneficios"
          title="Menos tiempo en el mostrador, más control del negocio"
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-2xl border border-line bg-white p-6 shadow-[0_3px_12px_rgb(25_56_74_/_4%)]"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon size={22} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features(): ReactElement {
  return (
    <section id="funciones" className="bg-surface py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle
          eyebrow="Funciones"
          title="Todo lo que la farmacia usa todos los días"
          text="Un sistema pensado para el circuito real de la farmacia: del pedido al proveedor hasta el cierre de caja."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="flex gap-4 rounded-2xl border border-line bg-white p-5"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                <Icon size={19} aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Steps(): ReactElement {
  return (
    <section id="como-empezar" className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle
          eyebrow="Cómo empezar"
          title="Te acompañamos desde el primer día"
        />
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-2xl border border-line bg-white p-6"
            >
              <span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-bold text-white">
                {index + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq(): ReactElement {
  return (
    <section id="preguntas" className="bg-surface py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionTitle
          eyebrow="Preguntas frecuentes"
          title="Lo que más nos consultan"
        />
        <div className="mt-10 space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-line bg-white px-5 py-4 open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDown
                  size={18}
                  className="shrink-0 text-brand transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact(): ReactElement {
  return (
    <section id="contacto" className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-8 rounded-3xl bg-brand px-6 py-12 text-white sm:px-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              ¿Querés verlo funcionando en tu farmacia?
            </h2>
            <p className="mt-3 text-base text-white/85">
              Escribinos y coordinamos una demostración con datos de ejemplo.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/90">
              {[
                "Demostración sin compromiso",
                "Ayuda con la carga inicial",
                "Capacitación para tu equipo",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check size={16} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <a
              href={whatsappUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand hover:bg-brand-soft"
            >
              <MessageCircle size={18} aria-hidden />
              Escribinos por WhatsApp
            </a>
            <a
              href={`mailto:${site.contact.email}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Mail size={18} aria-hidden />
              {site.contact.email}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer(): ReactElement {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-slate-600 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-bold text-slate-900">{site.name}</p>
          <p className="mt-1">{site.tagline}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Contacto</p>
          <ul className="mt-2 space-y-1">
            <li>
              <a
                href={whatsappUrl()}
                target="_blank"
                rel="noreferrer"
                className="hover:text-brand"
              >
                WhatsApp
              </a>
            </li>
            <li>
              <a
                href={`mailto:${site.contact.email}`}
                className="hover:text-brand"
              >
                {site.contact.email}
              </a>
            </li>
            <li>
              <a
                href={site.contact.instagram}
                target="_blank"
                rel="noreferrer"
                className="hover:text-brand"
              >
                Instagram
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Legales</p>
          <ul className="mt-2 space-y-1 text-slate-500">
            <li>Términos y condiciones (próximamente)</li>
            <li>Política de privacidad (próximamente)</li>
          </ul>
        </div>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {site.name}. Todos los derechos reservados.
      </p>
    </footer>
  );
}

export function Landing(): ReactElement {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido">
        <Hero />
        <Benefits />
        <Features />
        <Steps />
        <Faq />
        <Contact />
      </main>
      <Footer />
      <a
        href={whatsappUrl()}
        target="_blank"
        rel="noreferrer"
        aria-label="Escribinos por WhatsApp"
        className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircle size={28} aria-hidden />
      </a>
    </>
  );
}
