import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  sql?: string;
  explanation?: string;
}

export function MessageBubble({ role, content, sql, explanation }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex gap-3 mb-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={isUser ? "bg-primary text-primary-foreground" : "bg-muted"}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "max-w-[80%] space-y-2 rounded-xl px-4 py-3 text-sm shadow-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border",
          /* 🛠️ Sécurité additionnelle pour forcer les longs textes à rester dans le conteneur */
          "break-words whitespace-pre-wrap"
        )}
      >
        {/* Le texte principal de l'IA respire maintenant sur plusieurs paragraphes */}
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>

        {!isUser && sql && (
          <div className="rounded-lg bg-muted p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">SQL (mock)</p>
            {/* 🛠️ Fix sur le pré-formatage pour éviter qu'un long script SQL ne bloque le scroll vertical */}
            <pre className="overflow-x-auto text-xs text-foreground max-w-full whitespace-pre-wrap break-all font-mono">
              {sql}
            </pre>
          </div>
        )}

        {!isUser && explanation && (
          <p className="text-xs text-muted-foreground border-t border-border/40 pt-1 mt-1">
            {explanation}
          </p>
        )}
      </div>
    </div>
  );
}