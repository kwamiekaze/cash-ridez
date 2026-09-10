import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const frontendFiles = walk('src');

describe('browser code never contacts the mapping service directly', () => {
  it('has no reference to nominatim.openstreetmap.org anywhere under src/', () => {
    const offenders = frontendFiles.filter((file) =>
      readFileSync(file, 'utf8').includes('nominatim.openstreetmap.org'),
    );
    expect(offenders).toEqual([]);
  });

  it('never sets a User-Agent header from the browser', () => {
    const offenders = frontendFiles.filter((file) =>
      /['"]User-Agent['"]\s*:/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('address autocomplete uses the authenticated server proxy', () => {
  const source = readFileSync('src/components/AddressAutocomplete.tsx', 'utf8');

  it('invokes the geocode-address function', () => {
    expect(source).toContain('supabase.functions.invoke("geocode-address"');
  });

  it('keeps the Georgia context and the local + custom fallbacks', () => {
    expect(source).toContain(', Georgia`');
    expect(source).toContain('isGeorgiaAddress');
    expect(source).toContain('getLocalSuggestions(query)');
    expect(source).toContain("place_id: 'custom-address'");
  });
});
