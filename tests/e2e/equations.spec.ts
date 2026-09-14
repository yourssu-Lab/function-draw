import { test, expect } from "@playwright/test";
test("plot f(x), preserve its source on reload, and expand without changing pixels", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Function code" });
  const render = page.getByRole("button", { name: /Render Function/ });
  await expect(render).toBeEnabled();
  await editor.fill("f(x) = x");
  await render.click();
  await expect(page.getByText("In sync", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const pixels = await page.locator("canvas").evaluate((c) => {
    const canvas = c as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const sample = (x: number, y: number) => ctx.getImageData(
      Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1,
    ).data[0];
    return [sample(.25, .25), sample(.5, .5), sample(.75, .75), sample(.25, .75), sample(.75, .25)];
  });
  expect(pixels).toEqual([0, 0, 0, 255, 255]);
  const before = await page.locator("canvas").evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.reload();
  await expect(editor).toHaveText("f(x) = x");
  await expect(render).toBeEnabled();
  await page.getByRole("button", { name: "Expand to equation" }).click();
  await expect(editor).toContainText("f(x, y) =");
  await render.click();
  await expect(page.getByText("In sync", { exact: true })).toBeVisible();
  expect(await page.locator("canvas").evaluate((c) => (c as HTMLCanvasElement).toDataURL())).toBe(before);
});

test("expand shorthand without rendering, then edit the equation and render", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Function code" });
  await expect(
    page.getByRole("button", { name: /Render Function/ }),
  ).toBeEnabled();
  await expect(editor).toContainText("f(x, y) =");
  await expect(editor).not.toContainText("circle(");
  const before = await page
    .locator("canvas")
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await editor.fill("box(.5,.5,.4,.2)");
  await page.getByRole("button", { name: "Expand to equation" }).click();
  await expect(editor).toContainText("qx1 = abs(x - 0.5) - 0.4 / 2;");
  await expect(editor).toContainText("sqrt(");
  expect(
    await page
      .locator("canvas")
      .evaluate((c) => (c as HTMLCanvasElement).toDataURL()),
  ).toBe(before);
  await editor.fill(
    "qx = abs(x - .5) - .2;\nqy = abs(y - .5) - .1;\nf(x,y) = sqrt(max(qx,0)^2 + max(qy,0)^2) + min(max(qx,qy),0)",
  );
  await page.getByRole("button", { name: /Render Function/ }).click();
  await expect(page.getByText("In sync", { exact: true })).toBeVisible();
  expect(
    await page.locator("canvas").evaluate((c) => {
      const ctx = (c as HTMLCanvasElement).getContext("2d")!;
      return ctx.getImageData(256, 256, 1, 1).data[0];
    }),
  ).toBe(0);
  const rendered = await page
    .locator("canvas")
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await editor.fill("a = b + 1;\nf(x,y) = a");
  await page.getByRole("button", { name: /Render Function/ }).click();
  await expect(page.getByRole("alert")).toContainText("Unknown variable");
  expect(
    await page
      .locator("canvas")
      .evaluate((c) => (c as HTMLCanvasElement).toDataURL()),
  ).toBe(rendered);
});
test("saved shorthand migrates to equations without losing its shape", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "function-native-graphics.code.v1",
      "circle(.5,.5,.35)",
    ),
  );
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Function code" });
  await expect(editor).toContainText("f(x, y) =");
  await expect(editor).toContainText("0.35");
  await expect(editor).not.toContainText("circle(");
  await expect(
    page.getByRole("button", { name: /Render Function/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Render Function/ }).click();
  await expect(page.getByText("In sync", { exact: true })).toBeVisible();
});
