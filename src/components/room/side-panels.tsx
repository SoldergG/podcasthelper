"use client";

import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Studio, StudioSnapshot } from "@/lib/studio";
import { formatDuration } from "@/lib/util";

export function NotesPanel({ snap, onChange }: { snap: StudioSnapshot; onChange: (text: string) => void }) {
  const startHost = snap.rec.startHost;
  return (
    <div className="flex h-full flex-col">
      <label htmlFor="shared-notes" className="mb-2 text-[13px] font-medium text-label-2">
        Notas partilhadas
      </label>
      <textarea
        id="shared-notes"
        value={snap.notes.text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Guião, temas, links, perguntas…\nTodos veem o que escreves e fica guardado com o episódio."}
        className="min-h-56 w-full flex-1 resize-none rounded-[14px] border border-separator bg-elevated p-3.5 text-[15px] leading-relaxed text-label outline-none placeholder:text-label-3 focus:border-accent focus:ring-3 focus:ring-accent/25"
      />
      {snap.notes.by && <p className="mt-2 text-[12px] text-label-3">Última edição por {snap.notes.by}</p>}
      {snap.markers.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[13px] font-medium text-label-2">Marcadores desta gravação</h3>
          <ul className="mt-2 space-y-1.5">
            {snap.markers.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-[14px]">
                <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[12px] font-medium text-accent-ink tabular">
                  {startHost ? formatDuration(m.t - startHost) : "-"}
                </span>
                <span className="truncate">{m.label}</span>
                <span className="ml-auto shrink-0 text-[12px] text-label-3">{m.by}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ studio, snap }: { studio: Studio; snap: StudioSnapshot }) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    studio.markChatRead();
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [snap.chat.length, studio]);

  return (
    <div className="flex h-full min-h-72 flex-col">
      <ul ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {snap.chat.length === 0 && (
          <li className="text-[14px] text-label-3">Mensagens escritas para não interromper a conversa: links, &quot;mais alto&quot;, &quot;pausa de 2 min&quot;…</li>
        )}
        {snap.chat.map((m) => {
          const mine = m.from === snap.self?.peerId;
          return (
            <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <span className="mb-0.5 flex items-center gap-1.5 text-[11px] text-label-3">
                {!mine && <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />}
                <span className={mine ? "" : "font-medium text-label-2"}>{mine ? "Tu" : m.name}</span>
                {new Date(m.at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[16px] px-3 py-2 text-[14px] ${mine ? "bg-label text-bg" : "bg-elevated border border-separator"}`}
              >
                {m.text}
              </span>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          studio.sendChat(text);
          setText("");
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Mensagem
        </label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreve uma mensagem"
          className="h-11 min-w-0 flex-1 rounded-full border border-separator bg-elevated px-4 text-[15px] outline-none placeholder:text-label-3 focus:border-accent"
        />
        <button type="submit" disabled={!text.trim()} aria-label="Enviar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-label text-bg disabled:opacity-40">
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
