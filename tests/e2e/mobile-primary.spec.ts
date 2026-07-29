import { expect, request, test, type Locator, type Page } from "@playwright/test";

const primary = { name: "Mobile E2E Builder", email: "mobile-e2e@rpp.invalid", password: "mobile-e2e-password" };
const recipient = { name: "Mobile E2E Recipient", email: "mobile-recipient@rpp.invalid", password: "mobile-recipient-password" };

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const containedByScroller = (element: HTMLElement) => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth + 1) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const overflowers = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          element: `${element.tagName.toLowerCase()}${element.getAttribute("aria-label") ? `[aria-label="${element.getAttribute("aria-label")}"]` : ""}.${element.className}`,
          elementNode: element,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
          overflowX: style.overflowX,
        };
      })
      .filter((element) => (element.right > width + 1 || element.scrollWidth > Math.ceil(element.width) + 1) && !containedByScroller(element.elementNode))
      .sort((left, right) => Math.max(right.right, right.scrollWidth) - Math.max(left.right, left.scrollWidth))
      .map(({ elementNode: _elementNode, ...element }) => element)
      .slice(0, 8);
    const tableAncestors: Array<Record<string, string | number>> = [];
    let ancestor = document.querySelector<HTMLElement>("table.min-w-\\[980px\\]")?.parentElement ?? null;
    while (ancestor && ancestor !== document.body) {
      const rect = ancestor.getBoundingClientRect();
      tableAncestors.push({
        element: `${ancestor.tagName.toLowerCase()}.${ancestor.className}`,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        clientWidth: ancestor.clientWidth,
        scrollWidth: ancestor.scrollWidth,
        overflowX: getComputedStyle(ancestor).overflowX,
      });
      ancestor = ancestor.parentElement;
    }
    return { width, scrollWidth: document.documentElement.scrollWidth, overflowers, tableAncestors };
  });
  expect(dimensions.scrollWidth, `page width ${dimensions.scrollWidth}px exceeded viewport ${dimensions.width}px; largest overflowers: ${JSON.stringify(dimensions.overflowers)}; table ancestors: ${JSON.stringify(dimensions.tableAncestors)}`).toBeLessThanOrEqual(dimensions.width + 1);
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "touch target must be visible").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test("mobile navigation, filters, and public layouts remain operable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Robopartpicker" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "RPPS means RoboPartPicker Project Standard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Robot projects with the strongest build information" })).toBeVisible();
  const homeHeadings = await page.getByRole("heading").allTextContents();
  expect(homeHeadings.indexOf("Robot projects with the strongest build information")).toBeLessThan(
    homeHeadings.indexOf("RPPS means RoboPartPicker Project Standard"),
  );
  const homeMetrics = page.locator('[aria-label="Browse RoboPartPicker data"]');
  await expect(homeMetrics.locator('a[href="/parts/actuator"]')).toHaveCount(1);
  await expect(homeMetrics.locator('a[href="/suppliers"]')).toHaveCount(1);
  await expect(homeMetrics.locator('a[href="/projects"]')).toHaveCount(1);
  await expect(homeMetrics.locator('a[href="/boms"]')).toHaveCount(1);
  await expectNoPageOverflow(page);

  await page.getByRole("link", { name: "Privacy Policy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/u);
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.goto("/");

  const navigationToggle = page.getByRole("button", { name: "Toggle navigation" });
  await expectTouchTarget(navigationToggle);
  await navigationToggle.click();
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Projects", exact: true })).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/u);
  await expectNoPageOverflow(page);

  await page.goto("/parts/actuator");
  const filterButton = page.getByRole("button", { name: "Filters", exact: true });
  await expectTouchTarget(filterButton);
  await filterButton.click();
  const filterDrawer = page.getByRole("complementary", { name: "Catalog filters" });
  await expect(filterDrawer).toBeVisible();
  await expect(filterDrawer.getByPlaceholder("name, maker, tag, blurb…")).toBeVisible();
  await filterDrawer.getByRole("button", { name: "Close filters" }).click();
  await expect(filterDrawer).toBeHidden();
  await expectNoPageOverflow(page);

  for (const path of ["/imports", "/messages", "/marketplace/part-outs", "/settings/ai-improvement", "/admin/operations"]) {
    await page.goto(path);
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expectNoPageOverflow(page);
  }
});

