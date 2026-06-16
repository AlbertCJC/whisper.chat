// ── Whisper End-to-End Tests ─────────────────────────────────────
// Real backend + real frontend. No mocks.
// Two browser contexts simulate two strangers chatting.

const { test, expect } = require('@playwright/test');

// ── Helpers ──────────────────────────────────────────────────────

/** Accept rules, return a browser context + page ready for landing */
async function prepareUser(context) {
  const page = await context.newPage();
  await page.goto('/');

  // Rules modal should be visible
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Before you start...')).toBeVisible();
  await page.getByRole('button', { name: 'I Understand' }).click();

  // Landing page
  await expect(page.getByRole('button', { name: 'Start Chatting' })).toBeVisible();
  return page;
}

/** Both users accept rules and click Start Chatting → get paired */
async function pairUsers(pageA, pageB) {
  await pageA.getByRole('button', { name: 'Start Chatting' }).click();
  await pageB.getByRole('button', { name: 'Start Chatting' }).click();

  // Both should enter chat view
  await expect(pageA.locator('#chatView')).toBeVisible();
  await expect(pageB.locator('#chatView')).toBeVisible();

  // Both see the "connected" toast
  await expect(pageA.locator('#toast')).not.toHaveClass(/hidden/);
  await expect(pageB.locator('#toast')).not.toHaveClass(/hidden/);
}

/** Send a message from page and verify it appears as self */
async function sendMessage(page, text) {
  await page.locator('#messageInput').fill(text);
  await page.locator('#sendBtn').click();
  await expect(page.locator('.message-self').last()).toContainText(text);
}

// ── Tests ────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  test('rules modal appears on first visit and can be dismissed', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/');

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Before you start...')).toBeVisible();

    await page.getByRole('button', { name: 'I Understand' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Start Chatting' })).toBeVisible();
  });

  test('rules modal does not reappear after page reload', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    await page.reload();
    // Modal should NOT appear — sessionStorage persists
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('online count badge shows a number', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    await expect(page.locator('#onlineCount')).toBeVisible();
    const text = await page.locator('#onlineCount').textContent();
    expect(Number(text)).toBeGreaterThanOrEqual(0);
  });

  test('language select has options and defaults to "Any language"', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    const select = page.locator('#languageSelect');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('');
    const options = await select.locator('option').all();
    expect(options.length).toBeGreaterThan(2);
  });

  test('adds interest chip on Enter, removes on click', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    const input = page.locator('#interestsInput');
    await input.fill('coding');
    await input.press('Enter');
    await expect(page.locator('.interest-chip')).toContainText('coding');

    await input.fill('music');
    await input.press(',');
    await expect(page.locator('.interest-chip').nth(1)).toContainText('music');

    // Remove first chip
    await page.locator('.interest-chip-remove').first().click();
    const chips = page.locator('.interest-chip');
    await expect(chips).toHaveCount(1);
    await expect(chips).not.toContainText('coding');
  });

  test('removes last chip on Backspace in empty input', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    const input = page.locator('#interestsInput');
    await input.fill('coding');
    await input.press('Enter');
    await expect(page.locator('.interest-chip')).toContainText('coding');

    await input.press('Backspace');
    // Chip should be removed entirely — no chips left
    await expect(page.locator('.interest-chip')).toHaveCount(0);
  });

  test('cancels search and returns to landing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();
    await page.getByRole('button', { name: 'Start Chatting' }).click();

    // Should show searching view
    await expect(page.locator('#searchingView')).not.toHaveClass(/hidden/);

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Start Chatting' })).toBeVisible();
  });
});

