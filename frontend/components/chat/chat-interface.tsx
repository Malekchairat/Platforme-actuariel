"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { askAnalysis } from "@/lib/mock-api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  explanation?: string;
}

const SUGGESTIONS = [
  "Quels portefeuilles sont les moins rentables ?",
  "Pourquoi les sinistres ont augmenté ?",
  "Quel est le ratio fonds propres / bilan ?",
];

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Bonjour. Je suis l'assistant d'analyse actuarielle (mode démo). Posez une question sur les portefeuilles, sinistres ou la rentabilité STAR 2025.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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
      const response = await askAnalysis(question);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response.answer.replace(/\*\*(.*?)\*\*/g, "$1"),
          sql: response.sql,
          explanation: response.explanation,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex h-[calc(100vh-12rem)] flex-col border-border/60 shadow-sm">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Assistant d&apos;analyse
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-0">
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-4">
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
              <p className="text-sm text-muted-foreground">Analyse en cours...</p>
            )}
          </div>
        </ScrollArea>

        <div className="space-y-3 border-t border-border px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="h-auto whitespace-normal text-left text-xs"
                onClick={() => handleSubmit(s)}
                disabled={loading}
              >
                {s}
              </Button>
            ))}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez votre question..."
              disabled={loading}
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
