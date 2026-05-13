import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import useHistoryStore from '../store/historyStore.js'

/** Format ISO date string → "5月13日 15:30" */
function fmtDate(iso) {
  try {
    const d = new Date(iso)
    const mo  = d.getMonth() + 1
    const day = d.getDate()
    const hh  = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${mo}月${day}日 ${hh}:${min}`
  } catch {
    return ''
  }
}

/** First non-empty line of code, truncated. */
function codePreview(code) {
  const line = (code || '').split('\n').find(l => l.trim() && !l.trim().startsWith('//'))
  return (line || '').trim().slice(0, 60)
}

export default function HistoryPanel({ onLoadCode, onClose, theme }) {
  const { items, renameRecord, deleteRecord } = useHistoryStore()
  const [search, setSearch]     = useState('')
  const [editId, setEditId]     = useState(null)
  const [editName, setEditName] = useState('')
  const searchRef = useRef(null)

  // Focus search on mount
  useEffect(() => { searchRef.current?.focus() }, [])

  const filtered = search.trim()
    ? items.filter(it =>
        it.name.toLowerCase().includes(search.toLowerCase()) ||
        it.code.toLowerCase().includes(search.toLowerCase())
      )
    : items

  function startEdit(it, e) {
    e.stopPropagation()
    setEditId(it.id)
    setEditName(it.name)
  }

  function commitEdit(id) {
    if (editName.trim()) renameRecord(id, editName)
    setEditId(null)
  }

  function handleDelete(id, e) {
    e.stopPropagation()
    deleteRecord(id)
  }

  // Light theme detection based on theme id
  const isLight = theme?.id === 'cupertino'
  const panelBg   = isLight ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.97)'
  const borderClr = isLight ? 'rgba(0,0,0,0.08)'       : 'rgba(255,255,255,0.10)'
  const textClr   = isLight ? '#1f2937'                 : '#e2e8f0'
  const mutedClr  = isLight ? '#6b7280'                 : '#94a3b8'
  const itemBg    = isLight ? 'rgba(0,0,0,0.03)'        : 'rgba(255,255,255,0.04)'
  const itemHover = isLight ? 'rgba(59,130,246,0.08)'   : 'rgba(255,255,255,0.08)'
  const inputBg   = isLight ? 'rgba(0,0,0,0.05)'        : 'rgba(255,255,255,0.07)'
  const divClr    = isLight ? 'rgba(0,0,0,0.06)'        : 'rgba(255,255,255,0.06)'

  const panel = (
    <>
      {/* Backdrop — rendered in body so backdrop-filter ancestors can't trap it */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 8000 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 64,
          right: 16,
          width: 420,
          maxHeight: 'calc(100vh - 80px)',
          zIndex: 8001,
          display: 'flex',
          flexDirection: 'column',
          background: panelBg,
          border: `1px solid ${borderClr}`,
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          backdropFilter: 'blur(24px)',
          overflow: 'hidden',
          fontFamily: 'system-ui, sans-serif',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${divClr}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: textClr }}>历史记录</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: mutedClr, fontSize: 18, lineHeight: 1, padding: '2px 4px',
            }}
            title="关闭"
          >✕</button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: mutedClr, fontSize: 13, pointerEvents: 'none',
            }}>🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索代码或名称..."
              style={{
                width: '100%', boxSizing: 'border-box',
                background: inputBg,
                border: `1px solid ${borderClr}`,
                borderRadius: 10,
                padding: '7px 10px 7px 30px',
                fontSize: 13,
                color: textClr,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Count hint */}
        <div style={{ padding: '0 16px 6px', fontSize: 11, color: mutedClr, flexShrink: 0 }}>
          {filtered.length} 条记录{items.length >= 100 ? '（已达上限 100 条）' : ''}
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 8px 8px' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: mutedClr, fontSize: 13, padding: '32px 0' }}>
              {search ? '无匹配结果' : '暂无历史记录'}
            </div>
          )}

          {filtered.map(it => (
            <HistoryItem
              key={it.id}
              item={it}
              isEditing={editId === it.id}
              editName={editName}
              onEditNameChange={setEditName}
              onStartEdit={startEdit}
              onCommitEdit={commitEdit}
              onDelete={handleDelete}
              onLoad={() => { onLoadCode(it.code); onClose() }}
              itemBg={itemBg}
              itemHover={itemHover}
              textClr={textClr}
              mutedClr={mutedClr}
              borderClr={borderClr}
            />
          ))}
        </div>
      </div>
    </>
  )

  return createPortal(panel, document.body)
}

function HistoryItem({
  item, isEditing, editName, onEditNameChange, onStartEdit, onCommitEdit,
  onDelete, onLoad, itemBg, itemHover, textClr, mutedClr, borderClr,
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onLoad}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? itemHover : itemBg,
        border: `1px solid ${borderClr}`,
        borderRadius: 10,
        padding: '10px 12px',
        marginBottom: 6,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {isEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={e => onEditNameChange(e.target.value)}
            onBlur={() => onCommitEdit(item.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') onCommitEdit(item.id)
              if (e.key === 'Escape') onCommitEdit(item.id)
              e.stopPropagation()
            }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: `1px solid ${mutedClr}`,
              color: textClr, fontSize: 13, fontWeight: 600,
              outline: 'none', padding: '1px 0',
            }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: textClr }}>{item.name}</span>
        )}

        <span style={{ fontSize: 10, color: mutedClr, whiteSpace: 'nowrap' }}>
          {fmtDate(item.createdAt)}
        </span>

        {/* Edit button */}
        <button
          onClick={e => onStartEdit(item, e)}
          title="重命名"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: mutedClr, fontSize: 13, padding: '1px 3px', lineHeight: 1,
            opacity: hovered ? 1 : 0.4,
            transition: 'opacity 0.15s',
          }}
        >✎</button>

        {/* Delete button */}
        <button
          onClick={e => onDelete(item.id, e)}
          title="删除"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#ef4444', fontSize: 13, padding: '1px 3px', lineHeight: 1,
            opacity: hovered ? 1 : 0.3,
            transition: 'opacity 0.15s',
          }}
        >🗑</button>
      </div>

      {/* Code preview */}
      <div style={{
        fontSize: 11, color: mutedClr, fontFamily: 'monospace',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {codePreview(item.code)}
      </div>
    </div>
  )
}
