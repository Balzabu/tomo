import assert from 'node:assert/strict';
import { dict, LANGS, monthsLong, monthsShort, weekdayInitials, weekdaysShort } from '../../src/i18n/strings.ts';
import { keepKoreanWords, langForLocale, pluralSuffix, WORD_JOINER } from '../../src/i18n/core.ts';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
// Plural variants are optional per language: `xxxOne` (n = 1) and, in Polish,
// `xxxMany`. Without one, the base string is used.
const isMany = (k: string) => k.endsWith('Many') && k.slice(0, -4) in dict.en;
const isOne = (k: string) => k.endsWith('One') && k.slice(0, -3) in dict.en;
const isVariant = (k: string) => isMany(k) || isOne(k);
const keys = Object.keys(dict.en).filter((k) => !isVariant(k)).sort();

assert.deepEqual(Object.keys(dict).sort(), [...LANGS].sort(), 'dict languages differ from LANGS');
for (const lang of LANGS) {
  const d = dict[lang];
  // Same key set everywhere: a missing key silently falls back to English.
  assert.deepEqual(Object.keys(d).filter((k) => !isVariant(k)).sort(), keys, `${lang}: key set differs from en`);
  for (const [k, v] of Object.entries(d)) {
    assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
    assert.equal(v, v.trim(), `${lang}.${k} has leading/trailing spaces`);
    assert.ok(!/ {2}/.test(v), `${lang}.${k} has a double space`);
    // Plural variants may write the number literally instead of {n}, nothing else.
    const base = isMany(k) ? k.slice(0, -4) : isOne(k) ? k.slice(0, -3) : null;
    if (base) {
      assert.ok(base in d, `${lang}.${k}: no base string`);
      const want = placeholders(dict.en[base]).filter((p) => p !== '{n}');
      assert.deepEqual(placeholders(v).filter((p) => p !== '{n}'), want, `${lang}.${k} placeholders`);
    } else {
      assert.deepEqual(placeholders(v), placeholders(dict.en[k]), `${lang}.${k} placeholders`);
    }
  }
  if (lang !== 'pl') assert.ok(!Object.keys(d).some(isMany), `${lang}: only Polish has Many variants`);
  // French zero uses the One form: a One text with a number must take it from {n}, not write "1".
  if (lang === 'fr') {
    for (const [k, v] of Object.entries(d)) {
      if (isOne(k) && /(^|[^\d.])1(?!\d)/.test(v) && !v.includes('{n}')) assert.fail(`fr.${k} writes "1" instead of {n}`);
    }
  }
  // Every singular the English text distinguishes needs one here too (Asian languages have none).
  if (!['ja', 'ko', 'zh-Hant'].includes(lang)) {
    for (const k of Object.keys(dict.en).filter(isOne)) assert.ok(k in d, `${lang}: missing ${k}`);
  }
  for (const table of [monthsShort, monthsLong]) assert.equal(table[lang].length, 12, `${lang}: months`);
  for (const table of [weekdaysShort, weekdayInitials]) assert.equal(table[lang].length, 7, `${lang}: weekdays`);
}

// Plural choice
assert.equal(pluralSuffix('it', 1), 'One');
assert.equal(pluralSuffix('it', '1'), 'One');
assert.equal(pluralSuffix('it', 0), '');
assert.equal(pluralSuffix('en', '1,5'), '');
assert.equal(pluralSuffix('fr', 0), 'One');
assert.equal(pluralSuffix('fr', '0'), 'One');
assert.equal(pluralSuffix('ja', 1), '');
assert.equal(pluralSuffix('pl', 1), 'One');
for (const n of [2, 3, 4, 22, 104, '1 234']) assert.equal(pluralSuffix('pl', n), '', `pl few ${n}`);
for (const n of [0, 5, 11, 12, 14, 21, 25, 112, '4 935']) assert.equal(pluralSuffix('pl', n), 'Many', `pl many ${n}`);
assert.equal(pluralSuffix('pl', '1,9'), '');
assert.equal(pluralSuffix('it', '1.287'), '');

// Device locale → app language
assert.equal(langForLocale('it', 'IT', 'it-IT'), 'it');
assert.equal(langForLocale('pt', 'BR', 'pt-BR'), 'pt-BR');
assert.equal(langForLocale('pt', 'PT', 'pt-PT'), 'pt');
assert.equal(langForLocale('pt', 'AO', 'pt-AO'), 'pt');
assert.equal(langForLocale('zh', 'TW', 'zh-Hant-TW'), 'zh-Hant');
assert.equal(langForLocale('zh', 'HK', 'zh-HK'), 'zh-Hant');
assert.equal(langForLocale('zh', 'CN', 'zh-Hans-CN'), null);
assert.equal(langForLocale('zh', 'SG', 'zh-SG'), null);
assert.equal(langForLocale('sv', 'SE', 'sv-SE'), null);
assert.equal(langForLocale('ko', 'KR', 'ko-KR'), 'ko');

// Korean: joiners only inside words, never around spaces; idempotent.
const W = WORD_JOINER;
assert.equal(keepKoreanWords('잠금을 풀 수'), `잠${W}금${W}을 풀 수`);
assert.equal(keepKoreanWords('25페이지.'), `2${'5'}${W}페${W}이${W}지${W}.`);
assert.equal(keepKoreanWords(keepKoreanWords('읽기 시작')), keepKoreanWords('읽기 시작'));
assert.equal(keepKoreanWords('Tomo 앱'), 'Tomo 앱');

console.log('i18n ok');
