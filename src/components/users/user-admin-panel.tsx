"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useCompanyApi } from "@/components/company-context";

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "seller";
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type ApiError = { error?: { message?: string } };

async function responseError(response: Response) {
  const body = (await response.json()) as ApiError;
  return body.error?.message ?? "Požiadavku sa nepodarilo dokončiť.";
}

function UserRow({
  user,
  onChanged,
}: {
  user: ManagedUser;
  onChanged: () => Promise<void>;
}) {
  const { companyFetch } = useCompanyApi();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function update(data: { role?: "admin" | "seller"; isActive?: boolean }) {
    setPending(true);
    setMessage("");
    const response = await companyFetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      setMessage(await responseError(response));
    } else {
      await onChanged();
    }
    setPending(false);
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const response = await companyFetch(`/api/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temporaryPassword }),
    });
    if (!response.ok) {
      setMessage(await responseError(response));
    } else {
      setTemporaryPassword("");
      setMessage("Heslo bolo resetované. Používateľ sa musí prihlásiť a zmeniť ho.");
      await onChanged();
    }
    setPending(false);
  }

  return (
    <article className="grid gap-4 border-t border-stone-200 py-5 lg:grid-cols-[1fr_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-stone-950">{user.name}</h3>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">
            {user.role === "admin" ? "Admin" : "Predavač"}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs ${
              user.isActive
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {user.isActive ? "Aktívny" : "Neaktívny"}
          </span>
          {user.mustChangePassword ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
              Čaká na zmenu hesla
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-stone-600">{user.email}</p>
        <p className="mt-1 text-xs text-stone-500">
          Posledné prihlásenie:{" "}
          {user.lastLoginAt
            ? new Intl.DateTimeFormat("sk-SK", {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(user.lastLoginAt))
            : "zatiaľ žiadne"}
        </p>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={resetPassword}>
          <input
            autoComplete="new-password"
            className="min-w-56 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
            minLength={10}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            placeholder="Nové dočasné heslo (10+ znakov)"
            required
            type="password"
            value={temporaryPassword}
          />
          <button
            className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            Resetovať heslo
          </button>
        </form>
        {message ? (
          <p aria-live="polite" className="mt-2 text-sm text-stone-600">
            {message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start gap-2 lg:justify-end">
        <select
          aria-label={`Rola: ${user.name}`}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          disabled={pending}
          onChange={(event) =>
            void update({
              role: event.target.value === "admin" ? "admin" : "seller",
            })
          }
          value={user.role}
        >
          <option value="admin">Admin</option>
          <option value="seller">Predavač</option>
        </select>
        <button
          className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          disabled={pending}
          onClick={() => void update({ isActive: !user.isActive })}
          type="button"
        >
          {user.isActive ? "Deaktivovať" : "Aktivovať"}
        </button>
      </div>
    </article>
  );
}

export function UserAdminPanel({
  initialUsers,
}: {
  initialUsers: ManagedUser[];
}) {
  const { companyFetch } = useCompanyApi();
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    const response = await companyFetch("/api/users", { cache: "no-store" });
    if (!response.ok) {
      setError(await responseError(response));
      return;
    }
    const body = (await response.json()) as { users: ManagedUser[] };
    setUsers(body.users);
    setError("");
  }, [companyFetch]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await companyFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        name: formData.get("name"),
        role: formData.get("role"),
        temporaryPassword: formData.get("temporaryPassword"),
      }),
    });
    if (!response.ok) {
      setError(await responseError(response));
    } else {
      form.reset();
      await loadUsers();
    }
    setIsSubmitting(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-xl border border-stone-200 bg-white px-5">
        <div className="py-5">
          <h2 className="text-lg font-semibold text-stone-950">Používateľské účty</h2>
          <p className="mt-1 text-sm text-stone-600">
            Účty sa nedajú odstrániť; prístup sa ukončuje deaktiváciou.
          </p>
        </div>
        {users.length ? (
          users.map((user) => (
            <UserRow key={user.id} user={user} onChanged={loadUsers} />
          ))
        ) : (
          <p className="border-t border-stone-200 py-5 text-sm text-stone-600">
            Zatiaľ nie sú vytvorené žiadne účty.
          </p>
        )}
      </section>

      <aside className="h-fit rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-stone-950">Nový účet</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          Používateľ sa po prvom prihlásení musí zmeniť dočasné heslo.
        </p>
        <form className="mt-5 space-y-4" onSubmit={createUser}>
          <label className="block text-sm font-medium text-stone-700">
            Meno
            <input
              className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
              minLength={2}
              name="name"
              required
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            E-mail
            <input
              autoComplete="off"
              className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Rola
            <select
              className="mt-1.5 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
              name="role"
            >
              <option value="seller">Predavač</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Dočasné heslo (minimálne 10 znakov)
            <input
              autoComplete="new-password"
              className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
              minLength={10}
              name="temporaryPassword"
              required
              type="password"
            />
          </label>
          {error ? (
            <p aria-live="polite" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            className="w-full rounded-md bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            Vytvoriť účet
          </button>
        </form>
      </aside>
    </div>
  );
}
