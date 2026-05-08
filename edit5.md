# edit5.md —— 代码可视化适配助手（Code Visualize Prep）

## 核心痛点

当前用户可以在左侧 Monaco 代码区自由输入 JavaScript 算法，但很多“正常算法代码”并不一定能被本项目的执行沙盒和可视化系统稳定解析、执行、分步展示。

典型问题包括：

1. 用户不知道当前沙盒支持哪些 JavaScript 语法。
2. 用户写了算法片段，但没有写成可执行的完整脚本。
3. 用户使用了 `return`，但代码不在函数体内，导致解释器无法正常执行。
4. 用户写了 `let/const`、箭头函数、现代语法等，可能与当前 `js-interpreter` 或转换链存在兼容问题。
5. 用户忘记初始化变量，或者初始化方式不适合当前可视化捕获逻辑。
6. 用户不知道为什么右侧 Watch/ReactFlow 没有预期显示。

目标：在左侧代码区右下角新增一个“代码可视化适配”按钮，帮助用户把输入的算法片段整理成项目可执行、可分步、可观察的数据结构代码。

---

## 示例问题

用户输入：

```javascript
var n = 5;
var dp = new Array(n).fill(0);
dp[0] = 1;
dp[1] = 1;
for(let i = 2; i < n; i++){
  dp[i] = dp[i - 1] + dp[i - 2];
}
return dp[n];
```

这段代码的问题：

1. 顶层 `return` 不合法，除非被包在函数中。
2. `let` 与当前执行环境可能存在兼容风险，优先转换为 `var`。
3. `return dp[n]` 还有数组越界问题，`n = 5` 时最后一个有效下标是 `4`。
4. 如果目标是观察 DP 数组变化，应该保留 `dp`、`i`、`result` 等变量在全局可捕获范围内。

适配后可变为：

```javascript
var n = 5;
var dp = new Array(n).fill(0);

dp[0] = 1;
dp[1] = 1;

for (var i = 2; i < n; i++) {
  dp[i] = dp[i - 1] + dp[i - 2];
}

var result = dp[n - 1];
```

这样右侧可视化可以看到：

- `n`
- `dp`
- `i`
- `result`
- 每一步 `dp` 的增量变化

---

## 功能位置

在左侧代码编辑区右下角新增按钮：

- 推荐名称：`Prep` / `适配可视化` / `Fix for Visualizer`
- 位置：`CodeEditor` 容器右下角，悬浮于 Monaco 编辑器上方。
- 样式：小型胶囊按钮，跟随主题色；不要遮挡正文太多。

按钮职责：

1. 读取当前编辑器代码。
2. 分析是否存在常见不可执行/不可视化问题。
3. 给出自动修改后的代码。
4. 将修改后的代码写回编辑器。
5. 可选：弹出简短说明，告诉用户改了什么。

---

## 严格约束

1. 不引入后端服务。
2. 不引入外部 AI API。
3. 不改变当前解释器执行流程。
4. 不改变 `TimelineStore`、`Adapter`、`VisualizerView` 的核心数据流。
5. 不替用户“重写算法思想”，只做可执行性与可视化适配。
6. 所有自动修改必须是可解释、可回退、低风险的。

---

## 第一阶段：规则化适配（MVP）

先实现一组明确规则，不做复杂语义推理。

### 规则 1：顶层 `return` 转 result

如果检测到顶层：

```javascript
return expression;
```

改为：

```javascript
var result = expression;
```

说明：

- 顶层 `return` 在脚本环境中不合法。
- `result` 作为全局变量可以被 Watch 和可视化系统捕获。

### 规则 2：`let` / `const` 转 `var`

将：

```javascript
let i = 0;
const n = 5;
```

转换为：

```javascript
var i = 0;
var n = 5;
```

说明：

- 当前沙盒更适合 ES5 风格代码。
- 可降低 `js-interpreter` 兼容风险。

### 规则 3：格式化基础代码风格

对常见格式做轻量修正：

- `for(let i=0;i<n;i++){` → `for (var i = 0; i < n; i++) {`
- 补齐运算符两侧空格
- 花括号前补空格
- 保持语句分号

注意：

- MVP 不需要做完整 AST format。
- 如果后续需要，可再引入 Prettier 或基于 Babel AST 格式化。

### 规则 4：数组越界风险提示

识别类似：

```javascript
var n = 5;
var dp = new Array(n).fill(0);
return dp[n];
```

