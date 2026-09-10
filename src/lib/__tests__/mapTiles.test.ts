import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const liveMap = read('src/components/LiveMapView.tsx');
const publicMap = read('src/components/PublicLiveMapView.tsx');
const indexCss = read('src/index.css');

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

describe('live map basemap tiles', () => {
  it('uses the keyless OpenStreetMap fallback in both live map components', () => {
    for (const src of [liveMap, publicMap]) {
      expect(src).toContain(`import.meta.env.VITE_MAP_TILE_URL || '${OSM_URL}'`);
      expect(src).toContain('maxZoom: 19');
      expect(src).toContain('OpenStreetMap contributors');
    }
  });

  it('no longer references the key-required CARTO basemap anywhere', () => {
    for (const src of [liveMap, publicMap, indexCss]) {
      expect(src).not.toContain('cartocdn');
      expect(src).not.toContain('carto.com');
    }
  });

  it('darkens only the raster tile pane inside the map card', () => {
    expect(indexCss).toContain('.live-map-card .leaflet-tile-pane');
    const rule = indexCss.slice(indexCss.indexOf('.live-map-card .leaflet-tile-pane'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('filter:');
    expect(body).not.toContain('marker');
    expect(body).not.toContain('popup');
  });

  it('leaves map user-selection and availability logic untouched', () => {
    // These markers guard the untouched data path in LiveMapView.
    expect(liveMap).toContain('is_map_visible');
    expect(publicMap).toContain('public_map_presence');
  });
});
