"use client";

import { useState, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { useAppStore } from "@/lib/store";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  explanation?: string;
}

const SUGGESTIONS = [
  "Quels portefeuilles ou branches sont les moins rentables ?",
  "Pourquoi les charges de sinistres ont-elles augmenté ?",
  "Quelle est l'explication de la variation du résultat technique ?",
];

export function ChatInterface() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Réinitialiser le message de bienvenue à chaque changement de compagnie sélectionnée
  useEffect(() => {
    const companyCleanName = selectedCompanyId.replace(/_2025/g, "").toUpperCase();
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Bonjour. Je suis votre Copilot Actuariel connecté à la balance de ${companyCleanName}. Posez-moi vos questions complexes sur ses sinistres, ses ratios ou l'explication de ses performances.`,
      },
    ]);
  }, [selectedCompanyId]);

  async function handleSubmit(question: string) {
    if (!question.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Requête en direct vers l'infrastructure de raisonnement Llama-3.3 via le backend
      const response = await fetch("http://localhost:8055/api/copilot/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_id: selectedCompanyId,
          question: question.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Erreur de communication avec le serveur.");
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.answer,
          explanation: data.explanation || "Analyse fournie par le modèle de raisonnement Groq.",
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Désolé, je n'ai pas pu analyser ces données. Vérifiez que votre serveur backend est actif sur le port 8055 et que la clé GROQ_API_KEY est configurée.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex h-[calc(100vh-12rem)] max-h-[calc(100vh-12rem)] flex-col border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border pb-4 shrink-0">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Assistant d&apos;analyse Actuarielle IA
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col overflow-hidden p-0 min-h-0 relative">
        
        {/* 🛠️ SCROLL FIXED CONTAINER: Replaced flex-1 with a max-height bounded box + full width calculation */}
        <div className="absolute top-0 bottom-0 left-0 right-0 h-[calc(100%-11rem)] w-full overflow-hidden">
          <ScrollArea className="h-full w-full px-6 py-4">
            <div className="space-y-4 pb-4">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  sql={msg.sql}
                  explanation={msg.explanation}
                />
              ))}
              {loading && (
                <p className="text-sm text-muted-foreground animate-pulse pl-4 border-l-2 border-primary/40 py-1">
                  Copilot est en train de croiser les indicateurs...
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 🛠️ PERSISTENT FOOTER MATRIX BAR: Locks at the structural base of the viewport window */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-border px-6 py-4 bg-card shrink-0 z-20 h-44 flex flex-col justify-between">
          <div className="flex flex-wrap gap-2 overflow-y-auto max-h-16 pr-1">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="h-auto whitespace-normal text-left text-xs bg-muted/20 hover:bg-muted/60 transition-colors"
                onClick={() => handleSubmit(s)}
                disabled={loading}
              >
                {s}
              </Button>
            ))}
          </div>

          <form
            className="flex gap-2 mt-2 shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez une question sur le pourquoi de ces résultats..."
              disabled={loading}
              className="flex-1 shadow-none focus-visible:ring-1"
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}