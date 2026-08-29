import { parseBankMemoryPaste } from "../src/lib/runelite/bankMemory";

const tsv = `Item id\tItem name\tItem quantity
4151\tAbyssal whip\t1
4587\tDragon scimitar\t2
301\tLobster\t5`;

const csvPairs = "301,1,302,10,303,5,304,3,";

const tsvParsed = parseBankMemoryPaste(tsv);
if (tsvParsed.itemIds.length !== 3) throw new Error(`TSV expected 3 ids, got ${tsvParsed.itemIds.length}`);
if (!tsvParsed.itemIds.includes(4151)) throw new Error("TSV missing whip");
if (tsvParsed.format !== "tsv") throw new Error(`expected tsv format, got ${tsvParsed.format}`);

const pairParsed = parseBankMemoryPaste(csvPairs);
if (pairParsed.itemIds.length !== 4) throw new Error(`Pairs expected 4 ids, got ${pairParsed.itemIds.length}`);
if (pairParsed.itemIds.includes(1) || pairParsed.itemIds.includes(10)) {
  throw new Error("Pairs parser must not treat quantities as item ids");
}

const withCash = `Item id\tItem name\tItem quantity
995\tCoins\t25000000
13204\tPlatinum token\t100
4151\tAbyssal whip\t1`;

const cashParsed = parseBankMemoryPaste(withCash);
if (cashParsed.coins !== 25_000_000) throw new Error(`expected 25M coins, got ${cashParsed.coins}`);
if (cashParsed.platinumTokens !== 100) throw new Error(`expected 100 plats`);
if (cashParsed.gpStack !== 25_000_000 + 100_000) {
  throw new Error(`expected gpStack 25.1M, got ${cashParsed.gpStack}`);
}

console.log("bank memory parser ok", {
  tsv: tsvParsed.itemIds,
  pairs: pairParsed.itemIds,
  matched: tsvParsed.matchedInDb,
  gpStack: cashParsed.gpStack,
});
