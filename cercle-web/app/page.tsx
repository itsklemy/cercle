export default function Home() {
  const appStoreUrl = "https://apps.apple.com/fr/app/cercle-app/id6753151517";
  const googlePlayUrl =
    "https://play.google.com/store/apps/details?id=com.cercle.app&pcampaignid=web_share";

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative overflow-hidden bg-gradient-to-br from-black via-[#07150F] to-[#55F5A8] px-6 py-8">
        <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-[#55F5A8]/20 blur-[120px]" />
        <div className="absolute right-[-10%] top-0 h-[700px] w-[700px] rounded-full bg-[#55F5A8]/40 blur-[140px]" />

        <div className="relative mx-auto max-w-7xl">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-[#55F5A8]">
                <span className="text-3xl font-black">◖●</span>
              </div>
              <span className="text-4xl font-black">Cercle</span>
            </div>

            <a
              href="#telecharger"
              className="rounded-full bg-[#55F5A8] px-6 py-3 font-black text-black shadow-lg"
            >
              Télécharger l’app
            </a>
          </header>

          <div className="grid min-h-[780px] items-center gap-12 py-16 lg:grid-cols-2">
            <div>
              <h1 className="max-w-3xl text-6xl font-black leading-[0.95] tracking-tight md:text-7xl">
                Avant d’acheter,
                <br />
                regarde dans
                <br />
                ton <span className="text-[#55F5A8]">Cercle.</span>
              </h1>

              <p className="mt-8 max-w-xl text-xl font-semibold leading-8 text-white/80">
                Tout ce dont tu as besoin existe déjà autour de toi. Cercle te
                permet de <span className="text-[#55F5A8]">partager</span>,{" "}
                <span className="text-[#55F5A8]">emprunter</span> et{" "}
                <span className="text-[#55F5A8]">mutualiser</span> objets,
                outils, services, abonnements et bien plus encore.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <a
                  href={appStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-white/30 bg-black px-7 py-4 text-center font-black text-white"
                >
                  Télécharger sur l’App Store
                </a>

                <a
                  href={googlePlayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-white/30 bg-black px-7 py-4 text-center font-black text-white"
                >
                  Disponible sur Google Play
                </a>
              </div>
            </div>

            <div className="relative mx-auto">
              <div className="rotate-[7deg] rounded-[48px] border-[10px] border-black bg-[#050505] p-5 shadow-2xl shadow-black/60">
                <div className="flex min-h-[620px] w-[330px] flex-col justify-between rounded-[34px] bg-[radial-gradient(circle_at_top,#1e2a22,#050505_70%)] p-7 text-center">
                  <div />
                  <div>
                    <h2 className="text-3xl font-black leading-tight">
                      Partage tes{" "}
                      <span className="text-[#55F5A8]">ressources</span>
                      <br />
                      entre <span className="text-[#55F5A8]">proches</span>
                    </h2>

                    <div className="mt-10 space-y-3 text-2xl font-black text-black">
                      {["Matériel", "Local", "Abonnement", "Recette"].map(
                        (item) => (
                          <div
                            key={item}
                            className="mx-auto w-fit rounded-full bg-[#55F5A8] px-6 py-1"
                          >
                            {item}
                          </div>
                        )
                      )}
                    </div>

                    <p className="mt-8 text-xl font-black">••• Etc</p>
                  </div>

                  <div>
                    <div className="mx-auto mb-2 flex h-16 w-24 items-center justify-center rounded-full text-[#55F5A8]">
                      <span className="text-5xl font-black">◖●</span>
                    </div>
                    <p className="text-sm font-bold text-white/80">
                      Prête, emprunte, partage
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="rounded-t-[40px] bg-black/95 px-0 py-16">
            <h2 className="mb-10 text-center text-4xl font-black">
              Deux façons d’utiliser <span className="text-[#55F5A8]">Cercle</span>
            </h2>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="rounded-[32px] border border-[#55F5A8]/20 bg-[#07150F] p-8 shadow-xl">
                <h3 className="mb-4 text-4xl font-black text-[#55F5A8]">
                  Particuliers
                </h3>
                <p className="text-xl font-black">
                  Transforme tes proches en réseau de ressources.
                </p>
                <p className="mt-4 text-lg leading-8 text-white/70">
                  Partage ce que tu possèdes déjà, accède à ce dont tu as besoin
                  et réduis les achats inutiles.
                </p>
              </div>

              <div className="rounded-[32px] border border-[#55F5A8]/20 bg-[#07150F] p-8 shadow-xl">
                <h3 className="mb-4 text-4xl font-black text-[#55F5A8]">
                  Pros
                </h3>
                <p className="text-xl font-black">
                  Mutualiser coûte moins cher que posséder seul.
                </p>
                <p className="mt-4 text-lg leading-8 text-white/70">
                  Auto-entrepreneurs, artisans, indépendants : amortis tes coûts,
                  échange des outils et développe ton réseau pro.
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="bg-black px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2">
          <div>
            <h2 className="mb-10 text-4xl font-black">Comment ça marche ?</h2>

            <div className="space-y-8">
              {[
                [
                  "Crée ton Cercle",
                  "Invite tes proches ou rejoins un groupe existant.",
                ],
                [
                  "Partage tes ressources",
                  "Objets, outils, services, abonnements, compétences… tout est utile.",
                ],
                [
                  "Emprunte ou rends service",
                  "Fais des demandes, prête, échange et fais circuler l’entraide.",
                ],
              ].map(([title, text]) => (
                <div key={title} className="flex gap-5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#55F5A8] text-2xl font-black text-black">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#55F5A8]">
                      {title}
                    </h3>
                    <p className="mt-2 text-lg leading-7 text-white/75">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {["Mes cercles", "Inventaire", "Profil pro"].map((title) => (
              <div
                key={title}
                className="rounded-[34px] border-[8px] border-[#111] bg-[#080808] p-5 shadow-2xl"
              >
                <div className="min-h-[420px] rounded-[24px] bg-[#111] p-4">
                  <h3 className="mb-6 text-lg font-black">{title}</h3>
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="rounded-xl bg-white/5 p-3 text-sm text-white/70"
                      >
                        Ressource {i}
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 rounded-full bg-[#55F5A8] py-3 text-center font-black text-black">
                    + Ajouter
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="telecharger" className="bg-black px-6 pb-20">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 rounded-[28px] border border-[#55F5A8]/40 bg-[#07150F] p-8 shadow-[0_0_40px_rgba(85,245,168,0.18)] md:flex-row">
          <div className="flex items-center gap-5">
            <div className="text-6xl font-black text-[#55F5A8]">◖●</div>
            <div>
              <h2 className="text-3xl font-black">
                Moins acheter.
                <br />
                Plus partager.
              </h2>
            </div>
          </div>

          <p className="max-w-md text-lg font-semibold text-white/80">
            Rejoins Cercle et fais circuler l’entraide.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/30 bg-black px-6 py-4 text-center font-black text-white"
            >
              App Store
            </a>
            <a
              href={googlePlayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/30 bg-black px-6 py-4 text-center font-black text-white"
            >
              Google Play
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}