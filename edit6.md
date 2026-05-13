# edit6.md — 新功能设计文档

> 创建日期：2026-05-13  
> 状态：设计中，待实现

---

## 功能一：运行历史记录

### 目标

让用户能快速找回曾经运行过的算法代码，避免重复输入。

### 交互设计

#### 按钮位置

在顶部工具栏（Toolbar）的**当前状态徽章（Paused / Running / Finished）左侧**，插入一个历史记录图标按钮：

```
[ Resume ] [ Step ] [ Over ] [ Out ] [ End ] [ Reset ] [ Stop ]   🕐   • Paused
                                                                  ↑
                                                            历史记录按钮
```

- 图标：时钟图标（`🕐` 或 lucide-react 的 `History` / `ClockCounterClockwise`）
- 尺寸：与其他工具栏按钮等高，宽度与图标匹配，圆形或胶囊形
- Tooltip：鼠标悬浮时显示"历史记录"

#### 弹窗（Modal / Popover）

点击按钮后，弹出一个**浮动面板**（不遮挡整个页面，定位于按钮正下方或屏幕右侧抽屉）：

```
┌─────────────────────────────────────────────┐
│  历史记录                            [✕ 关闭] │
├─────────────────────────────────────────────┤
│  🔍 搜索代码...                              │
├─────────────────────────────────────────────┤
│  ① 斐波那契 DP                    2026-05-13 │
│     var dp = []; dp[0] = 1; dp[1] = 1;...   │
│                                   [✎] [🗑] │
├─────────────────────────────────────────────┤
│  ② uniquePaths                    2026-05-12 │
│     var uniquePaths = function(m, n) {...    │
│                                   [✎] [🗑] │
├─────────────────────────────────────────────┤
│  ③ minPathSum                     2026-05-12 │
│     var minPathSum = function(grid) {...     │
│                                   [✎] [🗑] │
└─────────────────────────────────────────────┘
```

**弹窗元素：**

| 区域 | 说明 |
|------|------|
| 顶部标题栏 | "历史记录" + 关闭按钮 |
| 搜索栏 | 输入框，实时模糊搜索（匹配名称 + 代码内容） |
| 内容列表 | 最多保存 100 条，按时间倒序排列 |
| 每条记录 | 显示名称（加粗）+ 日期 + 代码预览（首行，超出省略）|
| 编辑名称按钮（✎） | 点击后名称变为可编辑 input，按 Enter 或失焦保存 |
| 删除按钮（🗑） | 点击后弹出二次确认，确认后删除该条记录 |

**点击某条记录：** 整条记录代码立即填充左侧代码编辑器，弹窗自动关闭。

### 数据存储

- 使用 `localStorage`，key 为 `step_by_step_run_history`
- 数据格式：

```json
[
  {
    "id": "uuid-xxx",
    "name": "斐波那契 DP",
    "code": "var dp = [...",
    "createdAt": "2026-05-13T15:00:00.000Z"
  }
]
```

- 上限 100 条：超出时删除最旧的一条
- 名称自动生成规则（按优先级）：
  1. 识别顶层函数名（`var funcName = function`），使用函数名
  2. 识别首行注释内容
  3. 回退到 `算法_MMDD_HHmm`（如 `算法_0513_1530`）

### 触发时机

**每次点击 Resume / 运行（init）时**，将当前代码快照追加到历史记录。如果代码与最近一条完全相同，不重复记录。

### 涉及文件（预估）

| 文件 | 变更类型 |
|------|---------|
| `src/store/historyStore.js` | 新建，Zustand store + localStorage 持久化 |
| `src/components/HistoryPanel.jsx` | 新建，历史记录弹窗组件 |
| `src/components/Toolbar.jsx` | 修改，添加历史按钮 + 触发保存逻辑 |
| `src/components/CodeEditor.jsx` | 修改，暴露 `onLoadCode` 回调用于填充代码 |
| `src/App.jsx` | 修改，连接 `historyStore` 与 `CodeEditor` |

