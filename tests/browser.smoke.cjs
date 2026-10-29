/** Optional end-to-end checks. Install Playwright and its Chromium browser first.
 * See README.md. CHROMIUM_PATH can point at a locally installed browser. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const { createAppServer } = await import('../server.js');
  const onlineDice = [6,1];
  const server = createAppServer({rollDie:() => onlineDice.shift() ?? 1});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox'] });
    const errors = [];
    const mobile = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
    await mobile.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      const dice = [5,0]; // 6, then 1, to exercise the saved-dice selection dialog.
      crypto.getRandomValues = array => { if (array.length === 1) { array[0] = dice.shift() ?? 0; return array; } return original(array); };
    });
    const page = await mobile.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?backend=local`);
    await page.getByRole('heading', {name:'Game Modes'}).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.getByRole('button', {name:'Friends',exact:true}).click();
    await page.getByRole('heading', {name:'Coming Soon!'}).waitFor();
    await page.getByRole('button', {name:'Play',exact:true}).click();
    await page.locator('[data-action="start-2"]').first().click();
    assert.equal(await page.locator('.pawn').count(), 8);
    await page.getByRole('button', {name:'Roll the dice',exact:false}).last().click();
    await page.getByRole('button', {name:'Roll again',exact:false}).click();
    await page.locator('.pawn.selectable').first().click();
    await page.getByRole('heading', {name:'Select Dice to Move'}).waitFor();
    assert.equal(await page.getByRole('button', {name:'Use 1 for pawn 1'}).isDisabled(), true);
    await page.getByRole('button', {name:'Use 6 for pawn 1'}).click();
    await page.locator('.pawn.selectable').first().click();
    await page.getByRole('heading', {name:'Yellow’s turn'}).waitFor();
    assert.equal(await page.locator('.turn-line h1').innerText(), 'Yellow’s turn');
    await page.reload();
    await page.getByRole('button', {name:'Resume game'}).click();
    assert.equal(await page.locator('.turn-line h1').innerText(), 'Yellow’s turn');
    await page.getByRole('button', {name:'Exit game',exact:true}).first().click();
    await page.getByRole('dialog').getByRole('button', {name:'Exit game'}).click();
    await page.getByRole('button', {name:'Open account menu'}).click();
    await page.getByRole('menuitem', {name:'Settings'}).click();
    await page.getByRole('switch', {name:'Sound'}).uncheck();
    await page.getByLabel('Theme', {exact:true}).selectOption('dark');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.getByRole('button', {name:'Back to home'}).click();
    await page.getByRole('button', {name:'How to play'}).first().click();
    await page.getByRole('button', {name:'Take a tour'}).click();
    await page.getByRole('button', {name:'Next'}).click();
    await page.getByRole('heading', {name:'Play with Friends'}).waitFor();
    await page.getByRole('button', {name:'Skip'}).click();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await mobile.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('heading', {name:'Game Modes'}).waitFor();
    await mobile.setOffline(false);
    await mobile.close();
    console.log('PASS mobile game, saved dice, settings, tour, and offline reload');

    const hostContext = await browser.newContext(), guestContext = await browser.newContext();
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    host.on('pageerror', error => errors.push(error.message)); guest.on('pageerror', error => errors.push(error.message));
    await host.goto(`${base}?backend=local`); await host.locator('[data-action="online"]').click();
    await host.waitForFunction(() => !document.querySelector('[data-action="create-room"]').disabled);
    await host.getByRole('button', {name:'Create room'}).click();
    await host.locator('.room-code').waitFor();
    const code = (await host.locator('.room-code').innerText()).trim();
    await guest.goto(`${base}?backend=local&room=${code}`);
    await guest.waitForFunction(() => !document.querySelector('[data-form="join-room"] button').disabled);
    await guest.getByRole('button', {name:'Join room'}).click();
    await host.getByRole('button', {name:'Start game'}).click();
    await host.locator('.game-layout').waitFor(); await guest.locator('.game-layout').waitFor();
    await host.getByRole('button', {name:'Roll the dice',exact:false}).last().click();
    await guest.waitForFunction(() => document.querySelector('.history-count')?.textContent.includes('1 roll'));
    await host.getByRole('button', {name:'Roll again',exact:false}).click();
    await guest.waitForFunction(() => document.querySelector('.history-count')?.textContent.includes('2 rolls'));
    await host.locator('.pawn.selectable').first().click();
    assert.equal(await host.getByRole('button', {name:'Use 1 for pawn 1'}).isDisabled(), true);
    await host.getByRole('button', {name:'Use 6 for pawn 1'}).click();
    await guest.waitForFunction(() => document.querySelectorAll('.saved-die').length === 1);
    await host.locator('.pawn.selectable').first().click();
    await guest.getByRole('heading', {name:'Yellow’s turn'}).waitFor();
    assert.equal(await host.locator('.history-count').innerText(), await guest.locator('.history-count').innerText());
    await hostContext.close(); await guestContext.close();
    assert.deepEqual(errors, []);
    console.log('PASS private room create, join, synchronized rolls, and selected moves');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
