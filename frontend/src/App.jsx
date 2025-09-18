import React, { useRef, useState } from 'react'

// Force HTTP for demo - prevent HTTPS redirects
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '').replace('https://', 'http://')
const WS_URL = API_BASE.replace('http://', 'ws://').replace('https://', 'ws://') + '/ws'

export default function App() {
  const [channel, setChannel] = useState('general')
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const wsRef = useRef(null)

  const connect = () => {
    if (connected) return
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', channels: [channel] }))
      setConnected(true)
      fetch(`${API_BASE}/history/${encodeURIComponent(channel)}?last=50`)
        .then((r) => r.json())
        .then((data) => {
          const items = (data.items || []).map((i) => ({ ts: i.ts, channel, payload: i.message }))
          setMessages(items)
        })
        .catch(() => { })
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'message') {
          setMessages((prev) => [...prev, { ts: Date.now(), channel: msg.channel, payload: msg.payload }])
        }
      } catch { }
    }
    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }
    ws.onerror = () => { }
  }

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
  }

  const publish = async () => {
    if (!input.trim()) return
    try {
      await fetch(`${API_BASE}/publish/${encodeURIComponent(channel)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input })
      })
      setInput('')
    } catch (e) { }
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, Arial', margin: '2rem auto', maxWidth: 720 }}>
      <h2>Plivo WebSocket Pub/Sub Demo</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>
          Channel:
          <input value={channel} onChange={(e) => setChannel(e.target.value)} style={{ marginLeft: 8 }} />
        </label>
        {!connected ? (
          <button onClick={connect}>Connect</button>
        ) : (
          <button onClick={disconnect}>Disconnect</button>
        )}
        <span style={{ color: connected ? 'green' : 'gray' }}>{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <button onClick={publish}>Publish</button>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Messages</h3>
        <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, minHeight: 120 }}>
          {messages.length === 0 && <div style={{ color: '#888' }}>No messages yet.</div>}
          {messages.map((m, idx) => (
            <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <code>[{new Date(m.ts).toLocaleTimeString()}] #{m.channel}</code>: {typeof m.payload === 'object' ? JSON.stringify(m.payload) : String(m.payload)}
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 24, color: '#666', fontSize: 12 }}>
        Backend: {API_BASE} | WebSocket: {WS_URL}
      </div>
    </div>
  )
}


