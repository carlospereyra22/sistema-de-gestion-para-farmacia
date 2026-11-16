import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, UserRound } from "lucide-react";

import { getParties, type Party } from "./lib/api";
import {
  cambiarUsuarioPortal,
  crearUsuarioPortal,
  getUsuariosPortal,
  type UsuarioPortal,
} from "./lib/catalogo-online-api";
import { ProductFilterSelect } from "./product-filter-select";

const fecha = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(iso))
    : "Nunca";

const campo =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

/** Usuarios del portal: clientes que entran al catálogo a pedir (SISTEMA-107). */
export function CatalogoUsuarios({
  token,
  organizationId,
  onError,
}: {
  token: string;
  organizationId: string;
  onError: (message: string) => void;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([]);
  const [clientes, setClientes] = useState<Party[]>([]);
  const [creando, setCreando] = useState(false);
  const [claveDe, setClaveDe] = useState<string>();
  const falla = useCallback(
    (cause: unknown) =>
      onError(cause instanceof Error ? cause.message : String(cause)),
    [onError],
  );

  useEffect(() => {
    void getUsuariosPortal(token, organizationId)
      .then(setUsuarios)
      .catch(falla);
    void getParties(token, organizationId, "customers")
      .then((lista) => setClientes(lista.filter((c) => c.active !== false)))
      .catch(falla);
  }, [token, organizationId, falla]);

  const reemplazar = (nuevo: UsuarioPortal) =>
    setUsuarios((lista) => {
      const existe = lista.some(({ id }) => id === nuevo.id);
      return existe
        ? lista.map((u) => (u.id === nuevo.id ? nuevo : u))
        : [...lista, nuevo];
    });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Cada usuario queda atado a un cliente: pide con la lista de precios de
          ese cliente y sus pedidos aparecen a su nombre.
        </p>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          <Plus size={16} aria-hidden /> Agregar usuario
        </button>
      </div>
      {creando ? (
        <NuevoUsuario
          clientes={clientes}
          onCancelar={() => setCreando(false)}
          onGuardar={async (datos) => {
            try {
              reemplazar(
                await crearUsuarioPortal(token, organizationId, datos),
              );
              setCreando(false);
            } catch (cause) {
              falla(cause);
            }
          }}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Correo</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">Último ingreso</th>
              <th className="px-4 py-2.5 font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {usuario.name}
                </td>
                <td className="px-4 py-3 text-slate-600">{usuario.email}</td>
                <td className="px-4 py-3 text-slate-700">
                  {usuario.customerName}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      usuario.active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {usuario.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {fecha(usuario.lastLoginAt)}
                </td>
                <td className="px-4 py-3">
                  {claveDe === usuario.id ? (
                    <NuevaClave
                      onCancelar={() => setClaveDe(undefined)}
                      onGuardar={async (password) => {
                        try {
                          reemplazar(
                            await cambiarUsuarioPortal(
                              token,
                              organizationId,
                              usuario.id,
                              { password },
                            ),
                          );
                          setClaveDe(undefined);
                        } catch (cause) {
                          falla(cause);
                        }
                      }}
                    />
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setClaveDe(usuario.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50"
                      >
                        Cambiar contraseña
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void cambiarUsuarioPortal(
                            token,
                            organizationId,
                            usuario.id,
                            { active: !usuario.active },
                          )
                            .then(reemplazar)
                            .catch(falla)
                        }
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50"
                      >
                        {usuario.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!usuarios.length ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-500">
            <UserRound size={28} aria-hidden />
            Todavía no hay usuarios del portal. Agregá uno para que un cliente
            pueda pedir desde el catálogo.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function NuevoUsuario({
  clientes,
  onCancelar,
  onGuardar,
}: {
  clientes: Party[];
  onCancelar: () => void;
  onGuardar: (datos: {
    customerId: string;
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    setEnviando(true);
    try {
      await onGuardar({ customerId, name, email, password });
    } finally {
      setEnviando(false);
    }
  };
  return (
    <form
      onSubmit={(event) => void enviar(event)}
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <div className="text-sm font-medium text-slate-700">
        Cliente
        <div className="mt-1">
          <ProductFilterSelect
            label="Cliente"
            value={customerId}
            icon={<UserRound size={16} aria-hidden />}
            options={[
              { value: "", label: "Elegí un cliente" },
              ...clientes.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={(value) => {
              setCustomerId(value);
              const cliente = clientes.find((c) => c.id === value);
              if (cliente && !name) setName(cliente.name);
              if (cliente?.email && !email) setEmail(cliente.email);
            }}
          />
        </div>
      </div>
      <label className="text-sm font-medium text-slate-700">
        Nombre
        <input
          className={campo}
          value={name}
          maxLength={120}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Correo
        <input
          className={campo}
          type="email"
          value={email}
          maxLength={254}
          required
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Contraseña inicial
        <input
          className={campo}
          type="password"
          value={password}
          minLength={8}
          required
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <div className="flex gap-2 md:col-span-2 xl:col-span-4">
        <button
          type="submit"
          disabled={enviando || !customerId}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          Crear usuario
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
        >
          Cancelar
        </button>
        <p className="self-center text-xs text-slate-500">
          Pasale el correo y la contraseña al cliente. Mínimo 8 caracteres.
        </p>
      </div>
    </form>
  );
}

function NuevaClave({
  onCancelar,
  onGuardar,
}: {
  onCancelar: () => void;
  onGuardar: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onGuardar(password);
      }}
      className="flex justify-end gap-2"
    >
      <input
        type="password"
        aria-label="Contraseña nueva"
        placeholder="Contraseña nueva"
        minLength={8}
        required
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
      />
      <button
        type="submit"
        className="rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white"
      >
        Guardar
      </button>
      <button
        type="button"
        onClick={onCancelar}
        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
      >
        Cancelar
      </button>
    </form>
  );
}
