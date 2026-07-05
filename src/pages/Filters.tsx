import { useState, useEffect } from "react";
import { IconPlus, IconTrash, IconArrowLeft, IconLoader2 } from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Filter {
  id: number;
  keyword: string;
  category: string;
  active: boolean;
}

const CATEGORIES = [
  { value: "testnet", label: "🧪 Testnet" },
  { value: "fcfs", label: "⚡ FCFS" },
  { value: "reward", label: "🎁 Reward" },
  { value: "allocation", label: "📊 Allocation" },
];

export default function FiltersPage() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("reward");

  useEffect(() => {
    fetch("/api/filters").then(r => r.json()).then(setFilters).finally(() => setLoading(false));
  }, []);

  const addFilter = async () => {
    if (!keyword.trim()) return;
    const res = await fetch("/api/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: keyword.trim().toLowerCase(), category }),
    });
    if (res.ok) {
      const data = await res.json();
      setFilters(prev => [...prev, data]);
      setKeyword("");
      toast.success(`Filter "${keyword.trim()}" ditambahkan`);
    } else {
      toast.error("Gagal menambah filter");
    }
  };

  const toggleFilter = async (id: number) => {
    const res = await fetch(`/api/filters/${id}/toggle`, { method: "PATCH" });
    if (res.ok) {
      setFilters(prev => prev.map(f => f.id === id ? { ...f, active: !f.active } : f));
    }
  };

  const deleteFilter = async (id: number) => {
    const res = await fetch(`/api/filters/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFilters(prev => prev.filter(f => f.id !== id));
      toast.success("Filter dihapus");
    }
  };

  const byCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = filters.filter(f => f.category === cat.value);
    return acc;
  }, {} as Record<string, Filter[]>);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link to="/">
            <Button size="icon" variant="ghost" className="size-8">
              <IconArrowLeft className="size-4" />
            </Button>
          </Link>
          <h1 className="text-sm font-semibold">Manage Filters</h1>
          <span className="text-xs text-muted-foreground">{filters.filter(f => f.active).length} aktif</span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* Add form */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tambah Filter Baru</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="keyword..."
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addFilter()}
                className="text-sm flex-1"
              />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-32 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" onClick={addFilter}>
                <IconPlus className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filter groups */}
        {loading ? (
          <div className="py-20 text-center"><IconLoader2 className="mx-auto size-6 animate-spin" /></div>
        ) : (
          CATEGORIES.map(cat => {
            const items = byCategory[cat.value] || [];
            if (items.length === 0) return null;
            return (
              <Card key={cat.value}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{cat.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {items.map(f => (
                      <Badge
                        key={f.id}
                        variant={f.active ? "default" : "outline"}
                        className="cursor-pointer gap-2 text-xs"
                        onClick={() => toggleFilter(f.id)}
                      >
                        {f.keyword}
                        <button
                          onClick={e => { e.stopPropagation(); deleteFilter(f.id); }}
                          className="ml-1 opacity-50 hover:opacity-100"
                        >
                          <IconTrash className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </main>
  );
}
