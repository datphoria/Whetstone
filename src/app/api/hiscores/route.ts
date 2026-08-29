import { NextResponse } from "next/server";
import type { PlayerSkills } from "@/lib/types";

/**
 * OSRS hiscores index_lite skill order (0 = overall).
 * https://oldschool.runescape.wiki/w/Hiscores
 */
const SKILL_LINES = [
  "overall",
  "attack",
  "defence",
  "strength",
  "hitpoints",
  "ranged",
  "prayer",
  "magic",
  "cooking",
  "woodcutting",
  "fletching",
  "fishing",
  "firemaking",
  "crafting",
  "smithing",
  "mining",
  "herblore",
  "agility",
  "thieving",
  "slayer",
  "farming",
  "runecraft",
  "hunter",
  "construction",
] as const;

function parseLevel(line: string | undefined, fallback: number): number {
  if (!line) return fallback;
  const parts = line.split(",");
  // rank,level,xp — unranked often -1,-1 or -1,1,-1
  const rank = Number(parts[0]);
  const level = Number(parts[1]);
  if (!Number.isFinite(level) || level < 1) return fallback;
  if (rank < 0 && level <= 1 && (parts[2] === "-1" || parts[2] == null)) return fallback;
  return Math.min(99, Math.max(1, Math.floor(level)));
}

async function fetchJagexHiscores(username: string): Promise<PlayerSkills | null> {
  const url = `https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Gearscape2DpsCalc/1.0 (local; hiscores import)",
      Accept: "text/plain",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text.includes("404") || text.includes("<html")) return null;
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 8) return null;

  const byName: Record<string, number> = {};
  SKILL_LINES.forEach((name, idx) => {
    byName[name] = parseLevel(lines[idx], name === "hitpoints" ? 10 : 1);
  });

  return {
    attack: byName.attack,
    strength: byName.strength,
    defence: byName.defence,
    hitpoints: Math.max(10, byName.hitpoints),
    ranged: byName.ranged,
    prayer: byName.prayer,
    magic: byName.magic,
    mining: byName.mining,
  };
}

async function fetchWomHiscores(username: string): Promise<{ skills: PlayerSkills; displayName: string } | null> {
  try {
    const res = await fetch(
      `https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Gearscape2DpsCalc/1.0 (local; hiscores import)",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const skills = data?.latestSnapshot?.data?.skills ?? {};
    const pick = (key: string, fallback: number) => {
      const level = Number(skills?.[key]?.level);
      return Number.isFinite(level) && level >= 1 ? Math.min(99, level) : fallback;
    };
    return {
      displayName: data.displayName ?? username,
      skills: {
        attack: pick("attack", 1),
        strength: pick("strength", 1),
        defence: pick("defence", 1),
        hitpoints: Math.max(10, pick("hitpoints", 10)),
        ranged: pick("ranged", 1),
        prayer: pick("prayer", 1),
        magic: pick("magic", 1),
        mining: pick("mining", 1),
      },
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username")?.trim();
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  try {
    // Prefer official Jagex hiscores (WOM is often Cloudflare-blocked from servers)
    const jagex = await fetchJagexHiscores(username);
    if (jagex) {
      return NextResponse.json({
        username,
        source: "jagex",
        skills: jagex,
      });
    }

    const wom = await fetchWomHiscores(username);
    if (wom) {
      return NextResponse.json({
        username: wom.displayName,
        source: "wiseoldman",
        skills: wom.skills,
      });
    }

    return NextResponse.json(
      { error: `Player “${username}” not found on hiscores. Check spelling, or sync RSN via WikiSync in RuneLite.` },
      { status: 404 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 500 },
    );
  }
}
