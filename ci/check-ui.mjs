/* global process, console, window, document, localStorage, navigator, Buffer, URL, Event */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { startMirrorServer } from "./serve.mjs";
import { ROUTES } from "./routes.mjs";

// Loopback-only server and NEW disposable profiles. Never connect this harness
// to the public Mirror or an owner's browser profile.
const output = path.resolve(process.env.KATUSHKA_TEST_OUTPUT);
await fs.mkdir(output); // Preserve previous evidence; a rerun needs a new directory.
const pw = await import(pathToFileURL(path.join(process.env.KATUSHKA_PLAYWRIGHT_PATH, "index.mjs")).href);
const lab = process.env.KATUSHKA_TEST_LAB === "1";
const prefix = lab ? "/katushka-lab/" : "/katushka-pwa-mirror/";
const key = lab ? "katushka.lab.contacts.v1" : "katushka.mirror.katushka-pwa-mirror.contacts.v1";
const workshopKey = lab ? "katushka.lab.personal-workshop.v1" : "katushka.personal-workshop.v1";
const server = await startMirrorServer(process.env.KATUSHKA_TEST_PACKAGE || "out", 3059, prefix);
const result = { syntheticOnly: true, physicalDevicesTested: false, network: "loopback GET/HEAD only", engines: [] };
const sha = text => createHash("sha256").update(text).digest("hex");
const firstStory = "  SYNTHETIC261 Знакомство\nТочный исходный текст.  ";
const secondStory = "  SYNTHETIC261 Уникальный космодром\n" + "Длинное продолжение разговора. ".repeat(700) + "\nКонец.  ";
try {
  for (const engine of (process.env.KATUSHKA_TEST_ENGINES || "chromium,webkit").split(",")) {
    const row = { engine, checks: [], errors: [], violations: [], originalHashes: {} }; result.engines.push(row);
    const profile = path.join(output, `${engine}-profile`);
    const options = { headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ru-RU", acceptDownloads: true,
      ...(engine === "chromium" ? { executablePath: process.env.KATUSHKA_CHROMIUM_EXECUTABLE || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" } : {}) };
    const check = text => { row.checks.push(text); console.log(`${engine}: ${text}`); };
    const protect = async context => {
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (["http:", "https:"].includes(url.protocol) && (url.origin !== server.origin || !["GET", "HEAD"].includes(request.method()) || request.postData())) { row.violations.push(url.origin); return route.abort(); }
        return route.continue();
      });
      context.on("page", page => page.on("pageerror", error => row.errors.push(error.message)));
    };
    let context = await pw[engine].launchPersistentContext(profile, options), page;
    await protect(context);
    try {
      page = await context.newPage();
      const go = route => page.goto(server.origin + prefix + route, { waitUntil: "networkidle" });
      const tap = async locator => {
        const href = await locator.getAttribute("href");
        await locator.scrollIntoViewIfNeeded(); await locator.tap();
        if (href?.startsWith(prefix)) { await page.waitForURL(new URL(href, server.origin).href, { waitUntil: "networkidle" }); }
      };
      const snapshot = () => page.evaluate(k => localStorage.getItem(k), key);
      const history = async id => { await go(`razmotka/?history=${encodeURIComponent(id)}`); await page.getByRole("heading", { name: "Синтетический Иван", exact: true }).waitFor(); };
      const addition = async () => { await page.locator(".relationship-timeline").waitFor(); await tap(page.locator(".relationship-history").getByRole("link", { name: "+ Дополнить", exact: true }).first()); await page.getByLabel("Новая Намотка", { exact: true }).waitFor(); };
      const savedAddition = async () => { await page.getByText("Новая Намотка сохранена в этой истории.", { exact: true }).waitFor(); await tap(page.getByRole("link", { name: "Открыть историю", exact: true })); await page.locator(".relationship-timeline").waitFor(); };
      await go("");
      assert.equal(await snapshot(), null);
      const unrelatedKeys = lab ? ["katushka.contacts.v1", "katushka.personal-workshop.v1", "katushka.mirror.katushka-pwa-mirror.contacts.v1"] : [];
      if (lab) {
        const manifest = await (await page.request.get(server.origin + prefix + "manifest.webmanifest")).json();
        assert.equal(manifest.name, "KATUШКА LAB");
        for (const field of ["id", "start_url", "scope"]) assert.equal(manifest[field], prefix);
        assert.notEqual(new URL("https://katushka-workshop-lab.github.io").origin, new URL("https://katushka-mirror-lab.github.io").origin);
        await page.getByRole("note").filter({ hasText: "KATUШКА LAB" }).waitFor();
        assert.deepEqual(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(item => item.scope)), []);
        await page.evaluate(keys => keys.forEach(k => localStorage.setItem(k, "UNRELATED_LAB_SENTINEL")), unrelatedKeys);
        check("LAB identity and manifest scope verified; no Service Worker; Mirror origin distinct");
      }
      await page.evaluate(({ workshopKey }) => { localStorage.setItem(workshopKey, "SYNTHETIC261_WORKSHOP_UNTOUCHED"); localStorage.setItem("other-project", "SYNTHETIC261_OTHER_UNTOUCHED"); }, { workshopKey });
      await go("namotka/"); await page.getByLabel("Имя человека", { exact: false }).fill("Синтетический Иван"); await page.getByLabel("Полный рассказ", { exact: true }).fill(firstStory);
      await tap(page.getByRole("button", { name: "Проверить перед сохранением", exact: true })); await tap(page.getByRole("button", { name: "Подтвердить и сохранить Намотку", exact: true }));
      await page.getByText("Намотка и полный рассказ сохранены в этом браузере.").waitFor();
      const root = JSON.parse(await snapshot()).contacts[0], rootID = root.id;
      row.originalHashes.first = sha(root.details.originalStory); assert.equal(root.details.originalStory, firstStory);
      check("New first winding creates one history; exact original text and root ID captured");

      await history(rootID); await addition();
      await page.getByLabel("Новая Намотка", { exact: true }).fill(secondStory);
      await page.getByLabel("Новая Намотка", { exact: true }).focus();
      await page.getByLabel("Новая Намотка", { exact: true }).dispatchEvent("compositionstart");
      await page.waitForTimeout(600); assert.equal(await page.evaluate(() => document.activeElement.id), "addition-story");
      await page.getByLabel("Новая Намотка", { exact: true }).dispatchEvent("compositionend", { data: "" });
      await page.getByLabel("Название Намотки (необязательно)", { exact: true }).fill("Телефонный разговор");
      await page.getByRole("button", { name: "Сохранить", exact: true }).evaluate(button => { button.click(); button.click(); });
      await savedAddition();
      const withSecond = JSON.parse(await snapshot()).contacts[0];
      assert.equal(withSecond.windings.length, 1); assert.equal(withSecond.windings[0].originalStory, secondStory);
      const { windings: _windings, ...unchangedRoot } = withSecond; void _windings; assert.deepEqual(unchangedRoot, root);
      row.originalHashes.second = sha(secondStory);
      check("Long second winding, composition/focus and double Save: one addition; initial winding unchanged");

      await addition(); await page.getByLabel("Новая Намотка", { exact: true }).fill("SYNTHETIC261 Третья Намотка — новая встреча");
      await tap(page.getByRole("button", { name: "Сохранить", exact: true })); await savedAddition();
      assert.equal(await page.locator(".relationship-winding").count(), 3);
      const completeRaw = await snapshot(), complete = JSON.parse(completeRaw).contacts[0];
      const displayedIDs = await page.locator(".relationship-winding").evaluateAll(items => items.map(item => item.dataset.windingId));
      assert.deepEqual(displayedIDs, [rootID, ...complete.windings.map(item => item.id)]);
      assert.equal(await page.locator(".relationship-winding time[datetime]").count(), 3);
      await page.screenshot({ path: path.join(output, `${engine}-history.png`) });
      check("Third winding keeps chronological IDs and dates within the same history");

      await go("search/"); await tap(page.getByRole("button", { name: "По моим записям", exact: true }));
      await page.getByRole("searchbox").fill("космодром"); assert.equal(await page.locator(".contact-entry").count(), 1);
      await tap(page.getByRole("link", { name: "Синтетический Иван", exact: true })); await page.locator(".relationship-winding").nth(2).waitFor(); assert.equal(await page.locator(".relationship-winding").count(), 3);
      await page.reload({ waitUntil: "networkidle" }); assert.equal(await snapshot(), completeRaw);
      check("Search finds an addition and opens the full history; reload preserves every storage byte");

      // Old v1 record, without details or optional windings, with the SAME name.
      const legacy = { id: "SYNTHETIC261-legacy", createdAt: "2026-10-01T10:00:00.000Z", name: "Синтетический Иван", metAt: "Другая тестовая встреча", discussed: "Старая запись", impressions: "", agreements: "" };
      await page.evaluate(({ key, legacy }) => { const data = JSON.parse(localStorage.getItem(key)); data.contacts.push(legacy); localStorage.setItem(key, JSON.stringify(data)); window.dispatchEvent(new Event("katushka:contacts-changed")); }, { key, legacy });
      await go("razmotka/"); await page.getByRole("searchbox").fill("Синтетический Иван"); assert.equal(await page.locator(".contact-entry").count(), 2);
      await history(legacy.id); assert.equal(await page.locator(".relationship-winding").count(), 1);
      await addition(); await page.getByLabel("Новая Намотка", { exact: true }).fill("SYNTHETIC261 Продолжение только второй истории"); await tap(page.getByRole("button", { name: "Сохранить", exact: true })); await savedAddition();
      assert.equal(await page.locator(".relationship-winding").count(), 2); await history(rootID); assert.equal(await page.locator(".relationship-winding").count(), 3);
      check("Legacy record reads without migration; equal names stay two independent histories");

      const tabs = await Promise.all([context.newPage(), context.newPage()]);
      await Promise.all(tabs.map(async (tab, index) => {
        await tab.goto(server.origin + prefix + `namotka/?history=${legacy.id}`, { waitUntil: "networkidle" });
        await tab.getByLabel("Новая Намотка", { exact: true }).fill(`SYNTHETIC261 Параллельная вкладка ${index}`);
      }));
      await Promise.all(tabs.map(tab => tab.getByRole("button", { name: "Сохранить", exact: true }).click()));
      const outcomes = await Promise.all(tabs.map(async (tab, index) => {
        await tab.locator(".message--success, .message--error").waitFor();
        const saved = await tab.getByText("Новая Намотка сохранена в этой истории.", { exact: true }).count();
        if (!saved) {
          assert.match(await tab.getByRole("alert").filter({ hasText: "Сохранение в этой вкладке приостановлено" }).textContent(), /Сохранение в этой вкладке приостановлено/);
          assert.equal(await tab.getByLabel("Новая Намотка", { exact: true }).inputValue(), `SYNTHETIC261 Параллельная вкладка ${index}`);
        }
        return !!saved;
      }));
      assert.equal(outcomes.filter(Boolean).length, 1);
      await Promise.all(tabs.map(tab => tab.close()));
      // Reopen to get an independent current storage view, not a lagging tab cache.
      await history(rootID);
      assert.equal(JSON.parse(await snapshot()).contacts.find(item => item.id === legacy.id).windings.length, 2);
      check("Concurrent tabs: exactly one writer saves; the other retains its complete draft with a clear warning");

      const beforeDrafts = await snapshot();
      await go("namotka/"); await page.getByLabel("Полный рассказ", { exact: true }).fill("SYNTHETIC261 Отдельная несохранённая первая Намотка");
      // Internal links, rather than document reloads, exercise the existing provider.
      await tap(page.locator(".app-home-link")); await tap(page.getByRole("link", { name: "Размотка — вспомнить историю", exact: true }));
      await tap(page.locator(`.contact-entry a[href*="history=${rootID}"]`).first()); await addition();
      await page.getByLabel("Новая Намотка", { exact: true }).fill("SYNTHETIC261 Черновик А");
      await tap(page.getByRole("link", { name: "Вернуться к истории", exact: true })); await tap(page.getByRole("link", { name: "К списку историй", exact: true }));
      await tap(page.locator(`.contact-entry a[href*="history=${legacy.id}"]`).first()); await addition();
      await page.getByLabel("Новая Намотка", { exact: true }).fill("SYNTHETIC261 Черновик Б");
      await tap(page.getByRole("link", { name: "Вернуться к истории", exact: true })); await page.goBack({ waitUntil: "networkidle" }); await page.getByLabel("Новая Намотка", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("Новая Намотка", { exact: true }).inputValue(), "SYNTHETIC261 Черновик Б");
      await tap(page.getByRole("button", { name: "Отменить дополнение", exact: true })); await tap(page.getByRole("button", { name: "Продолжить дополнение", exact: true }));
      assert.equal(await page.getByLabel("Новая Намотка", { exact: true }).inputValue(), "SYNTHETIC261 Черновик Б");
      await tap(page.getByRole("button", { name: "Отменить дополнение", exact: true })); await tap(page.getByRole("button", { name: "Удалить только это дополнение", exact: true }));
      await tap(page.getByRole("link", { name: "Вернуться к истории", exact: true })); await tap(page.getByRole("link", { name: "К списку историй", exact: true }));
      await tap(page.locator(`.contact-entry a[href*="history=${rootID}"]`).first()); await addition();
      assert.equal(await page.getByLabel("Новая Намотка", { exact: true }).inputValue(), "SYNTHETIC261 Черновик А");
      await page.screenshot({ path: path.join(output, `${engine}-addition.png`) });
      await tap(page.getByRole("button", { name: "Отменить дополнение", exact: true })); await tap(page.getByRole("button", { name: "Удалить только это дополнение", exact: true }));
      await tap(page.locator(".app-home-link")); await tap(page.getByRole("link", { name: "Намотка — сохранить знакомство", exact: true }));
      assert.equal(await page.getByLabel("Полный рассказ", { exact: true }).inputValue(), "SYNTHETIC261 Отдельная несохранённая первая Намотка");
      await tap(page.getByRole("button", { name: "Отменить Намотку", exact: true })); await tap(page.getByRole("button", { name: "Удалить только черновик", exact: true }));
      assert.equal(await snapshot(), beforeDrafts);
      check("Back/return, independent first/A/B drafts and explicit cancellation preserve text and saved storage");

      await go("settings/"); await tap(page.getByRole("button", { name: "Создать резервную копию", exact: true }));
      const downloading = page.waitForEvent("download"); await tap(page.getByRole("link", { name: "Скачать JSON", exact: true }));
      const file = await downloading, bytes = await fs.readFile(await file.path()); await fs.writeFile(path.join(output, `${engine}-synthetic-backup.json`), bytes);
      assert.equal(JSON.parse(bytes).version, 3); assert.equal(JSON.parse(bytes).data.contacts.length, 2);
      await page.locator("#backup-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: bytes });
      await page.getByTestId("import-added").waitFor(); assert.equal(await page.getByTestId("import-added").textContent(), "0"); assert.equal(await page.getByTestId("import-windings").textContent(), "0");
      await tap(page.getByRole("button", { name: "Подтвердить восстановление", exact: true })); assert.equal(await snapshot(), beforeDrafts);
      check("JSON v3 UI export and confirmed repeated import keep both histories and all additions without duplicates");

      const restoreContext = await pw[engine].launchPersistentContext(path.join(output, `${engine}-restore-profile`), options);
      await protect(restoreContext);
      try {
        const restore = await restoreContext.newPage(); await restore.goto(server.origin + prefix + "settings/", { waitUntil: "networkidle" });
        await restore.locator("#backup-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: bytes }); await restore.getByTestId("import-added").waitFor();
        await restore.getByRole("checkbox", { name: "Добавить похожие имена как отдельные знакомства. Иначе они будут пропущены.", exact: true }).check();
        await restore.getByTestId("import-added").filter({ hasText: /^2$/ }).waitFor();
        assert.equal(await restore.getByTestId("import-added").textContent(), "2"); assert.equal(await restore.getByTestId("import-windings").textContent(), "4");
        await restore.getByRole("button", { name: "Подтвердить восстановление", exact: true }).click();
        await restore.getByText(/Восстановление завершено/).waitFor();
        assert.deepEqual(JSON.parse(await restore.evaluate(k => localStorage.getItem(k), key)).contacts, JSON.parse(beforeDrafts).contacts);
        await restore.locator("#backup-file").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{broken") });
        await restore.getByRole("alert").filter({ hasText: "Файл не является корректным JSON" }).waitFor(); assert.equal(await restore.getByRole("alert").filter({ hasText: "Файл не является корректным JSON" }).textContent(), "Файл не является корректным JSON. Импорт не выполнен.");
        assert.deepEqual(JSON.parse(await restore.evaluate(k => localStorage.getItem(k), key)).contacts, JSON.parse(beforeDrafts).contacts);
      } finally { await restoreContext.close(); }
      check("A separate empty profile restores the complete archive; corrupt file is rejected without writes");

      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 }); await history(rootID);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        assert.ok(await page.locator(".app-home-link").isVisible());
        const target = await page.getByRole("link", { name: "+ Дополнить", exact: true }).last().boundingBox();
        const nav = await page.locator(".app-bottom-nav").boundingBox(); assert.ok(target.y + target.height <= nav.y);
        await addition(); await page.getByLabel("Новая Намотка", { exact: true }).focus();
        await page.setViewportSize({ width, height: 460 }); await page.getByLabel("Новая Намотка", { exact: true }).scrollIntoViewIfNeeded();
        assert.ok(await page.getByLabel("Новая Намотка", { exact: true }).isEditable());
      }
      check("320/390/430px history and reduced keyboard viewport: no horizontal clipping, Home and Add accessible");
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ROUTES) { const response = await go(route ? route + "/" : ""); assert.equal(response.status(), 200); assert.deepEqual(await page.locator(".app-bottom-nav a").allTextContents(), ["Мастерская", "Поиск", "События"]); }
      assert.equal(await page.evaluate(k => localStorage.getItem(k), workshopKey), "SYNTHETIC261_WORKSHOP_UNTOUCHED");
      assert.equal(await page.evaluate(() => localStorage.getItem("other-project")), "SYNTHETIC261_OTHER_UNTOUCHED");
      for (const unrelated of unrelatedKeys) assert.equal(await page.evaluate(k => localStorage.getItem(k), unrelated), "UNRELATED_LAB_SENTINEL");
      check("All 17 existing routes and navigation preserved; Workshop and unrelated markers untouched");
      const beforeRestart = await snapshot();
      await context.close();
      context = await pw[engine].launchPersistentContext(profile, options); await protect(context); page = await context.newPage();
      await go(`razmotka/?history=${encodeURIComponent(rootID)}`); await page.locator(".relationship-winding").first().waitFor();
      assert.equal(await snapshot(), beforeRestart); assert.equal(await page.locator(".relationship-winding").count(), 3);
      check("Full browser process restart with isolated persistent profile retains all records and original hashes");
      await go("namotka/?history=does-not-exist"); await page.getByRole("alert").filter({ hasText: "История не найдена" }).waitFor(); assert.equal(await page.getByLabel("Новая Намотка", { exact: true }).count(), 0); assert.equal(await snapshot(), beforeRestart);
      check("A missing history cannot silently become a new person or another same-name history");
      assert.deepEqual(row.errors, []); assert.deepEqual(row.violations, []); row.ok = true;
    } catch (error) { row.ok = false; row.failure = error.stack; if (page) await page.screenshot({ path: path.join(output, `${engine}-failure.png`), fullPage: true }).catch(() => {}); throw error; }
    finally { await context.close(); }
  }
  result.ok = true;
} finally { await server.close(); await fs.writeFile(path.join(output, "browser-results.json"), JSON.stringify(result, null, 2) + "\n"); }
