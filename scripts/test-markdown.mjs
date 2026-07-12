#!/usr/bin/env node
// Markdown 双向 round-trip 测试
// 跑法：node --import tsx scripts/test-markdown.mjs

import {
  docToMarkdown,
  markdownToDoc,
  looksLikeMarkdown,
} from '../src/lib/markdown/index.ts'

let pass = 0
let fail = 0

function eq(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log('  PASS  ' + name)
  } else {
    fail++
    console.log('  FAIL  ' + name)
    console.log('        expected: ' + e)
    console.log('        actual:   ' + a)
  }
}

function eqStr(name, actual, expected) {
  if (actual === expected) {
    pass++
    console.log('  PASS  ' + name)
  } else {
    fail++
    console.log('  FAIL  ' + name)
    console.log('        expected: ' + JSON.stringify(expected))
    console.log('        actual:   ' + JSON.stringify(actual))
  }
}

function runSection(title, fn) {
  console.log('\n--- ' + title + ' ---')
  fn()
}

// ---------------------------------------------------------------------------
// looksLikeMarkdown
// ---------------------------------------------------------------------------
runSection('looksLikeMarkdown', () => {
  eq('empty', looksLikeMarkdown(''), false)
  eq('plain sentence', looksLikeMarkdown('hello world'), false)
  eq('multi-line plain', looksLikeMarkdown('line one\nline two'), false)
  eq('heading', looksLikeMarkdown('# Hi'), true)
  eq('bullet', looksLikeMarkdown('- one\n- two'), true)
  eq('ordered', looksLikeMarkdown('1. one\n2. two'), true)
  eq('task list', looksLikeMarkdown('- [x] done\n- [ ] todo'), true)
  eq('code fence', looksLikeMarkdown('```js\nx\n```'), true)
  eq('blockquote', looksLikeMarkdown('> hello'), true)
  eq('hr', looksLikeMarkdown('---'), true)
  eq('bold', looksLikeMarkdown('this is **bold**'), true)
  eq('italic', looksLikeMarkdown('this is *italic*'), true)
  eq('strike', looksLikeMarkdown('this is ~~struck~~'), true)
  eq('code', looksLikeMarkdown('this is `code`'), true)
  eq('link', looksLikeMarkdown('click [here](https://x)'), true)
  eq('wikilink', looksLikeMarkdown('see [[Foo]] for more'), true)
  eq('image', looksLikeMarkdown('![alt](https://x.com/y.png)'), true)
  eq('image with title', looksLikeMarkdown('![alt](https://x.com/y.png "title")'), true)
  eq('table basic', looksLikeMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |'), true)
  eq('table with align', looksLikeMarkdown('| a | b |\n| :--- | ---: |\n| 1 | 2 |'), true)
})

// ---------------------------------------------------------------------------
// docToMarkdown
// ---------------------------------------------------------------------------
runSection('docToMarkdown', () => {
  eqStr('heading + paragraph',
    docToMarkdown({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ],
    }),
    '# Title\n\nHello',
  )

  eqStr('bullet list flat',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
        ],
      }],
    }),
    '- a\n- b',
  )

  eqStr('bullet list nested',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
              {
                type: 'bulletList',
                content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a1' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a2' }] }] },
                ],
              },
            ],
          },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
        ],
      }],
    }),
    '- a\n  - a1\n  - a2\n- b',
  )

  eqStr('task list',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }] },
        ],
      }],
    }),
    '- [x] done\n- [ ] todo',
  )

  eqStr('code block',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: { language: 'js' },
        content: [{ type: 'text', text: 'console.log(1)' }],
      }],
    }),
    '```js\nconsole.log(1)\n```',
  )

  eqStr('blockquote',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'world' }] },
        ],
      }],
    }),
    '> hello\n> world',
  )

  eqStr('horizontalRule',
    docToMarkdown({ type: 'doc', content: [{ type: 'horizontalRule' }] }),
    '---',
  )

  eqStr('wikilink',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Foo',
          marks: [{ type: 'pageLink', attrs: { pageId: 'abc', pageTitle: 'Foo' } }],
        }],
      }],
    }),
    '[[Foo]]',
  )

  eqStr('wikilink (pageId=null still serializes title)',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Bar',
          marks: [{ type: 'pageLink', attrs: { pageId: null, pageTitle: 'Bar' } }],
        }],
      }],
    }),
    '[[Bar]]',
  )

  eqStr('wikilink with surrounding text',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'see ' },
          { type: 'text', text: 'Foo',
            marks: [{ type: 'pageLink', attrs: { pageId: 'x', pageTitle: 'Foo' } }] },
          { type: 'text', text: ' for more' },
        ],
      }],
    }),
    'see [[Foo]] for more',
  )

  // ---- image ----
  eqStr('image external no title',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { src: 'https://x.com/y.png', alt: 'A', kind: 'external' },
      }],
    }),
    '![A](https://x.com/y.png)',
  )
  eqStr('image external with title',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { src: 'https://x.com/y.png', alt: 'A', title: 'B', kind: 'external' },
      }],
    }),
    '![A](https://x.com/y.png "B")',
  )
  eqStr('image local',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { src: '/api/files/abc', alt: 'A', kind: 'local' },
      }],
    }),
    '![A](/api/files/abc)',
  )
  eqStr('image empty alt',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { src: 'https://x.com/y.png', kind: 'external' },
      }],
    }),
    '![](https://x.com/y.png)',
  )
  eqStr('image inline in paragraph',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'see ' },
          { type: 'image', attrs: { src: 'https://x.com/y.png', alt: 'A', kind: 'external' } },
          { type: 'text', text: ' ok' },
        ],
      }],
    }),
    'see ![A](https://x.com/y.png) ok',
  )
  eqStr('image title with escaped quote',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { src: 'https://x.com/y.png', alt: 'A', title: 'say "hi"', kind: 'external' },
      }],
    }),
    '![A](https://x.com/y.png "say \\"hi\\"")',
  )

  // ---- table ----
  eqStr('table 2x2 (no align)',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
            ],
          },
        ],
      }],
    }),
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
  )
  eqStr('table with align (left/center/right)',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', attrs: { textAlign: 'left' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L' }] }] },
              { type: 'tableHeader', attrs: { textAlign: 'center' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] },
              { type: 'tableHeader', attrs: { textAlign: 'right' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'R' }] }] },
            ],
          },
        ],
      }],
    }),
    '| L | C | R |\n| :--- | :---: | ---: |',
  )
  eqStr('table cell with bold',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [
                { type: 'text', text: 'a ' },
                { type: 'text', text: 'B', marks: [{ type: 'bold' }] },
                { type: 'text', text: ' c' },
              ] }] },
            ],
          },
        ],
      }],
    }),
    '| h |\n| --- |\n| a **B** c |',
  )
  eqStr('table cell with pipe escaped',
    docToMarkdown({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a | b' }] }] },
            ],
          },
        ],
      }],
    }),
    '| h |\n| --- |\n| a \\| b |',
  )
})