---

## 功能二：Step Over / Step Out 实现

### 当前状态

工具栏中：
- ✅ **Step（单步进入）**：每次前进一个源代码行，遇函数调用会进入函数内部。已可用。
- ❌ **Step Over（跨步）**：跳过当前行的函数调用，执行完整个调用后停在下一行。未实现。
- ❌ **Step Out（跳出）**：执行完当前函数剩余部分，返回到调用处的下一行。未实现。

### 语义说明

```
// 当前代码（▶ 表示当前行）
▶ var result = Math.min(a, b);   // Step → 进入 Math.min 内部（如解释器支持）
                                  // Step Over → 直接执行完，停到下一行
                                  // Step Out → 若在函数内，执行完整个函数后返回调用处
```

| 操作 | 中文说明 | 快捷键（建议） |
|------|---------|---------------|
| Step | **单步进入**：前进一行，遇函数调用则进入 | F11 |
| Step Over | **单步跨过**：前进一行，函数调用作为整体执行 | F10 |
| Step Out | **跳出函数**：执行完当前函数后返回调用处 | Shift+F11 |

### 实现方案（`InterpreterController.js`）

#### Step Over

记录当前调用栈深度（`callDepth`），持续执行内部步骤，直到：
- 调用栈深度 ≤ 进入时的深度，**且**
- 源代码行号发生变化

```javascript
export function stepOver() {
  if (!_interpreter) return false
  const startDepth = getCallDepth(_interpreter)
  const startLine  = getCurrentLine(_interpreter)
  let hasMore = true

  try {
    let inner = 0
    while (inner < MAX_AST_STEPS * 10) {
      hasMore = _interpreter.step()
      inner++
      if (!hasMore) break
      const depth = getCallDepth(_interpreter)
      const line  = getCurrentLine(_interpreter)
      if (depth <= startDepth && line !== startLine && line != null) break
    }
  } catch (err) {
    console.error('[InterpreterController] stepOver error:', err)
    _storeApi.getState().setStatus('finished')
    return false
  }

  _stepCount++
  const snap = capture(_interpreter, _stepCount)
  _storeApi.getState().pushSnapshot(snap)
  if (!hasMore) _storeApi.getState().setStatus('finished')
  return hasMore
}
```

#### Step Out

记录当前调用栈深度，持续执行，直到调用栈深度 < 进入时的深度：

```javascript
export function stepOut() {
  if (!_interpreter) return false
  const startDepth = getCallDepth(_interpreter)
  let hasMore = true

  try {
    let inner = 0
    while (inner < MAX_AST_STEPS * 20) {
      hasMore = _interpreter.step()
      inner++
      if (!hasMore) break
      const depth = getCallDepth(_interpreter)
      if (depth < startDepth) break
    }
  } catch (err) {
    console.error('[InterpreterController] stepOut error:', err)
    _storeApi.getState().setStatus('finished')
    return false
  }

  _stepCount++
  const snap = capture(_interpreter, _stepCount)
  _storeApi.getState().pushSnapshot(snap)
  if (!hasMore) _storeApi.getState().setStatus('finished')
  return hasMore
}
```

#### 辅助函数 `getCallDepth`

```javascript
function getCallDepth(interp) {
  if (!Array.isArray(interp.stateStack)) return 0
  return interp.stateStack.filter(
    s => s?.node?.type === 'CallExpression' || s?.node?.type === 'FunctionExpression'
  ).length
}
```

### UI 改动

- 工具栏按钮 Over / Out 从禁用样式改为可点击，绑定 `stepOver()` / `stepOut()`
- 鼠标悬浮时 Tooltip 显示：
  - Over：`单步跨过（不进入函数内部）`
  - Out：`跳出当前函数`

