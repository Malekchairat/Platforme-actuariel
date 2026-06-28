"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload, Wifi, WifiOff, Trash2, FileText, Search, X } from "lucide-react";
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
  onDeleteSuccess?: () => void; // Nouvelle prop dédiée pour éviter la redirection
}

interface ProcessedFile {
  id: string;
  filename: string;
  company: string;
}

export function DataImportPanel({ onImportSuccess, onDeleteSuccess }: DataImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  
  // Notification verte de suppression
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);
  
  // États de gestion des fichiers importés
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Charger la liste des fichiers traités depuis le backend
  const fetchProcessedFiles = useCallback(async () => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/financial/processed`);
      if (res.ok) {
        const data = await res.json();
        setProcessedFiles(data);
      }
    } catch (err) {
      console.error("Erreur lors de la récupération des fichiers traités", err);
    }
  }, []);

  useEffect(() => {
    checkApiHealth().then((online) => {
      setBackendOnline(online);
      if (online) {
        fetchProcessedFiles();
      }
    });
  }, [fetchProcessedFiles]);

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
        `Backend inaccessible sur ${getApiBaseUrl()}. Lancez le serveur local.`,
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
        clearDataCache();
        await fetchProcessedFiles(); // Rafraîchir la liste après l'import
        
        if (onImportSuccess) {
          onImportSuccess(response);
        }
        setSelectedFile(null);
        if (inputRef.current) inputRef.current.value = "";
      } else if (response.status === "quota_exceeded" || response.status === "gemini_error") {
        setError(response.message || "L'extraction a échoué via Gemini.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteFile(id: string, company: string) {
    if (!confirm(`Voulez-vous vraiment supprimer définitivement les données financières de "${company}" ?`)) {
      return;
    }

    setDeletingId(id);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/financial/processed/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        clearDataCache(); // Vider les caches globaux
        
        // Mettre à jour l'affichage immédiatement à l'écran sans rechargement
        setProcessedFiles((prev) => prev.filter((f) => f.id !== id));
        
        // Déclencher la notification verte
        setDeleteSuccessMessage(`Le portefeuille d'assurance de "${company}" a été supprimé avec succès de la DB et du disque.`);
        
        // Faire disparaître la notification automatiquement après 6 secondes
        setTimeout(() => {
          setDeleteSuccessMessage(null);
        }, 6000);

        // Appeler le gestionnaire du store local pour mettre à jour les graphiques sans changer de page
        if (onDeleteSuccess) {
          onDeleteSuccess();
        }
      } else {
        const errData = await res.json();
        alert(`Erreur : ${errData.detail || "Impossible de supprimer le document"}`);
      }
    } catch (err) {
      alert("Erreur réseau lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  }

  // Filtrage intelligent / instantané côté client pour la recherche
  const filteredFiles = processedFiles.filter(
    (f) =>
      f.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative space-y-6">
      
      {/* BANDEAU DE NOTIFICATION VERT FLOTTANT (6 secondes) */}
      {deleteSuccessMessage && (
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 min-w-[380px] max-w-md bg-emerald-600 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center space-x-3 border border-emerald-500 animate-in fade-in slide-in-from-top duration-300">
          <CheckCircle2 className="h-5 w-5 shrink-0 bg-emerald-700 rounded-full p-0.5 text-white" />
          <div className="flex-1">
            <p className="font-semibold text-xs tracking-wide leading-relaxed">{deleteSuccessMessage}</p>
          </div>
          <button 
            onClick={() => setDeleteSuccessMessage(null)} 
            className="text-emerald-200 hover:text-white transition-colors p-1 rounded-full hover:bg-emerald-700/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center justify-between">
            <span>Portefeuilles & Référentiels Actifs</span>
            <span className="text-xs text-muted-foreground font-normal bg-muted px-2 py-0.5 rounded border">
              {processedFiles.length} Entités
            </span>
          </CardTitle>
          <CardDescription>
            Consultez, filtrez ou purgez les données extraites du marché de l&apos;assurance.
          </CardDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une compagnie ou un fichier..."
              className="pl-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden divide-y bg-card text-xs">
            {filteredFiles.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                Aucun état financier traité ne correspond à votre recherche.
              </div>
            ) : (
              filteredFiles.map((f) => (
                <div key={f.id} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-2.5">
                    <FileText className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-foreground">{f.company}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{f.filename}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingId === f.id}
                    className="h-7 w-7 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                    onClick={() => handleDeleteFile(f.id, f.company)}
                  >
                    {deletingId === f.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}