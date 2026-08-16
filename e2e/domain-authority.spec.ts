import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

type Surface = {
  name: string;
  kind: 'browser' | 'version';
  origin: string;
  path?: string;
  allowedFinalOrigins?: string[];
  required?: boolean;
};

type DomainContract = {
  schemaVersion: number;
  project: string;
  mode: 'production';
  surfaces: Surface[];
};

const contract = JSON.parse(
  readFileSync(new URL('../config/domain-authority.json', import.meta.url), 'utf8'),
) as DomainContract;

const selectedSurfaces = contract.surfaces.filter(
  (surface) => surface.required !== false || process.env.DOMAIN_INCLUDE_OPTIONAL === '1',
);

test('domain contract is explicit and production-scoped', () => {
  expect(contract.schemaVersion).toBe(1);
  expect(contract.project).toBe('founder-control-room');
  expect(contract.mode).toBe('production');
  expect(selectedSurfaces.length).toBeGreaterThan(0);
});

for (const surface of selectedSurfaces) {
  test(`${surface.name} matches declared domain authority`, async ({ page, request }) => {
    if (surface.kind === 'browser') {
      const response = await page.goto(surface.origin, { waitUntil: 'domcontentloaded' });
      expect(response, `${surface.origin} returned no navigation response`).not.toBeNull();
      expect(response!.status(), `${surface.origin} returned a server error`).toBeLessThan(500);

      const finalOrigin = new URL(page.url()).origin;
      expect(surface.allowedFinalOrigins ?? [surface.origin]).toContain(finalOrigin);

      const body = (await page.locator('body').innerText()).slice(0, 2_000);
      expect(body).not.toMatch(/Error\s+5(?:00|02|03|04|20|21|22|23|24|25|26)/i);
      return;
    }

    const versionUrl = new URL(surface.path ?? '/version', surface.origin).toString();
    const response = await request.get(versionUrl);
    expect(response.ok(), `${versionUrl} returned ${response.status()}`).toBeTruthy();

    const payload = await response.text();
    expect(payload.trim().length).toBeGreaterThan(0);

    const expectedSha = process.env.DOMAIN_EXPECTED_SHA?.trim();
    if (expectedSha) {
      expect(payload, `${versionUrl} is not serving the expected exact SHA`).toContain(expectedSha);
    }
  });
}