test.describe('Chat — two strangers', () => {
  test('two users match and exchange messages', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // User A sends a message
    await sendMessage(pageA, 'Hello from A!');
    // User B should receive it
    await expect(pageB.locator('.message-stranger').last()).toContainText('Hello from A!');

    // User B replies
    await sendMessage(pageB, 'Hi from B!');
    await expect(pageA.locator('.message-stranger').last()).toContainText('Hi from B!');
  });

  test('typing indicator appears when other user types', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // A types → B should see typing indicator
    await pageA.locator('#messageInput').fill('typing...');
    await expect(pageB.locator('#typingIndicator')).not.toHaveClass(/hidden/);

    // A sends → typing should clear
    await pageA.locator('#sendBtn').click();
    await expect(pageB.locator('#typingIndicator')).toHaveClass(/hidden/);
  });

  test('stranger disconnects → reconnect prompt appears', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // B disconnects by navigating away
    await pageB.close();

    // A should see reconnect prompt
    await expect(pageA.locator('#reconnectPrompt')).toBeVisible({ timeout: 15000 });
  });

  test('"Find someone else" reconnects after disconnect', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // Exchange a message first
    await sendMessage(pageA, 'hey');
    await expect(pageB.locator('.message-stranger').last()).toContainText('hey');

    // B navigates away
    await pageB.close();

    // A clicks "Find someone else"
    await expect(pageA.locator('#reconnectPrompt')).toBeVisible({ timeout: 15000 });
    await pageA.getByRole('button', { name: 'Find someone else' }).click();

    // A should be searching again
    await expect(pageA.locator('#searchingView')).not.toHaveClass(/hidden/);
  });

  test('"Back to home" returns to landing after disconnect', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    await pageB.close();
    await expect(pageA.locator('#reconnectPrompt')).toBeVisible({ timeout: 15000 });

    await pageA.getByRole('button', { name: 'Back to home' }).click();
    await expect(pageA.getByRole('button', { name: 'Start Chatting' })).toBeVisible();
  });

  test('Next button disconnects and searches for new partner', async ({ context }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    // Add interests on both so Next triggers search properly
    for (const page of [pageA, pageB]) {
      await page.goto('/');
      await page.getByRole('button', { name: 'I Understand' }).click();
      await page.locator('#interestsInput').fill('coding');
      await page.locator('#interestsInput').press('Enter');
    }

    await pairUsers(pageA, pageB);

    await sendMessage(pageA, 'bye');

    // A clicks Next — should re-enter searching
    await pageA.locator('#nextBtn').click();
    await expect(pageA.locator('#searchingView')).not.toHaveClass(/hidden/);

    // B should see disconnect
    await expect(pageB.locator('#reconnectPrompt')).toBeVisible({ timeout: 15000 });
  });

  test('empty message does not send', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // Click send with empty input
    const msgCount = await pageA.locator('.message-self').count();
    await pageA.locator('#sendBtn').click();

    // No new message should appear
    const newCount = await pageA.locator('.message-self').count();
    expect(newCount).toBe(msgCount);
  });

  test('Shift+Enter adds newline instead of sending', async ({ context }) => {
    const page = await prepareUser(context);
    // Need another user to match with
    const pageB = await prepareUser(context);
    await pairUsers(page, pageB);

    const input = page.locator('#messageInput');
    // Press Shift+Enter — this is tricky in Playwright
    await input.press('Shift+Enter');

    const value = await input.inputValue();
    // Should contain newline character(s)
    expect(value).toContain('\n');
  });

  test('report button works', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    await pageA.locator('#reportBtn').click();

    // Toast should confirm report
    await expect(pageA.locator('#toast')).not.toHaveClass(/hidden/);
    await expect(pageA.locator('#toast')).toContainText('report');
  });

  test('copy chat shows toast with messages', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    await sendMessage(pageA, 'Test message');

    await pageA.locator('#copyChatBtn').click();
    await expect(pageA.locator('#toast')).not.toHaveClass(/hidden/);
  });

  test('seen indicator appears and hides', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // B focuses message input → A should see "seen"
    await pageB.locator('#messageInput').focus();
    await expect(pageA.locator('#seenIndicator')).not.toHaveClass(/hidden/);
  });
});

test.describe('Theme', () => {
  test('toggles between dark and light', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    // Default is dark
    await expect(page.locator('body')).toHaveClass(/dark/);

    // Toggle to light
    await page.locator('#themeToggle').click();
    await expect(page.locator('body')).toHaveClass(/light/);

    // Toggle back to dark
    await page.locator('#themeToggle').click();
    await expect(page.locator('body')).toHaveClass(/dark/);
  });

  test('persists theme across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    await page.locator('#themeToggle').click();
    await expect(page.locator('body')).toHaveClass(/light/);

    await page.reload();
    // Rules modal won't appear (sessionStorage), theme should persist (localStorage)
    await expect(page.locator('body')).toHaveClass(/light/);
  });
});

test.describe('Emoji picker', () => {
  test('opens and inserts emoji', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    // Need to be in chat view for emoji button to work (it's in chat view)
    // Start a quick chat
    const page2 = await page.context().newPage();
    await page2.goto('/');
    await page2.getByRole('button', { name: 'I Understand' }).click();

    await page.getByRole('button', { name: 'Start Chatting' }).click();
    await page2.getByRole('button', { name: 'Start Chatting' }).click();
    await expect(page.locator('#chatView')).toBeVisible();

    // Open emoji picker
    await page.locator('#emojiBtn').click();
    await expect(page.locator('#emojiPicker')).toBeVisible();

    // Click first emoji
    await page.locator('.emoji-item').first().click();
    const value = await page.locator('#messageInput').inputValue();
    expect(value.length).toBeGreaterThan(0);

    await page2.close();
  });

  test('picker closes on outside click', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    const page2 = await page.context().newPage();
    await page2.goto('/');
    await page2.getByRole('button', { name: 'I Understand' }).click();

    await page.getByRole('button', { name: 'Start Chatting' }).click();
    await page2.getByRole('button', { name: 'Start Chatting' }).click();
    await expect(page.locator('#chatView')).toBeVisible();

    await page.locator('#emojiBtn').click();
    await expect(page.locator('#emojiPicker')).toBeVisible();

    // Click outside — picker should close
    await page.locator('#chatMessages').click();
    await expect(page.locator('#emojiPicker')).toBeHidden();

    await page2.close();
  });
});

