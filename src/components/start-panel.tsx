"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { markRoomHost } from "@/lib/studio";
import { newRoomCode, normalizeRoomCode } from "@/lib/util";
import { Button, inputClass } from "./ui";

/** Create a room or join one by code. */
export function StartActions({ size = "lg", onAccent = false }: { size?: "md" | "lg"; onAccent?: boolean }) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    const c = newRoomCode();
    markRoomHost(c);
    router.push(`/sala?c=${c}`);
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (!c) {
      setError("Esse código não parece certo. Tem 10 letras e números, por exemplo abc-defg-hij.");
      return;
    }
    router.push(`/sala?c=${c}`);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Button variant={onAccent ? "primary" : "accent"} size={size} onClick={create}>
          Criar sala
        </Button>
        {!joining && (
          <Button variant="secondary" size={size} className={onAccent ? "!bg-black/10 !text-on-accent hover:!bg-black/15" : ""} onClick={() => setJoining(true)}>
            Entrar com código
          </Button>
        )}
      </div>
      {joining && (
        <form onSubmit={join} className="mt-4 max-w-md">
          <label htmlFor="room-code" className={`mb-2 block text-[13px] font-medium ${onAccent ? "text-on-accent" : "text-label-2"}`}>
            Código ou link da sala
          </label>
          <div className="flex gap-2">
            <input
              id="room-code"
              className={inputClass}
              placeholder="abc-defg-hij"
              value={code}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
            />
            <Button type="submit" variant="primary" disabled={!code.trim()} aria-label="Entrar">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {error && <p className={`mt-2 text-[13px] ${onAccent ? "font-medium text-on-accent" : "text-red"}`}>{error}</p>}
        </form>
      )}
    </div>
  );
}
