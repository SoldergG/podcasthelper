import { AudioLines, Captions, FileArchive, Mic, Scissors, Sparkles, WandSparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { MicStrip } from "@/components/landing/mic-strip";
import { SmoothScroll } from "@/components/smooth-scroll";
import { StartActions } from "@/components/start-panel";

const steps = [
  { title: "Abre uma sala", body: "Partilha o link ou o QR code. Quem entra só escreve o nome, sem criar conta." },
  { title: "Carrega em Gravar", body: "Contagem de 3 segundos e todos os aparelhos começam no mesmo instante, cada um com o seu micro e a sua câmara." },
  { title: "Recebam tudo", body: "As gravações passam de aparelho para aparelho, já alinhadas. Abres o editor ou levas o ZIP para o teu programa." },
];

const tools = [
  { icon: Sparkles, title: "Limpeza de ruído", body: "Aprende o ruído de cada micro e tira-o sem estragar a voz." },
  { icon: AudioLines, title: "Foco na voz", body: "Silencia o que não é a pessoa a falar: ventoinha, rua, eco dos outros." },
  { icon: WandSparkles, title: "Remover silêncios", body: "Corta as pausas longas de uma vez. Dá para desfazer." },
  { icon: Captions, title: "Transcrição e legendas", body: "Texto com o nome de quem fala, exporta em SRT ou queima no vídeo." },
  { icon: Scissors, title: "Clips para redes", body: "Seleciona um trecho e exporta em 9:16 para Reels, TikTok ou Shorts." },
  { icon: FileArchive, title: "ZIP para o teu programa", body: "Uma faixa WAV por pessoa, já alinhada, para DaVinci, Premiere ou Audacity." },
];

const specs = [
  ["Áudio", "WAV 48 kHz, 16 bits, um ficheiro por pessoa"],
  ["Vídeo", "Até 4K, MP4 (H.264 e AAC) quando o navegador deixa"],
  ["Sincronia", "Relógios acertados entre aparelhos, início ao frame"],
  ["Partilha", "Direta entre aparelhos, pela rede local se estiverem juntos"],
  ["Exporta", "MP3, WAV, MP4 em 16:9, 9:16 e 1:1, SRT e ZIP"],
  ["Pessoas", "Até 5 por sala, mais um computador como centro de controlo"],
  ["Preço", "Grátis e open source (MIT). Sem contas"],
];

export default function Home() {
  return (
    <>
      <SmoothScroll />

      {/* Hero: the brand color carries the page */}
      <section className="relative bg-accent text-on-accent">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <nav className="flex h-16 items-center justify-between" aria-label="Principal">
            <Link href="/" className="flex items-center gap-2 text-[16px] font-semibold">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[9px] bg-on-accent text-accent">
                <AudioLines className="h-4 w-4" strokeWidth={2.4} />
              </span>
              PodcastHelper
            </Link>
            <div className="flex items-center gap-1 text-[14px] font-medium">
              <Link href="/episodios" className="rounded-full px-3 py-2 hover:bg-black/10">
                Episódios
              </Link>
              <a href="https://github.com/SoldergG/podcasthelper" className="rounded-full px-3 py-2 hover:bg-black/10" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </nav>

          <div className="rise pt-12 sm:pt-16">
            <h1 className="display text-[clamp(2.5rem,5.4vw,5.25rem)]">
              <span className="block">Grava o podcast.</span>
              <span className="block">Cada um no seu aparelho.</span>
            </h1>
            <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <p className="max-w-[40ch] text-[19px] leading-relaxed font-medium opacity-85">
                Cada pessoa grava o próprio micro e câmara em alta qualidade. No fim, todos ficam com tudo, sincronizado.
              </p>
              <StartActions onAccent />
            </div>
          </div>

          <div className="rise relative mt-14 -mb-[14%] sm:mt-16" style={{ animationDelay: "120ms" }}>
            <figure className="overflow-hidden rounded-[14px] bg-bg shadow-[0_2px_8px_rgba(20,20,30,0.25)] ring-1 ring-black/10">
              <Image
                src="/screens/room.webp"
                alt="Sala do PodcastHelper a gravar com três pessoas: mosaicos com cada uma, cronómetro, tempo previsto e a consola do anfitrião com medidores de nível."
                width={1800}
                height={1125}
                priority
                sizes="(min-width: 1280px) 1232px, 100vw"
                className="h-auto w-full"
              />
            </figure>
            <figure className="absolute -right-2 bottom-[-6%] hidden w-[19%] overflow-hidden rounded-[22px] border-[6px] border-[#141417] bg-[#141417] shadow-[0_4px_8px_rgba(0,0,0,0.25)] lg:block">
              <Image src="/screens/phone.webp" alt="A mesma sala no telemóvel de uma convidada, a gravar." width={700} height={1192} sizes="240px" className="h-auto w-full rounded-[16px]" />
            </figure>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* A real three-step sequence */}
        <section className="mx-auto max-w-[1280px] px-4 pt-[calc(14%+5rem)] pb-24 sm:px-6">
          <h2 className="display text-[clamp(2rem,4vw,3.25rem)]">Como funciona</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="relative border-t-2 border-label pt-6">
                <span aria-hidden className="absolute -top-[9px] left-0 h-4 w-4 rounded-full border-2 border-label bg-accent" />
                <span className="display block text-[56px] text-accent-ink">{i + 1}</span>
                <h3 className="mt-3 text-[22px] font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 max-w-[36ch] text-[16px] leading-relaxed text-label-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Show, don't promise: a working mic test */}
        <section className="border-y border-separator bg-panel">
          <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className="display max-w-[18ch] text-[clamp(2rem,4vw,3.25rem)]">Testa o micro antes de convidar alguém.</h2>
              <p className="mt-5 max-w-[48ch] text-[17px] leading-relaxed text-label-2">
                É o mesmo teste que está dentro da sala: nível da voz, picos a saturar, ruído de fundo e uma gravação de 5 segundos para te ouvires.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2 text-[14px]">
                {["Nível em dBFS", "Ruído de fundo", "Ouvir-me", "Luz da câmara", "Espaço livre"].map((t) => (
                  <li key={t} className="rounded-full border border-separator bg-elevated px-3 py-1.5">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <MicStrip />
          </div>
        </section>

        {/* Editor showcase */}
        <section className="mx-auto max-w-[1280px] px-4 py-24 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <h2 className="display max-w-[20ch] text-[clamp(2rem,4vw,3.25rem)]">Edita aqui mesmo, ou leva tudo para o teu programa.</h2>
            <p className="flex items-center gap-2 text-[15px] text-label-2">
              <Mic className="h-4 w-4 text-accent-ink" /> Ondas de som de cada pessoa, lado a lado
            </p>
          </div>
          <figure className="reveal mt-10 overflow-hidden rounded-[14px] ring-1 ring-separator">
            <Image
              src="/screens/editor.webp"
              alt="Editor do PodcastHelper: pré-visualização com três pessoas, ferramentas de corte e a linha do tempo com a onda de som de cada uma."
              width={1800}
              height={1125}
              sizes="(min-width: 1280px) 1232px, 100vw"
              className="h-auto w-full"
            />
          </figure>
          <dl className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <div key={t.title} className="flex gap-3">
                <dt className="sr-only">{t.title}</dt>
                <t.icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" />
                <dd>
                  <span className="block text-[16px] font-semibold">{t.title}</span>
                  <span className="mt-1 block text-[15px] leading-relaxed text-label-2">{t.body}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Spec plate */}
        <section className="bg-label text-bg">
          <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr]">
            <h2 className="display text-[clamp(2rem,4vw,3.25rem)]">Ficha técnica</h2>
            <dl className="grid gap-x-10 sm:grid-cols-2">
              {specs.map(([k, v]) => (
                <div key={k} className="border-t border-white/15 py-4">
                  <dt className="font-mono text-[12px] uppercase tracking-wider opacity-60">{k}</dt>
                  <dd className="mt-1.5 text-[16px] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Close */}
        <section className="bg-accent text-on-accent">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-20 sm:px-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="display max-w-[14ch] text-[clamp(2.25rem,5vw,4rem)]">Já têm tema? Abram uma sala.</h2>
              <p className="mt-4 max-w-[44ch] text-[17px] font-medium opacity-85">Fones em todos, carregador ligado e, se estiverem na mesma casa, a mesma Wi-Fi.</p>
            </div>
            <StartActions onAccent />
          </div>
        </section>
      </main>

      <footer className="border-t border-separator">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-8 text-[13px] text-label-3 sm:px-6">
          <span>PodcastHelper é open source (licença MIT).</span>
          <a className="text-label-2 hover:text-label" href="https://github.com/SoldergG/podcasthelper">
            Código no GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
