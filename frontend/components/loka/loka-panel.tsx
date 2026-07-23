"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLoka } from "./loka-provider";
import { useAppStore } from "@/lib/store";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Quels sont les ratios combinés du marché ?",
  "Comparer la sinistralité Non-Vie vs Vie",
  "Expliquer la variation du résultat technique",
];

export function LokaPanel() {
  const { isOpen, closeLoka } = useLoka();
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Reset welcome message on company change */
  useEffect(() => {
    const name = selectedCompanyId.replace(/_2025/gi, "").toUpperCase();
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Bonjour. Je suis **Loka**, votre copilot actuariel pour **${name}**.\n\nPosez-moi une question sur les ratios, la sinistralité, les provisions ou toute donnée financière extraite.`,
      },
    ]);
  }, [selectedCompanyId]);

  /* Scroll to bottom on new messages */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    setMessages((p) => [...p, { id: `u-${Date.now()}`, role: "user", content: q }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8055/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedCompanyId, question: q }),
      });

      const data = await res.json();
      setMessages((p) => [
        ...p,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.answer ?? "Désolé, je n'ai pas pu analyser cette requête.",
        },
      ]);
    } catch {
      setMessages((p) => [
        ...p,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Backend inaccessible. Vérifiez que le serveur est actif sur le port 8055.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    /* Panel slides in from the right, docked to viewport */
    <div
      className={cn(
        "fixed right-0 top-0 bottom-0 z-50 flex flex-col",
        "w-[400px] border-l border-[#1A2D45]",
        "bg-[#07111F] shadow-2xl",
        "animate-in slide-in-from-right duration-300",
      )}
      style={{ boxShadow: "-8px 0 40px rgba(46,92,138,0.15)" }}
    >
      {/* ── Header ── */}
      <div className="loka-gradient flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-tight">Loka</p>
            <p className="text-[10px] text-white/60 tracking-wide uppercase">
              Copilot Actuariel · BH Assurance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-[#1E9E63] animate-pulse" />
          <button
            onClick={closeLoka}
            aria-label="Fermer Loka"
            className="ml-2 flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin scrollbar-thumb-[#1A2D45]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {msg.role === "assistant" && (
              <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md loka-gradient">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[88%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                msg.role === "user"
                  ? "bg-[#E4032E] text-white rounded-br-sm"
                  : "loka-bubble rounded-bl-sm",
              )}
            >
              {/* Render **bold** markdown snippets */}
              {msg.content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith("**") ? (
                  <strong key={i} className="font-semibold">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md loka-gradient">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <div className="loka-bubble rounded-xl rounded-bl-sm px-4 py-3">
              <span className="flex gap-1 items-center text-[#7A96AE] text-xs">
                <span className="animate-bounce [animation-delay:-0.3s]">●</span>
                <span className="animate-bounce [animation-delay:-0.15s]">●</span>
                <span className="animate-bounce">●</span>
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Suggestions ── */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={loading}
              className={cn(
                "rounded-full border border-[#1A2D45] bg-[#0D1E33]",
                "px-3 py-1 text-[11px] font-medium text-[#7A96AE]",
                "hover:border-[#2E5C8A] hover:text-[#D6E4F0] transition-colors",
                "disabled:opacity-40",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Input ── */}
      <div className="border-t border-[#1A2D45] px-4 py-4 shrink-0">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Posez une question à Loka..."
            className={cn(
              "flex-1 rounded-lg border border-[#1A2D45] bg-[#0D1E33]",
              "px-3.5 py-2.5 text-[13px] text-[#D6E4F0] placeholder-[#3A5570]",
              "focus:outline-none focus:ring-1 focus:ring-[#2E5C8A] focus:border-[#2E5C8A]",
              "transition-colors",
            )}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              "loka-gradient text-white transition-all hover:opacity-90 active:scale-95",
              "disabled:opacity-30 disabled:cursor-not-allowed",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
