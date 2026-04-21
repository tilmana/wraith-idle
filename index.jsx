/**
 * WraithIdle — Idle & Tab Tracker
 * Tracks tab visibility, focus/blur, and mouse inactivity.
 */

import { useState, useMemo } from 'react'
import { Panel, StatCard, DataTable, Button } from '@framework/ui'

var IDLE_TIMEOUT = 30000 // 30s without mouse movement = idle

function fmt(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function duration(ms) {
  if (!ms || ms < 0) return '—'
  var s = Math.floor(ms / 1000)
  if (s < 60) return s + 's'
  var m = Math.floor(s / 60)
  if (m < 60) return m + 'm ' + (s % 60) + 's'
  var h = Math.floor(m / 60)
  return h + 'h ' + (m % 60) + 'm'
}

function exportJSON(events, session) {
  var data = {
    sessionId: session.id,
    url: session.meta.url,
    exportedAt: new Date().toISOString(),
    events: events.map(function(e) {
      return { type: e.type, payload: e.payload, time: new Date(e.timestamp).toISOString() }
    }),
  }
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  var url = URL.createObjectURL(blob)
  var a = document.createElement('a')
  a.href = url; a.download = 'wraith-idle-' + Date.now() + '.json'; a.click()
  URL.revokeObjectURL(url)
}

function exportCSV(events) {
  var header = 'type,detail,timestamp,time'
  var rows = events.map(function(e) {
    var detail = ''
    if (e.type === 'visibilitychange') detail = e.payload.state
    else if (e.type === 'focus' || e.type === 'blur') detail = e.type
    else if (e.type === 'idle-change') detail = e.payload.idle ? 'idle' : 'active'
    return e.type + ',' + detail + ',' + e.timestamp + ',"' + fmt(e.timestamp) + '"'
  })
  var csv = [header].concat(rows).join('\n')
  var blob = new Blob([csv], { type: 'text/csv' })
  var url = URL.createObjectURL(blob)
  var a = document.createElement('a')
  a.href = url; a.download = 'wraith-idle-' + Date.now() + '.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default {
  id:          'wraith-idle',
  name:        'Idle & Tab Tracker',
  version:     '1.0.0',
  author:      'tilmana',
  date:        '2026-04-21',
  description: 'Tracks tab visibility, window focus/blur, and mouse inactivity to determine when the user is actively on the page.',
  permissions: ['activity_tracking'],

  capture: {
    events: [
      {
        event:   'visibilitychange',
        persist: true,
        payload: function() {
          return { state: document.visibilityState, t: Date.now() }
        },
      },
      {
        event:   'focus',
        persist: true,
        payload: function() { return { t: Date.now() } },
      },
      {
        event:   'blur',
        persist: true,
        payload: function() { return { t: Date.now() } },
      },
      {
        // Mousemove resets idle timer — ephemeral, drives live state only
        event:    'mousemove',
        throttle: 5000,
        persist:  false,
        payload:  function() { return { t: Date.now() } },
      },
    ],
    poll: [
      {
        // Idle detection: fires every 5s, checks if last activity > threshold
        id:       'idle-check',
        interval: 5000,
        persist:  true,
        collect:  function() {
          var w = window
          if (!w.__wraith_idle) {
            w.__wraith_idle = { lastActivity: Date.now(), wasIdle: false }
            // Track mousemove/keydown/scroll to update lastActivity
            var update = function() { w.__wraith_idle.lastActivity = Date.now() }
            w.addEventListener('mousemove', update, { passive: true })
            w.addEventListener('keydown',   update, { passive: true })
            w.addEventListener('scroll',    update, { passive: true })
            return null
          }
          var elapsed = Date.now() - w.__wraith_idle.lastActivity
          var isIdle = elapsed > 30000
          if (isIdle !== w.__wraith_idle.wasIdle) {
            w.__wraith_idle.wasIdle = isIdle
            return { idle: isIdle, elapsed: elapsed, t: Date.now() }
          }
          return null
        },
      },
    ],
  },

  live: function(state, event) {
    var s = state || { visible: true, focused: true, idle: false, lastActivity: null, changes: 0 }
    if (event.type === 'visibilitychange') {
      return Object.assign({}, s, {
        visible: event.payload.state === 'visible',
        lastActivity: event.payload.t,
        changes: s.changes + 1,
      })
    }
    if (event.type === 'focus') {
      return Object.assign({}, s, { focused: true, lastActivity: event.payload.t, changes: s.changes + 1 })
    }
    if (event.type === 'blur') {
      return Object.assign({}, s, { focused: false, lastActivity: event.payload.t, changes: s.changes + 1 })
    }
    if (event.type === 'mousemove') {
      return Object.assign({}, s, { idle: false, lastActivity: event.payload.t })
    }
    if (event.type === 'idle-check' && event.payload) {
      return Object.assign({}, s, { idle: event.payload.idle, lastActivity: event.payload.t })
    }
    return s
  },

  ui: {
    nav: { label: 'Idle Tracker', icon: 'eye' },

    panel: function({ live }) {
      var visible = live.visible !== false
      var focused = live.focused !== false
      var idle    = live.idle === true

      var status = idle ? 'Idle' : (visible && focused ? 'Active' : (visible ? 'Unfocused' : 'Hidden'))
      var color  = idle ? 'text-yellow-400' : (visible && focused ? 'text-green-400' : 'text-muted')

      return (
        <Panel title="Idle & Tab Tracker">
          <StatCard label="Status" value={<span className={color}>{status}</span>} />
          <StatCard label="Tab" value={visible ? 'Visible' : 'Hidden'} />
          <StatCard label="Window" value={focused ? 'Focused' : 'Blurred'} />
          <StatCard label="State changes" value={live.changes || 0} />
        </Panel>
      )
    },

    view: function({ data, session }) {
      var events = (data.events || []).sort(function(a, b) { return a.timestamp - b.timestamp })

      // Build timeline of state transitions
      var timeline = useMemo(function() {
        var items = []
        for (var i = 0; i < events.length; i++) {
          var e = events[i]
          var entry = { type: e.type, timestamp: e.timestamp }
          if (e.type === 'visibilitychange') {
            entry.detail = e.payload.state === 'visible' ? 'Tab visible' : 'Tab hidden'
            entry.color = e.payload.state === 'visible' ? '#4ade80' : '#f59e0b'
          } else if (e.type === 'focus') {
            entry.detail = 'Window focused'
            entry.color = '#4ade80'
          } else if (e.type === 'blur') {
            entry.detail = 'Window blurred'
            entry.color = '#f59e0b'
          } else if (e.type === 'idle-check' && e.payload) {
            entry.detail = e.payload.idle ? 'User idle (' + Math.round(e.payload.elapsed / 1000) + 's)' : 'User active'
            entry.color = e.payload.idle ? '#ef4444' : '#4ade80'
          } else {
            continue
          }
          items.push(entry)
        }
        return items
      }, [events.length])

      // Compute time spent in each state
      var stats = useMemo(function() {
        var visible = 0, hidden = 0, focused = 0, blurred = 0, idle = 0, active = 0
        var visState = true, focState = true, idleState = false
        var visT = events.length > 0 ? events[0].timestamp : 0
        var focT = visT, idleT = visT

        for (var i = 0; i < events.length; i++) {
          var e = events[i]
          if (e.type === 'visibilitychange') {
            var dt = e.timestamp - visT
            if (visState) visible += dt; else hidden += dt
            visState = e.payload.state === 'visible'
            visT = e.timestamp
          } else if (e.type === 'focus' || e.type === 'blur') {
            var dt2 = e.timestamp - focT
            if (focState) focused += dt2; else blurred += dt2
            focState = e.type === 'focus'
            focT = e.timestamp
          } else if (e.type === 'idle-check' && e.payload) {
            var dt3 = e.timestamp - idleT
            if (idleState) idle += dt3; else active += dt3
            idleState = e.payload.idle
            idleT = e.timestamp
          }
        }
        // Add time from last event to now
        var now = Date.now()
        if (visT) { if (visState) visible += now - visT; else hidden += now - visT }
        if (focT) { if (focState) focused += now - focT; else blurred += now - focT }
        if (idleT) { if (idleState) idle += now - idleT; else active += now - idleT }

        return { visible: visible, hidden: hidden, focused: focused, blurred: blurred, idle: idle, active: active }
      }, [events.length])

      var [filter, setFilter] = useState('all')

      var filtered = filter === 'all' ? timeline : timeline.filter(function(t) {
        if (filter === 'visibility') return t.type === 'visibilitychange'
        if (filter === 'focus') return t.type === 'focus' || t.type === 'blur'
        if (filter === 'idle') return t.type === 'idle-check'
        return true
      })

      return (
        <div className="space-y-6" style={{ maxWidth: 700 }}>
          {/* Stats */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Time breakdown</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded border border-border bg-surface px-3 py-2">
                <p className="text-[10px] text-muted uppercase">Visible</p>
                <p className="text-sm text-green-400 font-mono">{duration(stats.visible)}</p>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2">
                <p className="text-[10px] text-muted uppercase">Hidden</p>
                <p className="text-sm text-yellow-400 font-mono">{duration(stats.hidden)}</p>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2">
                <p className="text-[10px] text-muted uppercase">Idle</p>
                <p className="text-sm text-red-400 font-mono">{duration(stats.idle)}</p>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2">
                <p className="text-[10px] text-muted uppercase">Focused</p>
                <p className="text-sm text-green-400 font-mono">{duration(stats.focused)}</p>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2">
                <p className="text-[10px] text-muted uppercase">Blurred</p>
                <p className="text-sm text-yellow-400 font-mono">{duration(stats.blurred)}</p>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2">
                <p className="text-[10px] text-muted uppercase">Active</p>
                <p className="text-sm text-green-400 font-mono">{duration(stats.active)}</p>
              </div>
            </div>
          </div>

          {/* Filters + Export */}
          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'visibility', 'focus', 'idle'].map(function(f) {
              return (
                <button
                  key={f}
                  onClick={function() { setFilter(f) }}
                  className={'text-xs px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap ' +
                    (filter === f ? 'border-accent text-accent' : 'border-border text-muted hover:text-gray-300')
                  }
                >{f}</button>
              )
            })}
            <span className="text-xs text-muted mx-1">|</span>
            <button
              onClick={function() { exportCSV(events) }}
              className="text-xs px-2 py-1 rounded border border-border text-muted hover:text-gray-200 transition-colors"
            >Export CSV</button>
            <button
              onClick={function() { exportJSON(events, session) }}
              className="text-xs px-2 py-1 rounded border border-border text-muted hover:text-gray-200 transition-colors"
            >Export JSON</button>
          </div>

          {/* Timeline */}
          {filtered.length > 0 ? (
            <div className="rounded border border-border bg-surface overflow-hidden">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted px-3 py-1.5 border-b border-border">
                Event timeline ({filtered.length})
              </p>
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {filtered.map(function(item, i) {
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                      <span style={{ color: item.color }}>{'●'}</span>
                      <span className="text-gray-300 flex-1">{item.detail}</span>
                      <span className="tabular-nums text-muted">{fmt(item.timestamp)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">No events yet.</p>
          )}
        </div>
      )
    },
  },
}
