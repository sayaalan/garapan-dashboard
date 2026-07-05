import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { fetchGarapan, fetchStats, type GarapanRow } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const flagColors: Record<string, string> = {
  testnet: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  fcfs: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  reward: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  allocation: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

export default function Dashboard() {
  const { user, signIn, loading: authLoading } = useAuth();
  const [garapan, setGarapan] = useState<GarapanRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [flags, setFlags] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => { fetchStats().then(setStats).catch(() => {}); }, []);

  useEffect(() => {
    const filter = flags.length > 0 ? flags.join(",") : "";
    fetchGarapan(page, 20, filter).then(({ items, total: t }) => {
      setGarapan(items); setTotal(t);
    }).catch(() => {});
  }, [page, flags]);

  const toggleFlag = (f: string) => {
    setFlags((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
    setPage(1);
  };

  const filtered = search ? garapan.filter((g) => g.text.toLowerCase().includes(search.toLowerCase())) : garapan;

  if (authLoading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm border-border/40 shadow-none">
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
              <p className="text-sm text-muted-foreground">Enter your email to receive a magic link.</p>
            </div>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button className="w-full" onClick={async () => { const { error } = await signIn(email); if (!error) alert("Check your email for a magic link."); }}>
              Send magic link
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Garapan</h1>
            <p className="text-xs text-muted-foreground">{total} items</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {}} asChild>
              <a href="/saved">Saved</a>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {Object.keys(flagColors).map((f) => (
            <Badge key={f} variant="outline" className={`cursor-pointer select-none ${flags.includes(f) ? flagColors[f] : "opacity-50 hover:opacity-80"}`} onClick={() => toggleFlag(f)}>
              {f} {stats[f] ? `(${stats[f]})` : ""}
            </Badge>
          ))}
        </div>

        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="space-y-2 pr-2">
            {filtered.map((g) => (
              <Card key={g.id} className="border-border/30 bg-card/50 shadow-none transition-colors hover:bg-card/80">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{g.text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(g.flags || []).map((f) => <Badge key={f} variant="outline" className={`text-[10px] px-1.5 py-0 ${flagColors[f] || ""}`}>{f}</Badge>)}
                        <a href={g.telegram_url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2">source</a>
                        <span className="text-[10px] text-muted-foreground">{new Date(g.posted_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {total > 20 && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {page} / {Math.ceil(total / 20)}</span>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </main>
  );
}
