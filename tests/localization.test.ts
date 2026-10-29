import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import intro from '../src/engine/intro/introText.json';
import opening from '../public/assets/packs/opening.json';
import npc from '../public/assets/text/npc_text.json';
import world from '../public/assets/world/world.json';
import { locale, russian, setLocale, t, translateGameText } from '../src/i18n';

test('Russian covers the complete imported intro, home, forest and item dialogue corpus', () => {
  const forest = JSON.parse(gunzipSync(readFileSync('public/assets/forest/forest.json.gz')).toString()) as { rooms: Record<string, { program: { strings: string[] } }> };
  const texts = [
    ...Object.values(intro).flatMap(Object.values),
    ...opening.opening.map(action => 'text' in action ? action.text : ''),
    ...opening.tree.map(action => 'text' in action ? action.text : ''),
    ...Object.values(forest.rooms).flatMap(room => room.program.strings),
    ...npc.strings, ...world.rooms.map(room => room.title),
  ].filter((text): text is string => !!text && /[a-z]/i.test(text) && !/^[-A-Z0-9_]+(?:\.(?:WSA|CPS|EMC|VRM|DAT|COL))?$/.test(text));
  const unique = [...new Set(texts.map(text => text.replace(/\s+/g, ' ').trim()))];
  assert.ok(unique.length > 400);
  assert.deepEqual(unique.filter(text => !russian[text]?.trim()), [], 'A visible line has no Russian translation');
  const previous = locale.value;
  try {
    setLocale('ru');
    assert.equal(translateGameText("Hmm?  Blank, except it has Brynn's name on it!"), 'Хм? Пусто, только имя Брин!');
    assert.equal(t('Took Letter'), 'Взято: Письмо');
    assert.equal(t('Chapter 3'), 'Глава 3');
    assert.equal(t('“Before the bridge” saved.'), '«Before the bridge» сохранено.');
    setLocale('en');
    assert.equal(translateGameText("Hmm?  Blank, except it has Brynn's name on it!"), "Hmm?  Blank, except it has Brynn's name on it!");
  } finally { setLocale(previous); }
});

test('language changes persist safely and unknown text remains intact', () => {
  const previous = locale.value, descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key: string, value: string) => values.set(key, value) } });
    setLocale('en'); setLocale('ru');
    assert.equal(values.get('kyrandia.language'), 'ru');
    assert.equal(t('An unmapped future scene.'), 'An unmapped future scene.');
    setLocale('bad'); assert.equal(locale.value, 'ru');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Blocked storage'); } });
    assert.doesNotThrow(() => setLocale('en'));
    assert.equal(t('Settings'), 'Settings');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    setLocale(previous);
  }
});
