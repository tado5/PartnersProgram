import Link from "next/link";

export default function ManualNotFound() {
  return <section className="max-w-2xl">
    <h1 className="text-3xl font-bold text-white">Návod nie je dostupný</h1>
    <p className="mt-4 text-white/75">Požadovaná kapitola manuálu neexistuje.</p>
    <Link href="/superadmin/manual" className="mt-5 inline-block text-primary underline">Späť na manuál</Link>
  </section>;
}
