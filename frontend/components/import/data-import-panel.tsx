"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload, Wifi, WifiOff } from "lucide-react";
import {
  checkApiHealth,
  getApiBaseUrl,
  importFinancialFile,
  type ImportResponse,
} from "@/lib/api-client";
import { clearDataCache } from "@/lib/mock-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface DataImportPanelProps {
  onImportSuccess?: (result: ImportResponse) => void;
}

export function DataImportPanel({ onImportSuccess }: DataImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    checkApiHealth().then(setBackendOnline);
  }, []);

  const handleFile = useCallback((file: File | null) => {
    setSelectedFile(file);
    setResult(null);
    setError(null);
  }, []);

  async function handleImport() {
    if (!selectedFile) return;

    const online = await checkApiHealth();
    setBackendOnline(online);
    if (!online) {
      setError(
        `Backend inaccessible sur ${getApiBaseUrl()}. Lancez : python -m uvicorn backend.api.main:app --port 8000`,
      );
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await importFinancialFile(selectedFile);
      setResult(response);

      if (response.success || response.status === "processed") {
        // Clear all local cache structures immediately
        clearDataCache();
        
        // Propagate state invalidation to the parent views so they refetch from /financial/processed
        if (onImportSuccess) {
          onImportSuccess(response);
        }
      } else if (response.status === "quota_exceeded" || response.status === "gemini_error") {
        setError(response.message || "L'extraction a échoué via Gemini.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Upload className="h-5 w-5" />
          Importer des données financières
        </CardTitle>
        <CardDescription>
          PDF, TXT ou JSON — analyse RAG puis extraction Gemini vers{" "}
          <code className="text-xs">data/processed/</code>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {backendOnline === false && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>Backend hors ligne</AlertTitle>
            <AlertDescription>
              Démarrez le serveur API sur {getApiBaseUrl()} avant d&apos;importer.
            </AlertDescription>
          </Alert>
        )}

        {backendOnline === true && (
          <Alert>
            <Wifi className="h-4 w-4" />
            <AlertTitle>Backend connecté</AlertTitle>
            <AlertDescription>
              {getApiBaseUrl()} — l&apos;extraction PDF peut prendre 1 à 3 minutes.
            </AlertDescription>
          </Alert>
        )}

        <div
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <FileUp className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">Glissez un fichier ou sélectionnez-le</p>
          <p className="mt-1 text-xs text-muted-foreground">
            États financiers d&apos;assurance (vie / non-vie)
          </p>

          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row">
            <Input
              ref={inputRef}
              type="file"
              accept=".pdf,.txt,.json"
              className="max-w-xs"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <Button onClick={handleImport} disabled={!selectedFile || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extraction en cours...
                </>
              ) : (
                "Importer"
              )}
            </Button>
          </div>

          {selectedFile && (
            <p className="mt-3 text-xs text-muted-foreground">
              Fichier sélectionné : {selectedFile.name}
            </p>
          )}

          {loading && (
            <p className="mt-2 text-xs text-muted-foreground">
              Ne fermez pas cette page — analyse RAG + extraction Gemini en cours.
            </p>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
          </Alert>
        )}

        {result && !result.success && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              {result.status === "quota_exceeded"
                ? "Quota Gemini dépassé"
                : "Document non traité"}
            </AlertTitle>
            <AlertDescription className="space-y-2 whitespace-pre-wrap">
              <p>{result.message}</p>
              {result.status === "quota_exceeded" && (
                <p className="text-xs opacity-90">
                  Le plan gratuit Gemini limite ~20 requêtes/jour. Réessayez demain, ou
                  augmentez votre quota sur Google AI Studio.
                </p>
              )}
              {result.classification?.reason && (
                <p className="text-xs opacity-90">
                  Analyse RAG : {result.classification.reason}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {result?.success && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Import réussi</AlertTitle>
            <AlertDescription className="space-y-1">
              <p>{result.message}</p>
              {result.output_file && (
                <p className="text-xs text-muted-foreground">
                  Fichier généré : {result.output_file}
                </p>
              )}
              {result.classification?.reason && (
                <p className="text-xs text-muted-foreground">
                  Classification : {result.classification.reason}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Les données sont maintenant disponibles dans le dashboard.
              </p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}