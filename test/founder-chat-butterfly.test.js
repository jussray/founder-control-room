import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const app=readFileSync('public/control-room/app.js','utf8');
const css=readFileSync('public/control-room/styles.css','utf8');
const line=app.split('\n').find(l=>l.includes('data-fcr-thinking-companion'));
describe('FCR companions',()=>{it('mounts both companions exclusively in the existing sending branch',()=>{expect(line).toContain('state.founderChat.sending ?');expect(line).toContain('role="status"');expect(line).toContain('aria-hidden="true"');expect(line).toContain(" : ''");expect(line).toContain('Vesper &amp; McAllea');expect(line).toContain('fcr-mcallea-flight');expect(line).not.toContain('Aurelia');});it('preserves approved Vesper sprite bytes and eight frames',()=>{expect(createHash('sha256').update(readFileSync('public/control-room/assets/vesper-sprite.webp')).digest('hex')).toBe('8a90fa7aa9e1f0f84b21ddc613967b93ae5afcfb0834161ca7466265aac15a97');expect(line).toContain('fcr-vesper-sprite');expect(css).toContain('steps(8,end)');expect(css).toContain('background-position:-448px 0');});it('preserves reduced motion for both companions',()=>{expect(css).toContain('@media(prefers-reduced-motion:reduce){.fcr-vesper-sprite{animation:none');expect(css).toContain('@media(prefers-reduced-motion:reduce){.fcr-thinking-bird{animation:none');});});

it('preserves the extracted seven flight poses in a twelve-frame ping-pong sequence',()=>{expect(createHash('sha256').update(readFileSync('public/control-room/assets/mcallea-flight.webp')).digest('hex')).toBe('f31f2b73b5e8a735489a40bc15eb696cff72c846549743963f64f09addd75c4e');expect(css).toContain('steps(12,end)');expect(css).toContain('background-position:-792px 0');});
