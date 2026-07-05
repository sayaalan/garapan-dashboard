#!/usr/bin/env python3
"""Scrape Telegram channel @AirdropShogun for garapan posts from June 6, 2026 onwards."""

import requests
from bs4 import BeautifulSoup
import time
import json
import re
from datetime import datetime, timezone
from urllib.parse import urljoin

CHANNEL = "AirdropShogun"
BASE_URL = f"https://t.me/s/{CHANNEL}"
OUTPUT_MD = "/home/workspace/garapan_airdrop_shogun.md"
OUTPUT_JSON = "/home/.z/workspaces/con_1OfYntYPJWTHv8hO/garapan_raw.json"
CUTOFF_DATE = datetime(2026, 6, 6, tzinfo=timezone.utc)
DELAY = 0.5  # seconds between requests
MAX_PAGES = 200  # safety limit


def extract_post_id(data_post):
    if not data_post:
        return None
    m = re.search(r"/(\d+)$", data_post)
    return int(m.group(1)) if m else None


def is_garapan(text, links):
    """Heuristics to determine if a post is a 'garapan' (airdrop task)."""
    text_lower = text.lower()

    # Strong signals
    garapan_keywords = [
        "garapan", "airdrop", "register", "task", "reward",
        "testnet", "mainnet", "waitlist", "claim", "bot",
        "join", "mint", "nft", "whitelist", "min wd",
        "withdraw", "faucet", "retrodrop", "retro drop",
        "galxe", "zealy", "layer3", "intract", "gleam",
        "quest", "protocol", "node", "validator",
    ]

    score = 0
    for kw in garapan_keywords:
        if kw in text_lower:
            score += 1

    # Has links (typical for tasks)
    if len(links) >= 1:
        score += 2

    # Has emoji/formatting typical of airdrop posts
    if any(c in text for c in ["➖", "➡️", "🪂", "🏷", "✍️", "📌"]):
        score += 1

    # Contains instructions (numbered lists, bullet points)
    if re.search(r"\d+[\.\)]\s|•|-", text):
        score += 1

    return score >= 3


def parse_message_block(msg_wrap):
    """Parse a single tgme_widget_message_wrap block."""
    msg_div = msg_wrap.find("div", class_="tgme_widget_message")
    if not msg_div:
        return None

    data_post = msg_div.get("data-post", "")
    post_id = extract_post_id(data_post)

    time_tag = msg_wrap.find("time")
    dt_str = time_tag.get("datetime", "") if time_tag else ""
    try:
        dt = datetime.fromisoformat(dt_str)
    except ValueError:
        return None

    # Get all text divs (some messages have reply + main text)
    text_divs = msg_wrap.find_all("div", class_="tgme_widget_message_text")
    full_text = "\n".join(t.get_text("\n", strip=True) for t in text_divs)

    # Extract links
    links = []
    for a in msg_wrap.find_all("a"):
        href = a.get("href", "")
        if href and href.startswith("http"):
            links.append(href)

    # Get post URL
    post_url = f"https://t.me/{CHANNEL}/{post_id}" if post_id else None

    return {
        "post_id": post_id,
        "datetime": dt_str,
        "timestamp": dt.timestamp(),
        "text": full_text,
        "links": links,
        "url": post_url,
    }


