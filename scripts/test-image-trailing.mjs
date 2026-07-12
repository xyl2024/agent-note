// 最终验证：replaceWith(from, to, [image, paragraph]) + 显式 setSelection 到 trailing paragraph
// 覆盖：单 image（空段/非空段）、多次插入 image、相同 src 插入
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    image: {
      attrs: { src: { default: null }, alt: { default: null }, kind: { default: 'local' }, width: { default: null }, height: { default: null } },
      group: 'block',
      leaf: true,
      toDOM: () => ['img'],
    },
  },
})

function ok(label, fn) {
  try {
    const r = fn()
    console.log('✓', label, '→', r)
  } catch (e) {
    console.log('✗', label, '→ ERROR:', e.message)
  }
}

function insertImageWithTrailingParagraph(state, attrs) {
  const imageType = state.schema.nodes.image
  const paraType = state.schema.nodes.paragraph
  const imageNode = imageType.create(attrs)
  const paragraphNode = paraType.create()

  // 数原 doc 里 image 数量
  let originalCount = 0
  state.doc.descendants((node) => {
    if (node.type === imageType) originalCount++
  })

  let tr = state.tr.replaceWith(
    state.selection.from,
    state.selection.to,
    [imageNode, paragraphNode],
  )

  // 找刚插入的 image (第 originalCount+1 个)
  let imagePos = -1
  let count = 0
  tr.doc.descendants((node, pos) => {
    if (node.type === imageType) {
      count++
      if (count === originalCount + 1) {
        imagePos = pos
        return false
      }
    }
  })

  if (imagePos >= 0) {
    const cursorPos = imagePos + imageNode.nodeSize + 1
    tr = tr.setSelection(TextSelection.create(tr.doc, cursorPos))
  }

  return tr
}

// 场景 A：光标在空段落（新页面），插外链图
console.log('\n===== A: 空段插入外部图 =====')
{
  const doc0 = schema.node('doc', null, [schema.node('paragraph')])
  let state = EditorState.create({ schema, doc: doc0, selection: TextSelection.create(doc0, 1) })
  let tr = insertImageWithTrailingParagraph(state, { src: 'http://a/x.png', kind: 'external' })
  ok('插入后 doc', () => tr.doc.toString())
  ok('sel', () => tr.selection.from + '/' + tr.selection.to + ' type=' + tr.selection.constructor.name)
  ok('输入 "hi"', () => tr.insertText('hi').doc.toString())
  ok('Enter', () => tr.split(tr.selection.from, 1, []).doc.toString())
  ok('输入 "world"', () => tr.insertText('world').doc.toString())
  ok('Enter', () => tr.split(tr.selection.from, 1, []).doc.toString())
  ok('输入 "!"', () => tr.insertText('!').doc.toString())
}

// 场景 B：光标在段落中部
console.log('\n===== B: 中部插入 =====')
{
  const doc0 = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello')])])
  let state = EditorState.create({ schema, doc: doc0, selection: TextSelection.create(doc0, 3) })
  let tr = insertImageWithTrailingParagraph(state, { src: 'http://a/y.png', kind: 'external' })
  ok('插入后 doc', () => tr.doc.toString())
  ok('sel', () => tr.selection.from)
  ok('输入 "X"', () => tr.insertText('X').doc.toString())
  ok('Enter', () => tr.split(tr.selection.from, 1, []).doc.toString())
}

// 场景 C：连续两个 image
console.log('\n===== C: 连续两个 image =====')
{
  const doc0 = schema.node('doc', null, [schema.node('paragraph')])
  let state = EditorState.create({ schema, doc: doc0, selection: TextSelection.create(doc0, 1) })
  let tr = insertImageWithTrailingParagraph(state, { src: 'http://a/1.png', kind: 'external' })
  tr = tr.insertText('first')
  tr = tr.split(tr.selection.from, 1, [])
  ok('第一次后 doc', () => tr.doc.toString())
  ok('第一次后 sel', () => tr.selection.from)

  state = state.apply(tr)
  tr = insertImageWithTrailingParagraph(state, { src: 'http://a/2.png', kind: 'external' })
  ok('第二次后 doc', () => tr.doc.toString())
  ok('第二次后 sel', () => tr.selection.from)
  ok('输入 "second"', () => tr.insertText('second').doc.toString())
  ok('Enter', () => tr.split(tr.selection.from, 1, []).doc.toString())
}

// 场景 D：相同 src 重复插入（用 count 区分新旧）
console.log('\n===== D: 相同 src 重复插入 =====')
{
  const doc0 = schema.node('doc', null, [schema.node('paragraph')])
  let state = EditorState.create({ schema, doc: doc0, selection: TextSelection.create(doc0, 1) })
  let tr = insertImageWithTrailingParagraph(state, { src: 'http://a/same.png', kind: 'external' })
  ok('第一次 doc', () => tr.doc.toString())
  ok('sel', () => tr.selection.from)
  // cursor 应在 trailing paragraph 内
  // 假设我们在 trailing paragraph 末尾按 Enter 后插第二个
  tr = tr.insertText('text')
  tr = tr.split(tr.selection.from, 1, [])
  state = state.apply(tr)
  tr = insertImageWithTrailingParagraph(state, { src: 'http://a/same.png', kind: 'external' })
  ok('第二次 doc', () => tr.doc.toString())
  ok('第二次 sel', () => tr.selection.from)
}

// 场景 E：删除后留空段落，再插入（验证 schema 边界情况）
console.log('\n===== E: 图片后删空段落再插入 =====')
{
  const doc0 = schema.node('doc', null, [schema.node('paragraph')])
  let state = EditorState.create({ schema, doc: doc0, selection: TextSelection.create(doc0, 1) })
  let tr = insertImageWithTrailingParagraph(state, { src: 'http://a/x.png', kind: 'external' })
  // 删掉 trailing paragraph
  const $pos = tr.doc.resolve(tr.selection.from)
  const paraStart = $pos.before($pos.depth)
  const paraEnd = $pos.after($pos.depth)
  tr = tr.delete(paraStart, paraEnd)
  ok('删 trailing para 后 doc', () => tr.doc.toString())
  // 现在 doc 是 doc(image)，cursor 在 image 内（NodeSelection）
  // 这就是用户报告的 bug 复现条件
  try {
    const trEnter = tr.split(tr.selection.from, 1, [])
    console.log('✗ Enter 不应该 work 但居然 OK？ doc:', trEnter.doc.toString())
  } catch (e) {
    console.log('✓ 复现 bug：Enter 抛错', e.message)
  }
}