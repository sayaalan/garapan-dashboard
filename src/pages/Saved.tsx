import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchTracked, deleteTracked, updateTracked, type TrackedRow } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

const flagColors: Record<string, string> = {
  testnet: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  fcfs: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  reward: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  allocation: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

export default function Saved() {
  const { user } = useAuth();
  const [tracked, setTracked] = useState<TrackedRow[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchTracked(user.id).then(setTracked).catch(() => {});
  }, [user]);

  if (!user) return null;

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Saved</h1>
            <p className="text-xs text-muted-foreground">{tracked.length} items</p>
          </div>
          <Button variant="outline" size="sm" asChild><a href="/">Back</a></Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-4">
        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="space-y-2 pr-2">
            {tracked.map((t) => (
              <Card key={t.id} className="border-border/30 bg-card/50 shadow-none">
                <CardContent className="p-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{t.garapan?.text || "(deleted)"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(t.garapan?.flags || []).map((f: string) => (
                      <Badge key={f} variant="outline" className={`text-[10px] px-1.5 py-0 ${flagColors[f] || ""}`}>{f}</Badge>
                    ))}
                    <Badge variant={t.status === "done" ? "default" : "outline"} className="text-[10px] px-1.5 py-0 cursor-pointer" onClick={() => updateTracked(t.id, "status", t.status === "done" ? "pending" : "done")}>
                      {t.status}
                    </Badge>
                    {t.deadline && <span className="text-[10px] text-muted-foreground">due {t.deadline}</span>}
                    <Button variant="ghost" size="sm" className="h-5 text-[10px] text-red-400 hover:text-red-300 px-1.5" onClick={() => { deleteTracked(t.id); setTracked((p) => p.filter((x) => x.id !== t.id)); }}>
                      remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </main>
  );
}
