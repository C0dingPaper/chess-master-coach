import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import "fake-indexeddb/auto";
import { openDB } from "idb";

const require = createRequire(import.meta.url);
function loadStorage() {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("../src/lib/chess/storage.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  );
  const exports = {};
  runInNewContext(outputText, { exports, require, window: {}, Date, Promise });
  return exports;
}

test("existing database upgrades without losing games or manual lines; generated groups replace atomically", async () => {
  const old = await openDB("neverpay4chess", 1, {
    upgrade(db) {
      for (const name of ["games", "repertoire", "pinned"])
        db.createObjectStore(name, { keyPath: "id" });
      db.createObjectStore("kv");
    },
  });
  await old.put("repertoire", { id: "manual", name: "My line", createdAt: 1 });
  await old.put("games", { id: "game", endTime: 1 });
  old.close();
  const storage = loadStorage();
  const line = (id, groupId) => ({ id, name: id, createdAt: 2, generated: { groupId } });
  await storage.putGeneratedRepertoire([line("a-1", "a"), line("a-2", "a")]);
  await storage.putGeneratedRepertoire([line("b-1", "b")]);
  await storage.putGeneratedRepertoire([line("a-new", "a")]);
  assert.deepEqual((await storage.getRepertoire()).map((line) => line.id).sort(), [
    "a-new",
    "b-1",
    "manual",
  ]);
  assert.equal((await storage.getAllGames())[0].id, "game");
  await assert.rejects(
    storage.putGeneratedRepertoire([line("bad-a", "a"), line("bad-b", "b")]),
    /Invalid repertoire group/,
  );
  assert.equal((await storage.getRepertoire()).length, 3);

  const book = { moves: [], white: 0, black: 0, draws: 0 };
  await storage.putExplorerCache("position", book);
  assert.deepEqual(await storage.getExplorerCache("position"), book);
  const upgraded = await openDB("neverpay4chess", 2);
  assert.ok(upgraded.objectStoreNames.contains("explorer"));
  await upgraded.put("explorer", {
    key: "expired",
    savedAt: Date.now() - 8 * 86400000,
    data: book,
  });
  assert.equal(await storage.getExplorerCache("expired"), null);
  upgraded.close();
});