def fetch_page(url):
    """Fetch a page and return soup + next_offset."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # Find "older posts" link for pagination
    prev_link = soup.find("link", rel="prev")
    next_url = None
    if prev_link:
        next_url = urljoin(BASE_URL + "/", prev_link.get("href", ""))

    return soup, next_url


def scrape():
    """Main scrape function for use by automation."""
    print("=" * 60)
    print(f"🔍 Scraping @{CHANNEL} Telegram Channel")
    print(f"📅 Cutoff date: {CUTOFF_DATE}")
    print("=" * 60)

    all_posts = []
    url = BASE_URL
    page = 0
    stopped_early = False

    while url and page < MAX_PAGES:
        page += 1
        print(f"📄 Fetching page {page}: {url}")
        try:
            soup, url = fetch_page(url)
        except Exception as e:
            print(f"❌ Error fetching page {page}: {e}")
            # For t.me pages, the next URL may be relative
            if url and not url.startswith("http"):
                url = urljoin(BASE_URL + "/", url)
                continue
            break

        msg_wraps = soup.find_all("div", class_="tgme_widget_message_wrap")
        if not msg_wraps:
            print("  No more messages found.")
            break

        for mw in msg_wraps:
            post = parse_message_block(mw)
            if post:
                all_posts.append(post)

        print(f"  Got {len(msg_wraps)} posts this page (total: {len(all_posts)})")

        # Check if we've gone past cutoff
        if all_posts:
            earliest = min(p["timestamp"] for p in all_posts)
            earliest_dt = datetime.fromtimestamp(earliest, tz=timezone.utc)
            print(f"  Earliest post so far: {earliest_dt}")
            if earliest < CUTOFF_DATE.timestamp():
                print("  ✅ Reached cutoff date. Stopping.")
                stopped_early = True
                break

        time.sleep(DELAY)

    # Filter: after cutoff + is garapan
    cutoff_ts = CUTOFF_DATE.timestamp()
    recent = [p for p in all_posts if p["timestamp"] >= cutoff_ts]
    garapan = [p for p in recent if is_garapan(p["text"], p["links"])]
    non_garapan = [p for p in recent if not is_garapan(p["text"], p["links"])]

    # Save raw data
    with open(OUTPUT_JSON, "w") as f:
        json.dump(all_posts, f, indent=2, ensure_ascii=False)

    # Generate markdown
    lines = [
        f"# 🪂 Garapan @AirdropShogun",
        f"",
        f"**Filter dari tanggal 6 Juni 2026**",
        f"**Total garapan ditemukan: {len(garapan)}**",
        f"**Date range:** {recent[-1]['datetime'] if recent else 'N/A'} → {recent[0]['datetime'] if recent else 'N/A'}",
        f"",
        "---",
        "",
    ]

    # Group by date
    from collections import defaultdict
    by_date = defaultdict(list)
    for g in garapan:
        date_key = g["datetime"][:10]
        by_date[date_key].append(g)

    for date_key in sorted(by_date.keys(), reverse=True):
        posts = by_date[date_key]
        lines.append(f"## 📅 {date_key} ({len(posts)} garapan)")
        lines.append("")
        for i, p in enumerate(posts, 1):
            time_str = p["datetime"][11:16]
            lines.append(f"### {i}. [{time_str} UTC]")
            if p["url"]:
                lines.append(f"🔗 [Open post]({p['url']})")
            lines.append("")
            lines.append(p["text"])
            lines.append("")
            if p["links"]:
                lines.append("**Links:**")
                for link in p["links"]:
                    lines.append(f"- {link}")
                lines.append("")
            lines.append("---")
            lines.append("")

    with open(OUTPUT_MD, "w") as f:
        f.write("\n".join(lines))

    # Summary
    print(f"\n{'='*60}")
    print(f"📊 Total posts scraped: {len(all_posts)}")
    print(f"💾 Raw data saved: {OUTPUT_JSON}")
    print(f"🎯 Garapan found: {len(garapan)}")
    print(f"📝 Other posts (filtered out): {len(non_garapan)}")
    if recent:
        print(f"📆 Date range: {recent[-1]['datetime']} → {recent[0]['datetime']}")
    print(f"✅ Markdown saved: {OUTPUT_MD}")
    print(f"\n{'='*60}")

    if garapan:
        print(f"📋 SAMPLE (first 3 garapan):")
        print()
        for g in garapan[:3]:
            print(f"[{g['datetime']}] ID={g['post_id']}")
            print(f"  {g['text'][:200]}...")
            print(f"  Links: {len(g['links'])}")
            print()


if __name__ == "__main__":
    main()