提示或修正为：

```javascript
var result = dp[n - 1];
```

说明：

- 该规则只在明显模式下触发。
- 如果无法确定，不自动修改，只提示用户。

### 规则 5：保留关键中间变量

如果用户写了函数包裹算法，例如：

```javascript
function fib(n) {
  var dp = new Array(n).fill(0);
  return dp[n - 1];
}

fib(5);
```

可以建议改为：

```javascript
var n = 5;
var dp = new Array(n).fill(0);
// ...
var result = dp[n - 1];
```

原因：

- 当前 Watch 更容易展示全局变量。
- 对教学可视化来说，全局 `dp` 比函数局部变量更直观。

MVP 阶段可只给提示，不强制自动展开函数。

---

## 第二阶段：诊断提示面板

点击按钮后，如果代码被修改，显示简短说明：

```text
已适配为可视化脚本：
- 将顶层 return 改为 var result
- 将 let/const 改为 var
- 修正 dp[n] 为 dp[n - 1]
```

如果无法安全自动修改，则显示：

```text
发现可能影响可视化的问题：
- 顶层 return 无法在脚本环境执行
- 建议保留关键数据结构为全局变量，例如 dp、stack、queue、root
```

---

## 第三阶段：可视化友好模板生成

未来可扩展为：

1. 用户输入一段算法。
2. 点击按钮。
3. 系统生成一个更适合可视化的版本：
   - 初始化变量；
   - 暴露关键数据结构；
   - 增加 `result`；
   - 使用 ES5 语法；
   - 保留原算法逻辑。

例如：

```javascript
// 原始目标：Fibonacci DP
var n = 5;
var dp = new Array(n).fill(0);

dp[0] = 1;
dp[1] = 1;

for (var i = 2; i < n; i++) {
  dp[i] = dp[i - 1] + dp[i - 2];
}

var result = dp[n - 1];
```

---

## 建议修改文件

### `src/components/CodeEditor.jsx`

新增右下角悬浮按钮。

职责：

- 接收当前 `code`
- 点击后调用适配函数
- 将适配后的代码通过 `onChange(nextCode)` 写回

### `src/utils/codePrep.js`（新增）

新增纯函数：

```javascript
export function prepareCodeForVisualization(code) {
  return {
    code: nextCode,
    messages: [
      '将顶层 return 改为 var result',
      '将 let/const 改为 var',
    ],
  }
}
```

要求：

- 无 React 依赖
- 易测试
- 所有规则集中在这里

### `src/components/PrepToast.jsx`（可选）

用于显示适配说明。

MVP 也可以先用轻量 DOM toast 或在按钮旁显示短提示。

---

## 验证用例

### 用例 1：DP 顶层 return

输入：

```javascript
var n = 5;
var dp = new Array(n).fill(0);
dp[0] = 1;
dp[1] = 1;
for(let i = 2; i < n; i++){
  dp[i] = dp[i - 1] + dp[i - 2];
}
return dp[n];
```

期望输出：

```javascript
var n = 5;
var dp = new Array(n).fill(0);
dp[0] = 1;
dp[1] = 1;
for (var i = 2; i < n; i++) {
  dp[i] = dp[i - 1] + dp[i - 2];
}
var result = dp[n - 1];
```

### 用例 2：普通数组

输入：

```javascript
const arr=[1,2,3];let sum=0;for(let i=0;i<arr.length;i++){sum+=arr[i]}return sum;
```

期望：

- `const/let` 转 `var`
- 顶层 `return sum;` 转 `var result = sum;`
- 代码格式变得更易读

### 用例 3：无需修改

输入：

```javascript
var stack = [];
stack.push(1);
stack.push(2);
var top = stack.pop();
```

期望：

- 代码保持不变或只做轻量格式化。
- 提示：`代码已适合可视化`。

---

## 执行指令（给后续实现）

1. 新增 `src/utils/codePrep.js`，实现 `prepareCodeForVisualization(code)`。
2. 修改 `src/components/CodeEditor.jsx`，在右下角增加 `适配可视化` 按钮。
3. 点击按钮后：
   - 调用 `prepareCodeForVisualization(code)`；
   - 写回新代码；
   - 显示修改说明。
4. 添加至少 3 个手动验证用例：
   - DP 顶层 return；
   - const/let + 压缩代码；
   - 已可视化代码。
5. 不改变现有 Run/Step/Reset 执行链路。