### 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `src/core/InterpreterController.js` | 修改，新增 `stepOver`、`stepOut`、`getCallDepth` |
| `src/components/Toolbar.jsx` | 修改，Over/Out 按钮绑定新函数并启用 |

---

## 功能三：面板拖动后可视化内容自适应

### 当前问题

使用 `Allotment` 拖动改变左右（或上下）面板尺寸时，React Flow 画布大小改变，但节点保持原始位置和缩放比例，导致：

- 面板**变大**：节点显得小，大量空白
- 面板**变小**：节点溢出，看不全

### 期望行为

拖动结束后（或拖动过程中），React Flow 自动执行 `fitView`，使当前所有节点**整体适配新的画布尺寸**。

### 实现方案

#### 方案 A：监听 `Allotment` 的 `onChange` 回调（推荐）

`Allotment` 提供 `onChange` 回调，每次拖动时触发并传入各面板当前尺寸数组。

在 `App.jsx` 中：

```jsx
const fitViewTriggerRef = useRef(null)  // 外部可调用的 fitView

<Allotment
  onChange={() => {
    // 防抖：拖动结束后 150ms 触发 fitView
    clearTimeout(fitViewTriggerRef._timer)
    fitViewTriggerRef._timer = setTimeout(() => {
      fitViewTriggerRef.current?.()
    }, 150)
  }}
>
```

在 `VisualizerView.jsx` 中，通过 `ref` 或 Zustand 暴露 `fitView` 的调用句柄：

```javascript
// 新增：在 VisualizerView 中暴露 fitView 给外部
useImperativeHandle(ref, () => ({
  fitView: () => fitViewRef.current?.({ padding: 0.2, duration: 250 })
}))
```

或更简单地，在 `graphStore` / 全局事件总线中增加一个 `requestFitView` 信号：

```javascript
// graphStore 新增
requestFitView: false,
triggerFitView() { set({ requestFitView: true }) },
clearFitView()   { set({ requestFitView: false }) },
```

`VisualizerView` 监听 `requestFitView`，触发后调用 `fitView` 并 `clearFitView()`。

#### 方案 B：监听容器 `ResizeObserver`

在 `VisualizerView.jsx` 中，对画布容器 `div` 添加 `ResizeObserver`，尺寸变化时触发防抖 `fitView`：

```javascript
useEffect(() => {
  if (!containerRef.current) return
  const ro = new ResizeObserver(() => {
    clearTimeout(roTimerRef.current)
    roTimerRef.current = setTimeout(() => {
      fitViewRef.current?.({ padding: 0.2, duration: 250 })
    }, 150)
  })
  ro.observe(containerRef.current)
  return () => ro.disconnect()
}, [])
```

**推荐方案 B**（ResizeObserver），因为它不依赖 `App.jsx` 知道 `VisualizerView` 的内部状态，解耦更好，且能捕获所有来源的尺寸变化（窗口缩放、面板拖动均有效）。

### 注意事项

- `fitView` 应仅在**有节点时**触发，避免空画布时无意义调用
- 第一次 `didInitialFit` 已有，拖动触发的 `fitView` 独立于初始 fit，不应重置 `didInitialFit`（用户手动缩放的状态会被覆盖，这里取舍为：拖动面板属于"布局变化"，重新 fit 是合理的）
- 防抖延迟建议 `120-200ms`，过短会卡顿，过长有明显滞后

### 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `src/visualizer/VisualizerView.jsx` | 修改，添加 `ResizeObserver` + 防抖 `fitView` |
| `src/App.jsx` | 可选，如果采用方案 A 则需修改 |

---

## 实现优先级建议

| 优先级 | 功能 | 复杂度 | 预估工作量 |
|--------|------|--------|-----------|
| 🔴 高 | 功能三：拖动自适应 | 低 | 30 分钟 |
| 🟡 中 | 功能二：Step Over / Out | 中 | 1-2 小时 |
| 🟢 低 | 功能一：运行历史记录 | 高 | 3-4 小时 |

---

*文档结束*