test("authenticated mobile upload, build, messaging, editor, and marketplace workflows work end to end", async ({ page, baseURL }) => {
  const origin = baseURL ?? "http://127.0.0.1:8080";
  const mutationHeaders = { Origin: origin };
  const signup = await page.request.post("/api/auth/sign-up/email", { data: primary, headers: mutationHeaders });
  expect(signup.ok(), await signup.text()).toBeTruthy();

  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "New project" })).toBeVisible();
  await page.getByLabel("Name *").fill("Mobile validation robot");
  const projectNarrative = page.getByRole("textbox", { name: "Write it your way technical narrative", exact: true });
  await projectNarrative.fill("A mobile-authored robot project with explicit build evidence and versioned sourcing notes.");
  await expectTouchTarget(page.getByRole("button", { name: "Organize details" }));
  await expectNoPageOverflow(page);

  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Import and analysis jobs" })).toBeVisible();
  await page.getByLabel("Files").setInputFiles({
    name: "mobile-smoke.urdf",
    mimeType: "application/xml",
    buffer: Buffer.from('<robot name="mobile"><link name="base"/><link name="arm"/><joint name="axis" type="revolute"><parent link="base"/><child link="arm"/></joint></robot>'),
  });
  await page.getByRole("button", { name: "Queue 1 file" }).click();
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]+$/u);
  await expect(page.getByText("Per-file results and provenance")).toBeVisible();
  await expectNoPageOverflow(page);

  const buildResponse = await page.request.post("/api/v1/builds", {
    data: { name: "Mobile checklist build", description: "A build created for mobile workflow validation.", visibility: "private" },
    headers: mutationHeaders,
  });
  expect(buildResponse.status(), await buildResponse.text()).toBe(201);
  const buildId = ((await buildResponse.json()) as { item: { id: string } }).item.id;
  const itemResponse = await page.request.post(`/api/v1/builds/${buildId}/items`, {
    data: { componentId: null, description: "Mobile test actuator", quantity: 1, unit: "ea", unitCostMinor: 12500 },
    headers: mutationHeaders,
  });
  expect(itemResponse.status(), await itemResponse.text()).toBe(201);
  await page.goto(`/builder?build=${buildId}`);
  await expect(page.getByRole("heading", { name: "Mobile checklist build" })).toBeVisible();
  const itemStatus = page.getByLabel("Status for Mobile test actuator");
  await itemStatus.selectOption("installed");
  await expect(itemStatus).toHaveValue("installed");
  await expect(page.getByText("Build evidence and technical records")).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto("/marketplace/part-outs");
  await page.getByLabel("Build ID").fill(buildId);
  await page.getByRole("button", { name: "Create inventory" }).click();
  await expect(page).toHaveURL(/\/marketplace\/part-outs\/[0-9a-f-]+$/u);
  await expect(page.getByText("Estimates are evidence-based ranges, not guaranteed sale values.", { exact: false })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto("/marketplace/new");
  await expect(page.getByRole("heading", { name: "Tell the story of what you are selling" })).toBeVisible();
  const listingNarrative = page.getByRole("textbox", { name: "Describe the item in your own words technical narrative", exact: true });
  await listingNarrative.fill("A fully functional mobile test actuator with its revision label and bench-test evidence included.");
  await page.getByLabel("Listing title").fill("Mobile test actuator assembly");
  await page.getByLabel("Asking price (USD)").fill("125");
  const fullScreen = page.getByRole("button", { name: "Full screen" });
  await expectTouchTarget(fullScreen);
  await fullScreen.click();
  const editorDialog = page.getByRole("dialog");
  await expect(editorDialog).toBeVisible();
  const dialogBox = await editorDialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);
  await page.keyboard.press("Escape");
  await expect(editorDialog).toBeHidden();
  await expect(fullScreen).toBeFocused();
  await page.getByRole("button", { name: "Save private draft" }).click();
  await expect(page).toHaveURL(/\/marketplace\/new\?draft=[0-9a-f-]+$/u);
  await expect(page.getByRole("heading", { name: "Edit listing draft" })).toBeVisible();
  await expectNoPageOverflow(page);

  const recipientApi = await request.newContext({ baseURL });
  try {
    const recipientSignup = await recipientApi.post("/api/auth/sign-up/email", { data: recipient, headers: mutationHeaders });
    expect(recipientSignup.ok(), await recipientSignup.text()).toBeTruthy();
    const recipientUser = (await recipientSignup.json()) as { user?: { id?: string }; id?: string };
    const recipientId = recipientUser.user?.id ?? recipientUser.id;
    expect(recipientId).toBeTruthy();
    const conversationResponse = await page.request.post("/api/v1/messages/conversations", {
      data: { recipientUserId: recipientId, contextType: "build", contextId: buildId, message: "Can you review the mobile build evidence?" },
      headers: mutationHeaders,
    });
    expect(conversationResponse.status(), await conversationResponse.text()).toBe(201);
    const conversationId = ((await conversationResponse.json()) as { id: string }).id;
    const accepted = await recipientApi.post(`/api/v1/messages/conversations/${conversationId}/respond`, {
      data: { accept: true },
      headers: mutationHeaders,
    });
    expect(accepted.ok(), await accepted.text()).toBeTruthy();
    await page.goto(`/messages/${conversationId}`);
    const reply = page.getByRole("textbox", { name: "Reply", exact: true });
    await reply.fill("The evidence is visible and the mobile reply editor remains usable.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("The evidence is visible and the mobile reply editor remains usable.")).toBeVisible();
    await expectNoPageOverflow(page);
  } finally {
    await recipientApi.dispose();
  }

  await page.goto("/settings/ai-improvement");
  await expect(page.getByRole("heading", { name: "Your AI improvement records" })).toBeVisible();
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "Operations access required" })).toBeVisible();
});
