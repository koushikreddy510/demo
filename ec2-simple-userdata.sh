#!/bin/bash
# Simple EC2 User Data script - no ECR dependency

# Log everything
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting simple frontend deployment at $(date)"

# Update system
yum update -y

# Install nginx
yum install -y nginx

# Start nginx
systemctl start nginx
systemctl enable nginx

# Create a simple HTML page that will load our React app
cat > /usr/share/nginx/html/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plivo WebSocket Demo</title>
    <style>
        body { font-family: Inter, system-ui, Arial; margin: 2rem auto; max-width: 720px; }
        .container { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
        input { margin-left: 8px; padding: 4px; }
        button { padding: 6px 12px; }
        .status { color: gray; }
        .connected { color: green; }
        .messages { border: 1px solid #ddd; padding: 12px; border-radius: 8px; min-height: 120px; margin-top: 24px; }
        .message { padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
        .info { margin-top: 24px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <h2>Plivo WebSocket Pub/Sub Demo</h2>
    <div class="container">
        <label>
            Channel:
            <input id="channel" value="general" />
        </label>
        <button id="connectBtn" onclick="connect()">Connect</button>
        <span id="status" class="status">Disconnected</span>
    </div>
    <div style="display: flex; gap: 8px;">
        <input id="messageInput" placeholder="Message" style="flex: 1;" />
        <button onclick="publish()">Publish</button>
    </div>

    <div class="messages">
        <h3>Messages</h3>
        <div id="messagesList">No messages yet.</div>
    </div>
    
    <div class="info">
        Backend: <span id="backendUrl">http://plivo-alb-1680385896.us-east-1.elb.amazonaws.com</span> | 
        WebSocket: <span id="wsUrl">ws://plivo-alb-1680385896.us-east-1.elb.amazonaws.com/ws</span>
    </div>

    <script>
        const API_BASE = 'http://plivo-alb-1680385896.us-east-1.elb.amazonaws.com';
        const WS_URL = 'ws://plivo-alb-1680385896.us-east-1.elb.amazonaws.com/ws';
        
        let ws = null;
        let connected = false;
        let messages = [];

        function updateStatus(status, isConnected = false) {
            const statusEl = document.getElementById('status');
            statusEl.textContent = status;
            statusEl.className = isConnected ? 'connected' : 'status';
            connected = isConnected;
            document.getElementById('connectBtn').textContent = connected ? 'Disconnect' : 'Connect';
        }

        function connect() {
            if (connected) {
                disconnect();
                return;
            }

            const channel = document.getElementById('channel').value;
            ws = new WebSocket(WS_URL);
            
            ws.onopen = () => {
                ws.send(JSON.stringify({ type: 'subscribe', channels: [channel] }));
                updateStatus('Connected', true);
                
                // Load history
                fetch(`${API_BASE}/history/${encodeURIComponent(channel)}?last=50`)
                    .then(r => r.json())
                    .then(data => {
                        messages = (data.items || []).map(i => ({ 
                            ts: i.ts, 
                            channel, 
                            payload: i.message 
                        }));
                        renderMessages();
                    })
                    .catch(() => {});
            };
            
            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.type === 'message') {
                        messages.push({ 
                            ts: Date.now(), 
                            channel: msg.channel, 
                            payload: msg.payload 
                        });
                        renderMessages();
                    }
                } catch {}
            };
            
            ws.onclose = () => {
                updateStatus('Disconnected', false);
                ws = null;
            };
            
            ws.onerror = () => {
                updateStatus('Error', false);
            };
        }

        function disconnect() {
            if (ws) {
                ws.close();
                ws = null;
            }
            updateStatus('Disconnected', false);
        }

        async function publish() {
            const input = document.getElementById('messageInput');
            const channel = document.getElementById('channel').value;
            
            if (!input.value.trim()) return;
            
            try {
                await fetch(`${API_BASE}/publish/${encodeURIComponent(channel)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: input.value })
                });
                input.value = '';
            } catch (e) {
                console.error('Publish failed:', e);
            }
        }

        function renderMessages() {
            const list = document.getElementById('messagesList');
            if (messages.length === 0) {
                list.innerHTML = '<div style="color: #888;">No messages yet.</div>';
                return;
            }
            
            list.innerHTML = messages.map((m, idx) => `
                <div class="message" key="${idx}">
                    <code>[${new Date(m.ts).toLocaleTimeString()}] #${m.channel}</code>: 
                    ${typeof m.payload === 'object' ? JSON.stringify(m.payload) : String(m.payload)}
                </div>
            `).join('');
        }

        // Allow Enter key to publish
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') publish();
        });
    </script>
</body>
</html>
EOF

# Configure nginx
cat > /etc/nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
EOF

# Restart nginx
systemctl restart nginx

echo "Frontend deployment completed at $(date)"
echo "Access at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
