
#!/usr/bin/env python3
"""Garapan Monitor — Telegram Bot + Auto Scraper (Zero Token)

Runs 24/7 on Zo as a process service. No AI/LLM involved.
- Polls Telegram for user commands
- Scrapes @AirdropShogun every 30 minutes via APScheduler
- Stores everything in Supabase
"""

import os, sys, json, time, re, sqlite3
from datetime import datetime, timezone, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes
from apscheduler.schedulers.background import BackgroundScheduler

# ── Config ──
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_ANON_KEY"]

HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
           "Content-Type": "application/json", "Prefer": "return=representation"}

CHANNEL = "AirdropShogun"
BASE_URL = f"https://t.me/s/{CHANNEL}"
SCRAPE_INTERVAL_MIN = 30  # check every 30 minutes
REQUEST_DELAY = 0.5

# ── Supabase Helpers ──
def supabase_get(table, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.get(url, headers=HEADERS, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()

def supabase_post(table, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.post(url, headers=HEADERS, json=data, timeout=15)
    resp.raise_for_status()
    return resp.json()

def supabase_patch(table, data, match_col, match_val):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{match_col}=eq.{match_val}"
    resp = requests.patch(url, headers={**HEADERS, "Prefer": "return=representation"}, json=data, timeout=15)
    return resp

def supabase_delete(table, match_col, match_val):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{match_col}=eq.{match_val}"
    resp = requests.delete(url, headers=HEADERS, timeout=15)
    return resp

# ── Keywords ──
KEYWORDS = {
    "testnet": ["testnet", "test net", "testnet"],
    "fcfs": ["fcfs", "first come", "first-come"],
    "reward": ["reward", "hadiah", "rewards", "$", "usdc", "usdt", "token"],
    "allocation": ["allocation", "alokasi", "airdrop", "claim", "distribute"],
}

def detect_flags(text):
    """Detect which flags match in the text."""
    t = text.lower()
    flags = []
    for flag, kws in KEYWORDS.items():
        if any(kw in t for kw in kws):
            flags.append(flag)
    return flags

def extract_links(text):
    """Extract all URLs from text."""
    return re.findall(r'https?://[^\s)]+', text)

def is_garapan(text, links):
    """Heuristic: is this an airdrop task post?"""
    t = text.lower()
    indicators = ["airdrop", "task", "complete task", "reward", "join", "register",
                  "garapan", "faucet", "claim", "mint", "stake", "testnet", "mainnet",
                  "galxe", "zealy", "layer3", "intract", "quest", "mission",
                  "➖", "▫️", "✅", "step", "follow", "retweet", "like"]
    score = sum(1 for ind in indicators if ind in t)
    return score >= 2 or len(links) >= 3

# ── Scraper ──
def scrape():
    """Scrape @AirdropShogun for new posts, push to Supabase."""
    print(f"[scrape] Starting at {datetime.now(timezone.utc).isoformat()}")

    # Get last telegram_id from Supabase
    last = supabase_get("garapan", {"select": "telegram_id", "order": "telegram_id.desc", "limit": "1"})
    last_id = last[0]["telegram_id"] if last else 0

    new_count = 0
    page_url = BASE_URL

    for page_num in range(20):  # max 20 pages
        resp = requests.get(page_url, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")
        messages = soup.select(".tgme_widget_message_wrap")

        if not messages:
            break

        for wrap in messages:
            msg_div = wrap.select_one(".tgme_widget_message")
            if not msg_div:
                continue
            data_post = msg_div.get("data-post", "")
            m = re.search(r"/(\d+)$", data_post)
            if not m:
                continue
            post_id = int(m.group(1))
            if post_id <= last_id:
                continue

            # Extract time
            time_el = wrap.select_one(".tgme_widget_message_date time")
            dt_str = time_el.get("datetime", "") if time_el else ""
            try:
                posted_at = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            except:
                posted_at = datetime.now(timezone.utc)

            # Extract text
            text_div = wrap.select_one(".tgme_widget_message_text")
            text = text_div.get_text("\n", strip=True) if text_div else ""

            # Extract links
            links = extract_links(text)

            # Check if garapan
            if not is_garapan(text, links):
                continue

            flags = detect_flags(text)
            post_url = f"{BASE_URL}/{post_id}"

            data = {
                "telegram_id": post_id,
                "text": text[:3000],
                "flags": flags,
                "links": links[:20],
                "telegram_url": post_url,
                "posted_at": posted_at.isoformat(),
            }

            try:
                supabase_post("garapan", data)
                new_count += 1
                print(f"[scrape] + #{post_id}: {text[:80]}... flags={flags}")
            except Exception as e:
                print(f"[scrape] Error inserting #{post_id}: {e}")

        # Next page
        older_link = soup.select_one(f'a.tgme_widget_message_date[href*="before="]')
        if older_link:
            page_url = older_link.get("href")
        else:
            break

        time.sleep(REQUEST_DELAY)

    print(f"[scrape] Done. New: {new_count}")

# ── Bot Handlers ──
async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    msg = (
        "🛡 *Garapan Monitor*\\\n\n"
        "Bot tracking airdrop & testnet dari @AirdropShogun\\.\n\n"
        "📋 */new* \\- Garapan baru \\(24 jam\\)\n"
        "💾 */save <id>* \\- Simpan ke list\n"
        "📌 */list* \\- Lihat list tersimpan\n"
        "✅ */done <id>* \\- Tandai selesai\n"
        "❌ */drop <id>* \\- Hapus dari list\n"
        "⏰ */dl <id> <YYYY\\-MM\\-DD>* \\- Set deadline\n"
        "🔍 */search <kata>* \\- Cari garapan\n"
        "🔄 */scrape* \\- Paksa scrape sekarang"
    )
    await update.message.reply_text(msg, parse_mode="MarkdownV2")

async def cmd_new(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    items = supabase_get("garapan", {
        "select": "id,telegram_id,text,flags,links,telegram_url,posted_at",
        "order": "posted_at.desc",
        "posted_at": f"gte.{cutoff}",
        "limit": "10"
    })
    if not items:
        await update.message.reply_text("Belum ada garapan baru dalam 24 jam terakhir.")
        return
    for g in items:
        flags = ", ".join(g.get("flags", [])) or "—"
        txt = g["text"][:200].replace("*", "\\*").replace("_", "\\_").replace("[", "\\[").replace("]", "\\]")
        line = f"*\\#{g['id']}* \\[{flags}\\]\n{txt}\\.\\.\\."
        if g.get("telegram_url"):
            line += f"\n[Link]({g['telegram_url']})"
        await update.message.reply_text(line, parse_mode="MarkdownV2", disable_web_page_preview=True)

async def cmd_save(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not ctx.args:
        await update.message.reply_text("Usage: /save <garapan_id>")
        return
    gid = int(ctx.args[0])
    uid = str(update.effective_user.id)
    data = {"user_id": uid, "garapan_id": gid, "status": "todo"}
    try:
        result = supabase_post("tracked", data)
        await update.message.reply_text(f"✅ Garapan #{gid} disimpan\\!")
    except Exception as e:
        err = str(e)
        if "duplicate" in err.lower() or "23505" in err:
            await update.message.reply_text(f"⚠️ Garapan #{gid} udah ada di list.")
        else:
            await update.message.reply_text(f"❌ Gagal: {err[:100]}")

async def cmd_list(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    uid = str(update.effective_user.id)
    items = supabase_get("tracked", {
        "select": "id,garapan_id,status,deadline,garapan(text,flags,telegram_url)",
        "user_id": f"eq.{uid}",
        "order": "id.desc",
        "limit": "15"
    })
    if not items:
        await update.message.reply_text("List kosong. Pakai /save <id> buat nambahin.")
        return

    for t in items:
        g = t.get("garapan", {}) or {}
        status_emoji = {"todo": "⬜", "doing": "🔄", "done": "✅"}.get(t.get("status"), "⬜")
        flags = ", ".join(g.get("flags", [])) or "—"
        txt = (g.get("text") or "")[:100].replace("*", "\\*")
        dl = f" ⏰{t['deadline']}" if t.get("deadline") else ""
        line = f"{status_emoji} *Track \\#{t['id']}* \\(Garapan \\#{t.get('garapan_id')}\\) \\[{flags}\\]{dl}\n{txt}\\.\\.\\."
        await update.message.reply_text(line, parse_mode="MarkdownV2")

async def cmd_done(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not ctx.args:
        await update.message.reply_text("Usage: /done <track_id>")
        return
    tid = int(ctx.args[0])
    r = supabase_patch("tracked", {"status": "done"}, "id", tid)
    await update.message.reply_text(f"✅ Track #{tid} selesai\\!")

async def cmd_drop(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not ctx.args:
        await update.message.reply_text("Usage: /drop <track_id>")
        return
    tid = int(ctx.args[0])
    supabase_delete("tracked", "id", tid)
    await update.message.reply_text(f"🗑 Track #{tid} dihapus.")

async def cmd_deadline(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if len(ctx.args) < 2:
        await update.message.reply_text("Usage: /dl <track_id> <YYYY-MM-DD>")
        return
    tid = int(ctx.args[0])
    dl = ctx.args[1]
    supabase_patch("tracked", {"deadline": dl}, "id", tid)
    await update.message.reply_text(f"⏰ Deadline track #{tid}: {dl}")

async def cmd_search(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not ctx.args:
        await update.message.reply_text("Usage: /search <keyword>")
        return
    kw = " ".join(ctx.args)
    items = supabase_get("garapan", {
        "select": "id,telegram_id,text,flags,telegram_url,posted_at",
        "order": "posted_at.desc",
        "limit": "10",
        "text": f"ilike.*{kw}*"
    })
    if not items:
        await update.message.reply_text(f"Ga ketemu garapan dengan kata '{kw}'.")
        return
    await update.message.reply_text(f"🔍 Hasil '{kw}' — {len(items)} ditemukan:")
    for g in items[:5]:
        flags = ", ".join(g.get("flags", [])) or "—"
        txt = g["text"][:150].replace("*", "\\*")
        await update.message.reply_text(
            f"*\\#{g['id']}* \\[{flags}\\]\n{txt}\\.\\.\\.",
            parse_mode="MarkdownV2"
        )

async def cmd_scrape_now(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🔄 Scraping...")
    try:
        scrape()
        await update.message.reply_text("✅ Scrape selesai!")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {str(e)[:200]}")

# ── Main ──
def main():
    print("[bot] Starting Garapan Monitor...")

    # Start scheduler for periodic scraping
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(scrape, "interval", minutes=SCRAPE_INTERVAL_MIN, id="scrape_job")
    scheduler.start()
    print(f"[bot] Scheduler started — scraping every {SCRAPE_INTERVAL_MIN} min")

    # Do initial scrape
    try:
        scrape()
    except Exception as e:
        print(f"[bot] Initial scrape failed: {e}")

    # Start Telegram bot
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("new", cmd_new))
    app.add_handler(CommandHandler("save", cmd_save))
    app.add_handler(CommandHandler("list", cmd_list))
    app.add_handler(CommandHandler("done", cmd_done))
    app.add_handler(CommandHandler("drop", cmd_drop))
    app.add_handler(CommandHandler("dl", cmd_deadline))
    app.add_handler(CommandHandler("search", cmd_search))
    app.add_handler(CommandHandler("scrape", cmd_scrape_now))

    print("[bot] Telegram bot polling started")
    app.run_polling()

if __name__ == "__main__":
    main()
