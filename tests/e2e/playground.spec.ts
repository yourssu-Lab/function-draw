import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const editor = (page: Page) =>
  page.getByRole("textbox", { name: "Function code" });
async function setCode(page: Page, code: string) {
  await editor(page).fill(code);
}
async function render(page: Page) {
  await page
    .getByRole("button", { name: "Render Function", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Render Function", exact: false }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function png(page: Page) {
  return page
    .locator("canvas")
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
}
async function blackPixels(page: Page) {
  return page.locator("canvas").evaluate((c) => {
    const canvas = c as HTMLCanvasElement,
      data = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 128) count++;
    return count;
  });
}
async function draw(
  page: Page,
  name: string,
  from: [number, number],
  to: [number, number],
) {
  await page.getByRole("button", { name, exact: true }).click();
  const box = (await page
    .getByRole("application", { name: "Graphic drawing surface" })
    .boundingBox())!;
  await page.mouse.move(
    box.x + from[0] * box.width,
    box.y + from[1] * box.height,
  );
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, {
    steps: 15,
  });
  await page.mouse.up();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Render Function", exact: false }),
  ).toBeEnabled();
});
test("drawing → circle → union → intersection → subtraction, entirely manual", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Clear canvas", exact: true }).click();
  await draw(page, "Circle", [0.38, 0.5], [0.6, 0.5]);
  await page
    .getByRole("button", { name: "Convert to Function", exact: false })
    .click();
  await expect(editor(page)).toContainText("f(x, y) =");
  await expect(editor(page)).toContainText("sqrt(");
  await expect(editor(page)).not.toContainText("circle(");
  await expect(editor(page)).not.toContainText("union");
  await render(page);
  expect(await blackPixels(page)).toBeGreaterThan(35000);
  await draw(page, "Circle", [0.6, 0.5], [0.82, 0.5]);
  const before = await png(page);
  await page
    .getByRole("button", { name: "Convert to Function", exact: false })
    .click();
  await expect(editor(page)).toContainText("min(");
  expect(await png(page)).toBe(before);
  const union = await editor(page).innerText();
  await render(page);
  const unionArea = await blackPixels(page);
  await setCode(page, union.replace("min(", "max("));
  const unchanged = await png(page);
  await page.waitForTimeout(150);
  expect(await png(page)).toBe(unchanged);
  await render(page);
  const intersectionArea = await blackPixels(page);
  expect(intersectionArea).toBeLessThan(unionArea / 2);
  await setCode(
    page,
    "f(x,y) = max(sqrt((x-.38)^2+(y-.5)^2)-.22, -(sqrt((x-.6)^2+(y-.5)^2)-.22))",
  );
  await render(page);
  expect(await blackPixels(page)).toBeGreaterThan(intersectionArea);
  expect(await blackPixels(page)).toBeLessThan(unionArea);
});
test("wave, freehand simplification, transforms, and eraser", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Wave field/ }).click();
  await render(page);
  expect(await blackPixels(page)).toBeGreaterThan(4000);
  await page.getByRole("button", { name: "Clear canvas", exact: true }).click();
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  const box = (await page.getByRole("application").boundingBox())!;
  await page.mouse.move(box.x + 0.1 * box.width, box.y + 0.5 * box.height);
  await page.mouse.down();
  for (let i = 0; i <= 100; i++)
    await page.mouse.move(
      box.x + (0.1 + (0.8 * i) / 100) * box.width,
      box.y + (0.5 + 0.15 * Math.sin(i / 12)) * box.height,
    );
  await page.mouse.up();
  await page.getByRole("button", { name: /Convert to Function/ }).click();
  await expect(editor(page)).toContainText("t1 =");
  await expect(editor(page)).toContainText("sqrt(");
  await expect(editor(page)).not.toContainText("polyline(");
  await render(page);
  expect(await blackPixels(page)).toBeGreaterThan(1800);
  await setCode(
    page,
    "translate(.5,.5,rotate(PI/4,scale(1.5,box(0,0,.2,.1))))",
  );
  await render(page);
  expect(await blackPixels(page)).toBeGreaterThan(10000);
  await draw(page, "Eraser", [0.3, 0.5], [0.7, 0.5]);
  await page.getByRole("button", { name: /Convert to Function/ }).click();
  await expect(editor(page)).not.toContainText("subtract(");
  await render(page);
});
test("errors preserve raster; examples and imports do not auto-render; export is PNG", async ({
  page,
}) => {
  const before = await png(page);
  await setCode(page, "circle(hello, .5, .2)");
  await page.getByRole("button", { name: /Render Function/ }).click();
  await expect(page.getByRole("alert")).toContainText("Line 1");
  await expect(page.getByRole("alert")).toContainText("numeric");
  expect(await png(page)).toBe(before);
  await setCode(page, "field(sqrt(-1))");
  await page.getByRole("button", { name: /Render Function/ }).click();
  await expect(page.getByRole("alert")).toContainText("non-finite");
  expect(await png(page)).toBe(before);
  await page.getByRole("button", { name: /Repetition/ }).click();
  expect(await png(page)).toBe(before);
  await render(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: false }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const data = await readFile((await download.path())!);
  expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const rendered = await png(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "test.fg",
    mimeType: "text/plain",
    buffer: Buffer.from("circle(.5,.5,.35)"),
  });
  await expect(editor(page)).toHaveText("circle(.5,.5,.35)");
  expect(await png(page)).toBe(rendered);
  await editor(page).press("Control+Enter");
  await expect(
    page.getByRole("button", { name: /Render Function/ }),
  ).toBeEnabled();
  expect(await blackPixels(page)).toBeGreaterThan(95000);
});
test("undo, redo, selection move, persistence, field mode and responsive layout", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Clear canvas", exact: true }).click();
  await draw(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await draw(page, "Select", [0.2, 0.2], [0.5, 0.5]);
  await page.getByRole("button", { name: /Convert to Function/ }).click();
  await expect(editor(page)).toContainText("abs(x - 0.5)");
  await page.getByRole("button", { name: "Undo drawing", exact: true }).click();
  await page.getByRole("button", { name: /Convert to Function/ }).click();
  await expect(editor(page)).toContainText("abs(x - 0.2)");
  await page.getByRole("button", { name: "Redo drawing", exact: true }).click();
  await page.getByRole("button", { name: /Convert to Function/ }).click();
  await render(page);
  const before = await png(page);
  await page.getByLabel("Show field").check();
  expect(await png(page)).toBe(before);
  await render(page);
  expect(await png(page)).not.toBe(before);
  await setCode(page, "f(x,y) = sin(x*10)");
  await page.reload();
  await expect(editor(page)).toHaveText("f(x,y) = sin(x*10)");
  await expect(
    page.getByText("Function modified · not rendered"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: /Convert to Function/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/playground-mobile.png",
    fullPage: true,
  });
});
test("all presets render; reference and about open; desktop screenshot", async ({
  page,
}) => {
  for (const name of [
    "Circle",
    "Union",
    "Intersection",
    "Difference",
    "Repetition",
    "Wave field",
    "Math pattern",
  ]) {
    await page
      .locator(".example-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .click();
    await render(page);
    expect(await blackPixels(page)).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Reference", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Transform the input coordinates",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "A graphic is a function",
  );
  await page.getByRole("button", { name: "Close reference" }).click();
  await page
    .locator(".example-card")
    .filter({
      has: page.getByRole("heading", { name: "Difference", exact: true }),
    })
    .click();
  await render(page);
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.screenshot({
    path: "test-results/playground-desktop.png",
    fullPage: true,
  });
});
test("copy/save text, line tool, drawing and editor shortcuts, cancellation and renderer architecture", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copy Function", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "max(",
  );
  const savedPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save Function", exact: true })
    .click();
  const saved = await savedPromise;
  expect(saved.suggestedFilename()).toBe("untitled.fg");
  expect(await readFile((await saved.path())!, "utf8")).toBe(
    await editor(page).innerText(),
  );
  await page.getByRole("button", { name: "Clear canvas", exact: true }).click();
  await draw(page, "Line", [0.2, 0.2], [0.8, 0.8]);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".drawing-overlay polyline")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".drawing-overlay polyline")).toHaveCount(1);
  await page.getByRole("button", { name: /Convert to Function/ }).click();
  await expect(editor(page)).toContainText("t1 =");
  await expect(editor(page)).not.toContainText("line(");
  // Any accidental primitive-based final renderer fails this scenario.
  await page.evaluate(() => {
    for (const name of ["arc", "rect", "lineTo"] as const) {
      CanvasRenderingContext2D.prototype[name] = () => {
        throw new Error("Primitive drawing is forbidden in field rendering");
      };
    }
  });
  await render(page);
  expect(await blackPixels(page)).toBeGreaterThan(2000);
  await setCode(page, "circle(.5,.5,.2)");
  await editor(page).press("Control+Enter");
  await expect(page.getByText("In sync", { exact: true })).toBeVisible();
  expect(await blackPixels(page)).toBeGreaterThan(32000);
  await editor(page).press("Control+End");
  await editor(page).pressSequentially(" ");
  await editor(page).press("Control+z");
  await expect(editor(page)).toHaveText("circle(.5,.5,.2)");
  const previous = await png(page);
  await page.getByLabel("Render resolution").selectOption("768");
  await setCode(page, "field(abs(sin(x*20)*cos(y*20))-.3)");
  await page.getByRole("button", { name: /Render Function/ }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Render Function/ }),
  ).toBeEnabled();
  expect(await png(page)).toBe(previous);
});
