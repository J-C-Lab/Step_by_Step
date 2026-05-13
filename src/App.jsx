import React, { useState } from 'react'
import { Allotment } from 'allotment'
import Header from './components/Header.jsx'
import Toolbar from './components/Toolbar.jsx'
import CodeEditor from './components/CodeEditor.jsx'
import Visualizer from './components/Visualizer.jsx'
import WatchPanel from './components/WatchPanel.jsx'
import useGraphStore from './store/graphStore.js'
import useThemeStore from './store/themeStore.js'
import useTimelineStore from './store/timelineStore.js'
import * as Controller from './core/InterpreterController.js'

// Inject the store into the controller once at startup
Controller.injectStore(useTimelineStore)

// ─── Template code snippets ───────────────────────────────────────────────

const TEMPLATES = [
  {
    label: '[ ]  Array',
    code: `// Array operations
var arr = [3, 1, 4, 1, 5, 9, 2, 6];

// Access and modify
arr[0] = 10;
arr.push(7);
arr.pop();

// Simple iteration sum
var sum = 0;
for (var i = 0; i < arr.length; i++) {
  sum = sum + arr[i];
}
`,
  },
  {
    label: '⬆  Stack',
    code: `// Stack (LIFO) using array
var stack = [];

stack.push(1);
stack.push(2);
stack.push(3);

var top = stack.pop();   // 3
var next = stack.pop();  // 2
`,
  },
  {
    label: '➡  Queue',
    code: `// Queue (FIFO) using array
var queue = [];

queue.push('a');
queue.push('b');
queue.push('c');

var first = queue.shift();   // 'a'
var second = queue.shift();  // 'b'
`,
  },
  {
    label: '⊞  Matrix',
    code: `// 2D Array (Matrix)
var matrix = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9]
];

// Access element
var center = matrix[1][1];  // 5

// Transpose first row + col
matrix[0][0] = 0;
matrix[2][2] = 0;
`,
  },
  {
    label: '↔  Linked List',
    code: `// Linked List
function ListNode(val, next) {
  this.val = val;
  this.next = next || null;
}

var head = new ListNode(1);
head.next = new ListNode(2);
head.next.next = new ListNode(3);
head.next.next.next = new ListNode(4);

// Traverse
var cur = head;
var sum = 0;
while (cur !== null) {
  sum = sum + cur.val;
  cur = cur.next;
}
`,
  },
  {
    label: '🌲  Binary Tree',
    code: `// Binary Tree
function TreeNode(val) {
  this.val = val;
  this.left = null;
  this.right = null;
}

var root = new TreeNode(4);
root.left = new TreeNode(2);
root.right = new TreeNode(6);
root.left.left = new TreeNode(1);
root.left.right = new TreeNode(3);
root.right.left = new TreeNode(5);
root.right.right = new TreeNode(7);
`,
  },
  {
    label: '◈  Graph (Adj)',
    code: `// Graph as adjacency list (object map)
var graph = {
  A: ['B', 'C'],
  B: ['A', 'D', 'E'],
  C: ['A', 'F'],
  D: ['B'],
  E: ['B', 'F'],
  F: ['C', 'E']
};

// BFS from A
var visited = {};
var queue = ['A'];
var order = [];

while (queue.length > 0) {
  var node = queue.shift();
  if (visited[node]) continue;
  visited[node] = true;
  order.push(node);
  var neighbors = graph[node];
  for (var i = 0; i < neighbors.length; i++) {
    if (!visited[neighbors[i]]) {
      queue.push(neighbors[i]);
    }
  }
}
`,
  },
]

// ─── App ──────────────────────────────────────────────────────────────────

export default function App() {
  const { theme } = useThemeStore()
  const hardReset = useTimelineStore(s => s.hardReset)
  const resetGraph = useGraphStore(s => s.reset)
  const [code, setCode] = useState(TEMPLATES[0].code)
  const [visualizerSession, setVisualizerSession] = useState(0)

  function applyTemplate(tpl) {
    Controller.pause()
    Controller.reset()
    hardReset()
    resetGraph()
    setVisualizerSession(session => session + 1)
    setCode(tpl.code)
  }

  return (
    <div className={`flex flex-col h-screen ${theme.bg} transition-colors duration-300`}>
      <Header />

      {/* Main split area */}
      <div className="flex-1 min-h-0 p-2 pt-2">
        <Allotment defaultSizes={[50, 50]} separator>
          {/* LEFT: Toolbar + Templates + Monaco */}
          <Allotment.Pane minSize={280}>
            <div className={`
              flex flex-col h-full rounded-2xl overflow-hidden
              ${theme.panelBg}
            `}>
              <Toolbar code={code} onLoadCode={setCode} />
              <TemplateBar templates={TEMPLATES} onSelect={applyTemplate} theme={theme} />
              <CodeEditor code={code} onChange={setCode} />
            </div>
          </Allotment.Pane>

          {/* RIGHT: Visualizer (top) + WatchPanel (bottom) */}
          <Allotment.Pane minSize={260}>
            <div className="flex flex-col h-full min-h-0 gap-2">
              <div className="flex-1 min-h-0">
                <Allotment vertical defaultSizes={[55, 45]} separator>
                {/* Top: Visualizer */}
                <Allotment.Pane minSize={120}>
                  <div className="h-full min-h-0 p-0.5 pr-0.5 pb-0">
                    <Visualizer key={visualizerSession} />
                  </div>
                </Allotment.Pane>

                {/* Bottom: Watch Panel */}
                <Allotment.Pane minSize={100}>
                  <div className="h-full min-h-0 p-0.5 pt-0">
                    <WatchPanel />
                  </div>
                </Allotment.Pane>
                </Allotment>
              </div>
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  )
}

// ─── Template bar ─────────────────────────────────────────────────────────

function TemplateBar({ templates, onSelect, theme }) {
  const [active, setActive] = useState(0)

  function pick(i) {
    setActive(i)
    onSelect(templates[i])
  }

  return (
    <div className={`
      flex items-center gap-1.5 px-3 py-1.5 shrink-0 overflow-x-auto
      ${theme.sidebarBg} mx-3 mb-1 rounded-xl
    `} style={{ scrollbarWidth: 'none' }}>
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${theme.subText} shrink-0 mr-1 select-none`}>
        Templates
      </span>
      {templates.map((tpl, i) => (
        <button
          key={i}
          onClick={() => pick(i)}
          className={`
            shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium
            transition-all duration-150 active:scale-95 select-none whitespace-nowrap
            ${active === i
              ? `${theme.btnActive}`
              : `${theme.btnBase}`}
          `}
        >
          {tpl.label}
        </button>
      ))}
    </div>
  )
}
