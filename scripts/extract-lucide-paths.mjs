// 一次性脚本：从 lucide-react 包提取每个 icon 的 SVG 路径数据（__iconNode），
// 同时解析主入口的 export 语句，把每个组件名（PascalCase）映射到对应的 __iconNode。
// 输出 src/lib/lucide-paths.json，供 server-side 使用。
//
// 运行方式：node scripts/extract-lucide-paths.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const iconsDir = path.resolve('node_modules/lucide-react/dist/esm/icons')
const mainFile = path.resolve('node_modules/lucide-react/dist/esm/lucide-react.mjs')
const outFile = path.resolve('src/lib/lucide-paths.json')

// 0. 我们实际支持的 icon 名（来自 src/lib/lucide-icons.tsx 的 ICON_COMPONENTS key）
// 只导出这些以缩小产物体积；用户也只能从这些里选
const SUPPORTED = [
  "Home","Search","Settings","User","Users","Bell","Mail","Calendar","Clock","Heart","Star","Bookmark","Tag","Flag","File","FileText","Folder","FolderOpen","FolderPlus","FilePlus","Download","Upload","Save","Copy","Clipboard","Paperclip","Edit","Edit2","Edit3","Pencil","Trash","Trash2","Plus","Minus","X","Check","ArrowRight","ArrowLeft","ArrowUp","ArrowDown","ChevronRight","ChevronLeft","ChevronUp","ChevronDown","ChevronsRight","ChevronsLeft","ChevronsUp","ChevronsDown","Play","Pause","Square","Image","Camera","Video","Music","Mic","Volume2","MessageCircle","MessageSquare","Phone","Send","Share","AtSign","Hash","Menu","MoreHorizontal","MoreVertical","Grid","List","Filter","Sliders","Eye","EyeOff","Lock","Unlock","Inbox","Archive","Pin","Link","BarChart3","PieChart","TrendingUp","TrendingDown","Database","Server","Cloud","ListChecks","Monitor","Smartphone","Laptop","Wifi","Bluetooth","Wrench","Hammer","Scissors","Compass","Map","MapPin","Globe","Sun","Moon","CloudRain","Zap","Coffee","Book","BookOpen","Briefcase","Gift","ShoppingCart","CreditCard","DollarSign","Award","Trophy","Target","Rocket","Lightbulb","Type","Heading","CalendarDays","CalendarCheck","Code","Terminal","GitBranch","GitCommit","GitMerge","GitPullRequest",
]

// 1. 解析主入口，建立 PascalCase 组件名 → file basename 的映射
const mainContent = await readFile(mainFile, 'utf-8')
const re = /export\s*\{([^}]+)\}\s*from\s*'\.\/icons\/([^']+)'/g
const nameToFile = {}
let m
while ((m = re.exec(mainContent)) !== null) {
  const [, namesStr, file] = m
  const basename = file.replace('.mjs', '')
  for (const part of namesStr.split(',')) {
    const asMatch = /\bas\s+(\w+)/.exec(part)
    if (asMatch) nameToFile[asMatch[1]] = basename
  }
}

// 2. 只为 SUPPORTED 里的组件提取 __iconNode
const paths = {}
let fileCount = 0
for (const name of SUPPORTED) {
  const basename = nameToFile[name]
  if (!basename || paths[basename]) {
    if (paths[basename]) paths[name] = paths[basename]
    continue
  }
  const fullPath = path.join(iconsDir, `${basename}.mjs`)
  let mod
  try {
    mod = await import(pathToFileURL(fullPath).href)
  } catch {
    continue
  }
  if (Array.isArray(mod.__iconNode)) {
    paths[basename] = mod.__iconNode
    paths[name] = mod.__iconNode
    fileCount++
  }
}

await writeFile(outFile, JSON.stringify(paths))
console.log(`提取了 ${fileCount} 个 icon（SUPPORTED 共 ${SUPPORTED.length} 个）`)