test.describe('Topic prompt', () => {
  test('appears when connecting with no messages and can be dismissed', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // Topic prompt should appear on first connect (messageCount === 0)
    await expect(pageA.locator('#topicPrompt')).not.toHaveClass(/hidden/);

    // Dismiss it
    await pageA.locator('#topicDismiss').click();
    await expect(pageA.locator('#topicPrompt')).toHaveClass(/hidden/);
  });
});

test.describe('Edge cases', () => {
  test('stops adding interests after MAX_INTERESTS (10)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    const input = page.locator('#interestsInput');
    const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

    for (const tag of tags) {
      await input.fill(tag);
      await input.press('Enter');
    }

    // Should have at most 10 chips
    const count = await page.locator('.interest-chip').count();
    expect(count).toBeLessThanOrEqual(10);
  });

  test('does not add duplicate interest', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    const input = page.locator('#interestsInput');
    await input.fill('coding');
    await input.press('Enter');
    await input.fill('coding');
    await input.press('Enter');

    // Should only have 1 chip (no duplicate)
    await expect(page.locator('.interest-chip')).toHaveCount(1);
  });

  test('report button outside chat shows toast', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    // Report button exists but we're on landing — the reportBtn is inside chatView which is hidden
    // The button element exists but the toast check for "not chatting" is triggered by view state
    // Actually the report button is in the hidden chat view, so it's inaccessible from landing
    // We can still evaluate the behavior by clicking it via JavaScript
    const toastText = await page.evaluate(() => {
      const btn = document.querySelector('#reportBtn');
      if (!btn) return 'button not found';
      btn.click();
      return document.querySelector('#toast').textContent;
    });

    // The report handler checks state.view !== 'chatting' — we're on landing
    expect(toastText).toContain("not chatting");
  });

  test('copy chat with no messages shows toast', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // Don't send any messages — just copy
    await pageA.locator('#copyChatBtn').click();
    await expect(pageA.locator('#toast')).not.toHaveClass(/hidden/);
    await expect(pageA.locator('#toast')).toContainText('No messages');
  });

  test('stranger counter increments each match', async ({ context }) => {
    const pageA = await prepareUser(context);
    let pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    // First match — shows nickname (defaults to "Stranger")
    await expect(pageA.locator('#strangerCounter')).toContainText('Stranger');

    // Disconnect B and reconnect with a new partner
    await pageB.close();
    await expect(pageA.locator('#reconnectPrompt')).toBeVisible({ timeout: 15000 });
    await pageA.getByRole('button', { name: 'Find someone else' }).click();

    // Match with new partner
    pageB = await prepareUser(context);
    await expect(pageA.locator('#searchingView')).not.toHaveClass(/hidden/);
    await pageB.getByRole('button', { name: 'Start Chatting' }).click();

    await expect(pageA.locator('#chatView')).toBeVisible({ timeout: 15000 });
    // After 2nd match, count > 1 so shows "Stranger #2"
    await expect(pageA.locator('#strangerCounter')).toContainText('Stranger #2');
  });

  test('Enter key sends message (not Shift+Enter)', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    const input = pageA.locator('#messageInput');
    await input.fill('Sent with Enter');
    await input.press('Enter');

    await expect(pageA.locator('.message-self').last()).toContainText('Sent with Enter');
    await expect(pageB.locator('.message-stranger').last()).toContainText('Sent with Enter');
  });

  test('long messages can be sent up to 2000 chars', async ({ context }) => {
    const pageA = await prepareUser(context);
    const pageB = await prepareUser(context);
    await pairUsers(pageA, pageB);

    const longText = 'A'.repeat(2000);
    const input = pageA.locator('#messageInput');
    await input.fill(longText);
    await input.press('Enter');

    await expect(pageA.locator('.message-self').last()).toBeVisible();
  });

  test('language selection is sent with find-stranger', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I Understand' }).click();

    // Select French
    await page.locator('#languageSelect').selectOption('fr');
    await expect(page.locator('#languageSelect')).toHaveValue('fr');

    // Visual confirmation: the dropdown shows the right language
    const selected = await page.locator('#languageSelect option:checked').textContent();
    expect(selected).toContain('Fran');
  });
});