// ---------------------------------------------------------------------------
// markdownToDoc
// ---------------------------------------------------------------------------
runSection('markdownToDoc', () => {
  eq('heading + paragraph',
    markdownToDoc('# Title\n\nHello'),
    {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ],
    },
  )

  eq('bullet list flat',
    markdownToDoc('- a\n- b'),
    {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
        ],
      }],
    },
  )

  eq('bullet list nested',
    markdownToDoc('- a\n  - a1\n  - a2\n- b'),
    {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
              {
                type: 'bulletList',
                content: [
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a1' }] }] },
                  { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a2' }] }] },
                ],
              },
            ],
          },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
        ],
      }],
    },
  )

  eq('task list',
    markdownToDoc('- [x] done\n- [ ] todo'),
    {
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }] },
        ],
      }],
    },
  )

  eq('code block',
    markdownToDoc('```js\nconsole.log(1)\n```'),
    {
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: { language: 'js' },
        content: [{ type: 'text', text: 'console.log(1)' }],
      }],
    },
  )

  eq('blockquote (lazy continuation = 1 para)',
    markdownToDoc('> hello\n> world'),
    {
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'hello\nworld' }] },
        ],
      }],
    },
  )

  eq('blockquote (blank line = 2 paras)',
    markdownToDoc('> hello\n\n> world'),
    {
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'world' }] },
        ],
      }],
    },
  )

  eq('horizontalRule',
    markdownToDoc('---'),
    { type: 'doc', content: [{ type: 'horizontalRule' }] },
  )

  eq('inline marks',
    markdownToDoc('a **B** c *I* d ~~X~~ e `C` f [L](https://x) g'),
    {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a ' },
          { type: 'text', text: 'B', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' c ' },
          { type: 'text', text: 'I', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' d ' },
          { type: 'text', text: 'X', marks: [{ type: 'strike' }] },
          { type: 'text', text: ' e ' },
          { type: 'text', text: 'C', marks: [{ type: 'code' }] },
          { type: 'text', text: ' f ' },
          { type: 'text', text: 'L', marks: [{ type: 'link', attrs: { href: 'https://x' } }] },
          { type: 'text', text: ' g' },
        ],
      }],
    },
  )

  eq('wikilink in paragraph',
    markdownToDoc('see [[Foo]] for more'),
    {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'see ' },
          {
            type: 'text',
            text: 'Foo',
            marks: [{ type: 'pageLink', attrs: { pageId: null, pageTitle: 'Foo' } }],
          },
          { type: 'text', text: ' for more' },
        ],
      }],
    },
  )

  eq('wikilink with title containing spaces',
    markdownToDoc('[[My Note Title]]'),
    {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'My Note Title',
          marks: [{ type: 'pageLink', attrs: { pageId: null, pageTitle: 'My Note Title' } }],
        }],
      }],
    },
  )

  eq('wikilink and link coexist',
    markdownToDoc('see [[Foo]] or [Bar](https://x)'),
    {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'see ' },
          {
            type: 'text',
            text: 'Foo',
            marks: [{ type: 'pageLink', attrs: { pageId: null, pageTitle: 'Foo' } }],
          },
          { type: 'text', text: ' or ' },
          {
            type: 'text',
            text: 'Bar',
            marks: [{ type: 'link', attrs: { href: 'https://x' } }],
          },
        ],
      }],
    },
  )

  // ---- image ----
  const imgAttrs = (src, kind, alt = null, title = null) => ({
    src,
    alt,
    title,
    kind,
    width: null,
    height: null,
  })

  eq('image external',
    markdownToDoc('![A](https://x.com/y.png)'),
    {
      type: 'doc',
      content: [{
        type: 'image',
        attrs: imgAttrs('https://x.com/y.png', 'external', 'A'),
      }],
    },
  )
  eq('image with title',
    markdownToDoc('![A](https://x.com/y.png "B")'),
    {
      type: 'doc',
      content: [{
        type: 'image',
        attrs: imgAttrs('https://x.com/y.png', 'external', 'A', 'B'),
      }],
    },
  )
  eq('image local',
    markdownToDoc('![A](/api/files/abc)'),
    {
      type: 'doc',
      content: [{
        type: 'image',
        attrs: imgAttrs('/api/files/abc', 'local', 'A'),
      }],
    },
  )
  // image 自身必须 block-level：前后文本被拆成独立 paragraph
  eq('image inline embed',
    markdownToDoc('see ![a](https://y.com) thanks'),
    {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'see ' }] },
        { type: 'image', attrs: imgAttrs('https://y.com', 'external', 'a') },
        { type: 'paragraph', content: [{ type: 'text', text: ' thanks' }] },
      ],
    },
  )
  // 非白名单 URL 降级为原文文字
  eq('image ftp downgrade',
    markdownToDoc('![A](ftp://x.com/y.png)'),
    {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: '![A](ftp://x.com/y.png)' }],
      }],
    },
  )

  // ---- table ----
  eq('table 2x2 basic',
    markdownToDoc('| a | b |\n| --- | --- |\n| 1 | 2 |'),
    {
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
            ],
          },
        ],
      }],
    },
  )
  eq('table with align (left/center/right)',
    markdownToDoc('| L | C | R |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |'),
    {
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', attrs: { textAlign: 'left' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L' }] }] },
              { type: 'tableHeader', attrs: { textAlign: 'center' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] },
              { type: 'tableHeader', attrs: { textAlign: 'right' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'R' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { textAlign: 'left' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
              { type: 'tableCell', attrs: { textAlign: 'center' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
              { type: 'tableCell', attrs: { textAlign: 'right' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '3' }] }] },
            ],
          },
        ],
      }],
    },
  )
  // 表头 + alignment 但无 data row：合法（空 data 表）
  eq('table header only (no data rows)',
    markdownToDoc('| h1 | h2 |\n| --- | --- |'),
    {
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h1' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h2' }] }] },
            ],
          },
        ],
      }],
    },
  )
  eq('table cell with bold',
    markdownToDoc('| h |\n| --- |\n| a **B** c |'),
    {
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [
                { type: 'text', text: 'a ' },
                { type: 'text', text: 'B', marks: [{ type: 'bold' }] },
                { type: 'text', text: ' c' },
              ] }] },
            ],
          },
        ],
      }],
    },
  )
})

// ---------------------------------------------------------------------------
// round-trip: serialize → parse → serialize 应稳定
// ---------------------------------------------------------------------------
runSection('round-trip stable', () => {
  const fixtures = [
    '# Title\n\nHello',
    '- a\n- b',
    '- a\n  - a1\n  - a2\n- b',
    '- [x] done\n- [ ] todo',
    '```js\nconsole.log(1)\n```',
    '> hello\n> world',
    '---',
    'see [[Foo]] for more',
    'see [[Foo]] or [Bar](https://x)',
    '[[My Note Title]]',
    '![A](https://x.com/y.png)',
    '![A](https://x.com/y.png "B")',
    'see ![a](https://y.com) thanks',
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
    '| L | C | R |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |',
  ]
  for (const md of fixtures) {
    const once = docToMarkdown(markdownToDoc(md))
    const twice = docToMarkdown(markdownToDoc(once))
    eqStr('stable: ' + JSON.stringify(md), twice, once)
  }
})

console.log('\n================================')
console.log('  ' + pass + ' passed, ' + fail + ' failed')
console.log('================================\n')
process.exit(fail === 0 ? 0 : 1)