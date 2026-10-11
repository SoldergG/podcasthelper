import { AudioLines, Headphones, Layers, Scissors, Share2, Timer } from "lucide-react";
import { StartPanel } from "@/components/start-panel";
import { Header } from "@/components/ui";

const steps = [
  {
    n: "1",
    title: "Cria a sala",
    body: "Partilha o link. Cada pessoa entra com o telemóvel ou computador e os fones.",
  },
  {
    n: "2",
    title: "Gravem a conversa",
    body: "Cada aparelho grava o próprio micro e câmara na qualidade máxima. A internet má não estraga nada.",
  },
  {
    n: "3",
    title: "Todos recebem tudo",
    body: "No fim, as gravações passam diretamente de aparelho para aparelho, alinhadas ao milissegundo.",
  },
];

const features = [
  {
    icon: AudioLines,
    title: "Áudio sem perdas",
    body: "WAV 48 kHz de cada micro, gravado localmente. Sem compressão da chamada.",
  },
  {
    icon: Timer,
    title: "Tudo sincronizado",
    body: "Os relógios dos aparelhos são acertados entre si e a gravação começa no mesmo instante em todos.",
  },
  {
    icon: Headphones,
    title: "Sem eco",
    body: "Com fones, o micro grava em bruto. Sem fones, o cancelamento de eco liga-se sozinho.",
  },
  {
    icon: Share2,
    title: "Partilha direta",
    body: "Os ficheiros vão de aparelho para aparelho. Na mesma Wi-Fi, à velocidade da rede local.",
  },
  {
    icon: Scissors,
    title: "Editor no browser",
    body: "Ondas de som lado a lado, cortes, volumes, marcadores e ajustes de imagem por pessoa.",
  },
  {
    icon: Layers,
    title: "Exporta como quiseres",
    body: "Faixas alinhadas para DaVinci, Premiere ou CapCut, mistura em WAV/MP3 e vídeo em grelha.",
  },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <p className="text-[15px] font-semibold text-orange">Estúdio de podcast remoto · grátis e open source</p>
            <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
              O teu podcast, gravado em cada aparelho.
            </h1>
            <p className="mt-5 max-w-xl text-[19px] leading-relaxed text-label-2">
              Sem mesas de som nem cabos. Cada pessoa usa o próprio micro, câmara e fones. No fim, todos ficam
              com as gravações de todos, sincronizadas e prontas para editar.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <StartPanel />
          </div>
        </section>

        <section className="border-t border-separator bg-elevated">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Como funciona</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="rounded-[18px] bg-grouped p-6">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-label text-[15px] font-semibold text-bg">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-[19px] font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-label-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Feito para soar bem</h2>
          <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title}>
                <f.icon aria-hidden className="h-7 w-7 text-accent" strokeWidth={1.8} />
                <h3 className="mt-3 text-[17px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-label-2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-[22px] bg-elevated p-6 shadow-[var(--shadow)] sm:p-8">
            <h2 className="text-[21px] font-semibold">Dicas para a melhor gravação</h2>
            <ul className="mt-4 grid gap-3 text-[15px] text-label-2 sm:grid-cols-2">
              <li>• Usem todos fones (com fio é o ideal: o Bluetooth acrescenta atraso).</li>
              <li>• Liguem os aparelhos ao carregador e deixem o ecrã aceso.</li>
              <li>• Na mesma casa? Fiquem na mesma Wi-Fi para a partilha ser rápida.</li>
              <li>• Façam uma gravação de teste de 10 segundos antes de começar.</li>
            </ul>
          </div>
        </section>
      </main>
      <footer className="border-t border-separator py-8 text-center text-[13px] text-label-3">
        PodcastHelper · código aberto (MIT) ·{" "}
        <a className="text-accent hover:underline" href="https://github.com/SoldergG/podcasthelper">
          GitHub
        </a>
      </footer>
    </>
  );
}
