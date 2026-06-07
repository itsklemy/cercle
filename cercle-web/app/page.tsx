export default function Home() {
  return (
    <main className="min-h-screen bg-[#F7F4EC] text-[#1F2933]">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-[#6B7C61]">
          Cercle
        </p>

        <h1 className="mb-6 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          Prêtez, empruntez et partagez avec les personnes de confiance autour de vous.
        </h1>

        <p className="mb-10 max-w-2xl text-lg leading-8 text-gray-600">
          Cercle aide les proches, voisins, amis et familles à mutualiser leurs objets,
          leurs services et leurs ressources dans des cercles privés.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <a
            href="#"
            className="rounded-full bg-[#1F2933] px-8 py-4 font-semibold text-white"
          >
            Découvrir Cercle
          </a>

          <a
            href="#"
            className="rounded-full border border-[#1F2933] px-8 py-4 font-semibold"
          >
            Créer mon cercle
          </a>
        </div>
      </section>
    </main>
  );
}