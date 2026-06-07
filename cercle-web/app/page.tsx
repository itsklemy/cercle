export default function Home() {
  const appStoreUrl = "LIEN_APP_STORE_ICI";
  const googlePlayUrl = "LIEN_GOOGLE_PLAY_ICI";

  return (
    <main className="min-h-screen bg-[#55F5A8] text-black">
      <section className="relative min-h-screen overflow-hidden px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black text-[#55F5A8]">
              <span className="text-3xl font-black">◖●</span>
            </div>
            <span className="text-4xl font-black tracking-tight text-white md:text-6xl">
              Cercle
            </span>
          </div>

          <a
            href="#telecharger"
            className="rounded-full bg-black px-5 py-3 text-sm font-black text-[#55F5A8]"
          >
            Télécharger
          </a>
        </div>

        <div className="mx-auto grid min-h-[80vh] max-w-6xl items-center gap-12 py-16 lg:grid-cols-2">
          <div>
            <p className="mb-5 text-sm font-black uppercase tracking-[0.35em]">
              Prête. Emprunte. Partage.
            </p>

            <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Tout ce dont tu as besoin existe déjà quelque part autour de toi.
            </h1>

            <p className="mt-7 max-w-xl text-xl font-bold leading-8 text-black/70">
              Cercle te permet de créer ton réseau de partage et de mutualiser
              objets, outils, matériel, services, recettes, abonnements et ressources.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href={appStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-black px-8 py-4 text-center font-black text-[#55F5A8]"
              >
                App Store
              </a>
              <a
                href={googlePlayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border-2 border-black px-8 py-4 text-center font-black text-black"
              >
                Google Play
              </a>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[360px] rotate-[-6deg] rounded-[44px] border-[10px] border-black bg-[#0A0A0A] p-5 shadow-2xl">
            <div className="min-h-[620px] rounded-[32px] bg-[url('/hero-cercle.png')] bg-cover bg-center p-6 text-center">
              <div className="mt-20 rounded-3xl bg-black/65 p-6 backdrop-blur-sm">
                <h2 className="text-3xl font-black leading-tight text-white">
                  Partage tes <span className="text-[#55F5A8]">ressources</span>
                  <br />
                  entre <span className="text-[#55F5A8]">proches</span>
                </h2>

                <div className="mt-10 space-y-3 text-2xl font-black">
                  {["Matériel", "Local", "Abonnement", "Recette"].map((item) => (
                    <div
                      key={item}
                      className="mx-auto w-fit rounded-full bg-[#55F5A8] px-5 py-1 text-black"
                    >
                      {item}
                    </div>
                  ))}
                </div>

                <p className="mt-8 text-xl font-black text-white">••• Etc</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-black px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-4xl text-4xl font-black leading-tight md:text-6xl">
            Moins acheter. Moins stocker. Mieux partager.
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8">
              <p className="mb-4 text-sm font-black uppercase tracking-[0.3em] text-[#55F5A8]">
                Particuliers
              </p>
              <h3 className="mb-5 text-3xl font-black">
                Transforme tes proches en réseau de ressources.
              </h3>
              <p className="text-lg font-semibold leading-8 text-white/70">
                Famille, amis, groupes de confiance : partage ce que tu as déjà
                et accède aux ressources disponibles autour de toi.
              </p>
            </div>

            <div className="rounded-[32px] border border-[#55F5A8]/30 bg-[#55F5A8]/10 p-8">
              <p className="mb-4 text-sm font-black uppercase tracking-[0.3em] text-[#55F5A8]">
                Pros
              </p>
              <h3 className="mb-5 text-3xl font-black">
                Mutualiser coûte moins cher que posséder seul.
              </h3>
              <p className="text-lg font-semibold leading-8 text-white/70">
                Auto-entrepreneurs, artisans, indépendants : amortis tes coûts,
                échange du matériel, partage des outils et crée des opportunités.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="telecharger" className="bg-[#55F5A8] px-6 py-24 text-center">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-5xl font-black leading-tight md:text-7xl">
            Télécharge Cercle.
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-xl font-bold leading-8 text-black/70">
            Crée ton cercle. Mutualise tes ressources. Accède à ce qui existe déjà autour de toi.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl bg-black px-10 py-5 font-black text-[#55F5A8]"
            >
              Télécharger sur l’App Store
            </a>

            <a
              href={googlePlayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border-2 border-black px-10 py-5 font-black text-black"
            >
              Télécharger sur Google Play
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}