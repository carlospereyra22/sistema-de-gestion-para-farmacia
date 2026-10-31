import { useEffect, useState } from "react";
import { CalendarDays, Sun, Moon, Sunset } from "lucide-react";

function useDashboardClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function DashboardDate() {
  const now = useDashboardClock();
  return (
    <div className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 shadow-sm">
      <CalendarDays size={15} className="text-teal-700" />
      <time dateTime={now.toISOString()}>
        {now.toLocaleDateString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </time>
    </div>
  );
}

export function DashboardWelcome({ branchName }: { branchName: string }) {
  const now = useDashboardClock();
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  const Icon = hour < 6 || hour >= 20 ? Moon : hour < 13 ? Sun : Sunset;
  const greeting =
    hour < 6 || hour >= 20
      ? "¡Buenas noches!"
      : hour < 13
        ? "¡Buen día!"
        : "¡Buenas tardes!";
  return (
    <section className="dashboard-welcome relative flex min-h-24 items-center justify-between gap-3 overflow-hidden py-2">
      <div className="relative z-10 flex items-center gap-3">
        <Icon
          size={38}
          strokeWidth={1.6}
          className="shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {greeting}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Acá tenés el resumen operativo de{" "}
            <strong className="font-semibold text-slate-700">
              {branchName}
            </strong>
            .
          </p>
        </div>
      </div>
      <svg
        viewBox="0 0 330 120"
        className="pointer-events-none absolute bottom-0 right-4 hidden h-28 w-80 opacity-80 lg:block"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="home-cross" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#a7f3d0" />
            <stop offset=".5" stopColor="#10b99a" />
            <stop offset="1" stopColor="#047c70" />
          </linearGradient>
        </defs>
        <path d="M0 120 65 64 110 89 180 20 240 120Z" fill="#d6f5ec" />
        <path
          d="M60 120 142 55 202 81 259 27 330 120Z"
          fill="#b9efdf"
          opacity=".6"
        />
        <path
          d="M125 112C99 79 98 48 90 32M239 115C263 88 280 61 286 32"
          fill="none"
          stroke="#74cdb5"
          strokeWidth="2"
        />
        <path
          d="M108 82Q68 77 74 55Q98 55 108 82M98 57Q72 40 86 21Q108 37 98 57M256 89Q267 56 291 60Q286 86 256 89M276 58Q271 29 293 18Q301 42 276 58"
          fill="#9ae3c9"
        />
        <path
          d="M164 28h27q7 0 7 7v19h19q7 0 7 7v26q0 7-7 7h-19v19h-41V94h-19q-7 0-7-7V61q0-7 7-7h19V35q0-7 7-7Z"
          fill="#087f70"
          opacity=".2"
          transform="translate(5 4)"
        />
        <path
          d="M161 24h27q7 0 7 7v19h19q7 0 7 7v26q0 7-7 7h-19v23h-41V90h-19q-7 0-7-7V57q0-7 7-7h19V31q0-7 7-7Z"
          fill="url(#home-cross)"
        />
        <g transform="translate(226 69) rotate(32)">
          <rect width="22" height="64" rx="11" fill="white" stroke="#b3e4d8" />
          <path d="M0 32V11a11 11 0 0 1 22 0v21Z" fill="url(#home-cross)" />
          <path
            d="M5 12v15"
            stroke="white"
            strokeOpacity=".6"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </section>
  );
}
