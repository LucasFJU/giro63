import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanBody} from '../src/security.js';

test('conteúdo editorial bloqueia esquemas executáveis e marcação fora da lista permitida',()=>{
  const inputs=[
    '<form action="javascript:alert(1)"><input formaction="javascript:alert(1)"></form>',
    '<svg><animate attributeName="href" values="https://example.com;javascript:alert(1)"></animate></svg>',
    '<textarea>conteúdo</textarea/><img src="x" onerror="alert(1)">',
    '<noscript><p onclick="alert(1)">texto</p></noscript><script>alert(1)</script>',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><p>Notícia</p>',
    '<a href="jav&#x61;script:alert(1)" onclick="alert(1)">Link</a>'
  ];
  for(const input of inputs){const result=cleanBody(input);assert.doesNotMatch(result,/<(?:script|style|textarea|noscript|svg|img|form|input|meta)\b|onerror\s*=|onclick\s*=|href\s*=\s*['"]?\s*javascript:/i);assert.equal(cleanBody(result),result);}
  assert.match(cleanBody('<p><strong>Notícia</strong> <a href="https://example.com">Fonte</a></p>'),/<strong>Notícia<\/strong>/);
});
