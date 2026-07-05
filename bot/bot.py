#!/usr/bin/env python3
import os,sqlite3,json,sys,re
from datetime import datetime,timezone,timedelta
from telegram import Update
from telegram.ext import Application,CommandHandler,ContextTypes
DB="/home/workspace/Projects/garapan-dashboard/data/garapan.db"
TOKEN=os.environ.get("TELEGRAM_BOT_TOKEN","")
def get_db():
 return sqlite3.connect(DB)

async def cmd_new(update, ctx):
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    rows = db.execute(
        "SELECT id, text, flags, telegram_url FROM garapan WHERE scraped_at > ? ORDER BY posted_at DESC LIMIT 10",
        [cutoff]
    ).fetchall()
    db.close()
    if not rows:
        await update.message.reply_text("No new garapan in the last 24 hours.")
        return
    msg = "New garapan (24h):\n\n"
    for r in rows:
        flags = json.loads(r[2] or "[]")
        flag_str = " ".join(f"#{f}" for f in flags)
        msg += f"[{r[0]}] {r[1][:100]}...\n{flag_str}\n{r[3]}\n\n"
    await update.message.reply_text(msg[:4000], disable_web_page_preview=True)

async def cmd_track(update, ctx):
    db = get_db()
    if not ctx.args:
        await update.message.reply_text("Usage: /track <garapan_id>")
        db.close()
        return
    gid = ctx.args[0]
    g = db.execute(
        "SELECT id, text FROM garapan WHERE id=? OR post_id=?",
        [gid, gid]
    ).fetchone()
    if not g:
        await update.message.reply_text(f"Garapan {gid} not found.")
        db.close()
        return
    db.execute(
        "INSERT OR IGNORE INTO tracked (garapan_id, status) VALUES (?, 'active')",
        [g[0]]
    )
    db.execute(
        "UPDATE scrape_state SET last_check = ? WHERE id = 1",
        [datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")]
    )
    db.commit()
    db.close()
    await update.message.reply_text(f"Tracking garapan [{g[0]}]: {g[1][:80]}...")

async def cmd_list(update, ctx):
    db = get_db()
    rows = db.execute(
        """SELECT t.id, t.garapan_id, g.text, g.flags, t.status, t.deadline, g.telegram_url
           FROM tracked t LEFT JOIN garapan g ON t.garapan_id = g.id
           ORDER BY t.status ASC, t.deadline ASC LIMIT 15"""
    ).fetchall()
    db.close()
    if not rows:
        await update.message.reply_text("No tracked garapan.")
        return
    msg = "Tracked garapan:\n\n"
    for r in rows:
        flags = json.loads(r[3] or "[]")
        flag_str = " ".join(f"#{f}" for f in flags)
        dl = f" (deadline: {r[5][:10]})" if r[5] else ""
        msg += f"[T{r[0]}] {r[4]}{dl}\n{r[2][:80]}...\n{flag_str}\n{r[6]}\n\n"
    await update.message.reply_text(msg[:4000], disable_web_page_preview=True)

async def cmd_untrack(update, ctx):
    db = get_db()
    if not ctx.args:
        await update.message.reply_text("Usage: /untrack <track_id>")
        db.close()
        return
    tid = ctx.args[0]
    db.execute("DELETE FROM tracked WHERE id=?", [tid])
    db.commit()
    changed = db.total_changes
    db.close()
    if changed:
        await update.message.reply_text(f"Untracked [{tid}].")
    else:
        await update.message.reply_text(f"Track ID {tid} not found.")

async def cmd_end(update, ctx):
    db = get_db()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    week = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%d")
    rows = db.execute(
        """SELECT t.id, g.text, g.flags, t.deadline, g.telegram_url
           FROM tracked t LEFT JOIN garapan g ON t.garapan_id = g.id
           WHERE t.status='active' AND t.deadline IS NOT NULL AND t.deadline <= ?
           ORDER BY t.deadline ASC""",
        [week]
    ).fetchall()
    db.close()
    if not rows:
        await update.message.reply_text("No garapan ending within 7 days.")
        return
    msg = "Ending soon:\n\n"
    for r in rows:
        flags = json.loads(r[2] or "[]")
        flag_str = " ".join(f"#{f}" for f in flags)
        msg += f"[T{r[0]}] deadline: {r[3][:10]}\n{r[1][:80]}...\n{flag_str}\n{r[4]}\n\n"
    await update.message.reply_text(msg[:4000], disable_web_page_preview=True)

async def cmd_deadline(update, ctx):
    if len(ctx.args) < 2:
        await update.message.reply_text("Usage: /deadline <track_id> <YYYY-MM-DD>")
        return
    db = get_db()
    tid, dl = ctx.args[0], ctx.args[1]
    db.execute("UPDATE tracked SET deadline=? WHERE id=?", [dl, tid])
    db.commit()
    changed = db.total_changes
    db.close()
    if changed:
        await update.message.reply_text(f"Deadline for [{tid}] set to {dl}.")
    else:
        await update.message.reply_text(f"Track ID {tid} not found.")

async def cmd_status(update, ctx):
    if len(ctx.args) < 2:
        await update.message.reply_text("Usage: /status <track_id> <active|claimed|expired>")
        return
    db = get_db()
    tid, status = ctx.args[0], ctx.args[1]
    db.execute("UPDATE tracked SET status=? WHERE id=?", [status, tid])
    db.commit()
    changed = db.total_changes
    db.close()
    if changed:
        await update.message.reply_text(f"Status [{tid}] updated to {status}.")
    else:
        await update.message.reply_text(f"Track ID {tid} not found.")

async def cmd_help(update, ctx):
    msg = (
        "*Garapan Monitor Bot*\n\n"
        "/new - Recent garapan (24h)\n"
        "/track <id> - Track a garapan\n"
        "/list - List tracked\n"
        "/untrack <tid> - Untrack\n"
        "/end - Ending within 7 days\n"
        "/deadline <tid> <date> - Set deadline\n"
        "/status <tid> <active|claimed|expired>\n"
        "/help - This help"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        print("Set TELEGRAM_BOT_TOKEN env var")
        sys.exit(1)
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("new", cmd_new))
    app.add_handler(CommandHandler("start", cmd_help))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("track", cmd_track))
    app.add_handler(CommandHandler("list", cmd_list))
    app.add_handler(CommandHandler("untrack", cmd_untrack))
    app.add_handler(CommandHandler("end", cmd_end))
    app.add_handler(CommandHandler("deadline", cmd_deadline))
    app.add_handler(CommandHandler("status", cmd_status))
    print("Bot polling...")
    app.run_polling()

if __name__ == "__main__":
    main()
