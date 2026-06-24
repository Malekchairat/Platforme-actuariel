"use client";

import { AppHeader } from "@/components/layout/app-header";
import { ChatInterface } from "@/components/chat/chat-interface";

export default function AnalysisPage() {
  return (
    <>
      <AppHeader
        title="Analyse IA"
        description="Interface conversationnelle — réponses statiques (backend à venir)"
      />

      <div className="p-8">
        <ChatInterface />
      </div>
    </>
  );
}
