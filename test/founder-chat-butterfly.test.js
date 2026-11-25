import { describe,it,expect } from 'vitest';
import {readFileSync} from 'node:fs';
const app=readFileSync('public/control-room/app.js','utf8');
const css=readFileSync('public/control-room/styles.css','utf8');
describe('founder chat butterfly',()=>{it('is mounted exclusively in the existing sending branch',()=>{const line=app.split('\n').find(l=>l.includes('data-fcr-thinking-companion'));expect(line).toContain('state.founderChat.sending ?');expect(line).toContain('role="status"');expect(line).toContain('aria-hidden="true"');expect(line).toContain(" : ''");});it('preserves reduced motion',()=>{expect(css).toContain('@media(prefers-reduced-motion:reduce){.fcr-butterfly-wing{animation:none}}');});});

describe('Aurelia identity',()=>{it('names the butterfly in the active Council status',()=>{expect(app.split('\n').find(l=>l.includes('data-fcr-thinking-companion'))).toContain('Aurelia · Thinking across the existing Council lane');});});
