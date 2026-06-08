export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <img
          src="/cercle-landing.png"
          alt="Cercle - Avant d’acheter, regarde dans ton Cercle"
          className="w-full h-auto"
        />

        <a
          href="https://apps.apple.com/fr/app/cercle-app/id6753151517"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-[5%] right-[25%] h-[7%] w-[15%]"
          aria-label="Télécharger Cercle sur l’App Store"
        />

        <a
          href="https://play.google.com/store/apps/details?id=com.cercle.app&pcampaignid=web_share"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-[5%] right-[7%] h-[7%] w-[16%]"
          aria-label="Télécharger Cercle sur Google Play"
        />
      </div>
    </main>
  );
}