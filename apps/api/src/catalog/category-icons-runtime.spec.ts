import { execFileSync } from "node:child_process";

it("loads shared category icons in the Node runtime used by the API, without a test transformer", () => {
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      "const { CATEGORY_ICONS } = require('@gestion/contracts'); if (!Array.isArray(CATEGORY_ICONS) || !CATEGORY_ICONS.includes('box')) process.exit(1); process.stdout.write('ok');",
    ],
    { cwd: process.cwd(), encoding: "utf8", timeout: 10000, windowsHide: true },
  );
  expect(output).toBe("ok");
});
