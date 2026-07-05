import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchGarapan, toggleTrack, fetchTracked, updateTracked, deleteTracked } from "@/lib/api";
import type { Garapan } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconLogout, IconBookmark, IconBookmarkFilled, IconSearch, IconFilter, IconTrash, IconCalendar } from "@tabler/icons-react";

const FLAG_BADGES: Record<string, string> = {
  testnet: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  fcfs: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  reward: "bg-green-500/10 text-green-400 border-green-500/20",
  allocation: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

export default function Dashboard() {
  const { user, signIn, signUp, signOut } = useAuth();
  const [garapan, setGarapan] = useState<Garapan[]>([]);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [savedGarapan, setSavedGarapan] = useState<Garapan[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpMsg, setSignUpMsg] = useState("");
  const [tab, setTab] = useState<"all" | "saved">("all");
  const [deadlineInputs, setDeadlineInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    const [items, saved] = await Promise.all([
      fetchGarapan({ q: search, filter: activeFilter }),
      fetchTracked(),
    ]);
    setGarapan(items);
    setSavedIds(new Set(saved));
    const sg = await fetchTracked(saved);
    setSavedGarapan(sg);
    setLoading(false);
  }

  useEffect(() => {
    if (user) loadData();
  }, [search, activeFilter]);

  async function toggleSave(g: Garapan) {
    if (savedIds.has(g.id)) {
      await untoggleTrack(g.id);
      setSavedIds(prev => { const next = new Set(prev); next.delete(g.id); return next; });
    } else {
      await toggleTrack(g.id);
      setSavedIds(prev => new Set(prev).add(g.id));
    }
    const sg = await fetchTracked([...savedIds]);
    setSavedGarapan(sg);
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

  if (!user) return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border/40 shadow-none">
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{isSignUp ? "Create Account" : "Sign In"}</h2>
            <p className="text-sm text-muted-foreground">{isSignUp ? "Create an account to save garapan." : "Sign in to see your saved garapan."}</p>
          </div>
          <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button className="w-full" onClick={async () => {
            const fn = isSignUp ? signUp : signIn;
            const { error } = await fn(email, password);
            if (error) { alert(error.message); return; }
            if (isSignUp) {
              setSignUpMsg("Akun berhasil dibuat! Silakan sign in.");
              setIsSignUp(false);
            }
          }}>
            {isSignUp ? "Sign Up" : "Sign In"}
          </Button>
          {signUpMsg && <p className="text-xs text-green-400 text-center">{signUpMsg}</p>}
          <button className="text-xs text-muted-foreground hover:underline w-full text-center" onClick={() => { setIsSignUp(!isSignUp); setSignUpMsg(""); }}>
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </CardContent>
      </Card>
    </main>
  );

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">Garapan</h1>
            <div className="flex gap-1">
              <Button variant={tab === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("all")}>All</Button>
              <Button variant={tab === "saved" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("saved")}>Saved ({savedIds.size})</Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{user.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut}><IconLogout className="size-4" /></Button>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 py-2 flex gap-2">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          {["testnet","fcfs","reward","allocation"].map(f => (
            <Badge key={f} onClick={() => setActiveFilter(activeFilter === f ? null : f)}
              className={activeFilter === f ? "bg-primary text-primary-foreground cursor-pointer" : "cursor-pointer"} variant="outline"
            >{f}</Badge>
          ))}
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-4 py-6">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading...</p>
        ) : (tab === "saved" ? savedGarapan : garapan).length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No garapan found.</p>
        ) : (
          <div className="grid gap-3">
            {(tab === "saved" ? savedGarapan : garapan).map(g => (
              <Card key={g.id} className="group border-border/40 transition-colors hover:border-border/80">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-pretty">{g.text}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {g.flags?.map(fl => (
                          <Badge key={fl} className={FLAG_BADGES[fl] || ""} variant="outline">{fl}</Badge>
                        ))}
                        <span className="text-xs text-muted-foreground">{formatDate(g.posted_at)}</span>
                      </div>
                      {g.links?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {g.links.map((l,i) => (
                            <a key={i} href={l} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate max-w-[200px]">{new URL(l).hostname}{new URL(l).pathname.slice(0,20)}</a>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => toggleSave(g)} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {savedIds.has(g.id) ? <IconBookmarkFilled className="size-4 text-primary" /> : <IconBookmark className="size-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
