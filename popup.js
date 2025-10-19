let currentTabId = null;
let endpoints = [];

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  loadEndpoints();
  document.getElementById('clearBtn').addEventListener('click', clearEndpoints);
  document.getElementById('exportBtn').addEventListener('click', exportEndpoints);
}

function loadEndpoints() {
  chrome.runtime.sendMessage({ type: 'GET_ENDPOINTS', tabId: currentTabId }, (response) => {
    if (response?.endpoints) {
      endpoints = response.endpoints;
      renderEndpoints();
    } else {
      showEmptyState();
    }
  });
}

function renderEndpoints() {
  document.getElementById('loading').style.display = 'none';
  
  if (endpoints.length === 0) {
    showEmptyState();
    return;
  }
  
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('endpointsList').style.display = 'block';
  document.getElementById('endpointCount').textContent = endpoints.length;
  
  const uniqueEndpoints = new Map();
  endpoints.forEach(endpoint => {
    if (!uniqueEndpoints.has(endpoint.url)) {
      uniqueEndpoints.set(endpoint.url, endpoint);
    } else {
      uniqueEndpoints.get(endpoint.url).source += `, ${endpoint.source}`;
    }
  });
  
  const list = document.getElementById('endpointsList');
  list.innerHTML = '';
  uniqueEndpoints.forEach(endpoint => list.appendChild(createEndpointCard(endpoint)));
}

function createEndpointCard(endpoint) {
  const card = document.createElement('div');
  card.className = 'endpoint-card';
  
  const timeAgo = getTimeAgo(endpoint.timestamp);
  
  card.innerHTML = `
    <div class="endpoint-header">
      <span class="endpoint-source">${escapeHtml(endpoint.source)}</span>
      <span class="endpoint-time">${timeAgo}</span>
    </div>
    <div class="endpoint-url">${escapeHtml(endpoint.url)}</div>
    ${renderMetadata(endpoint.metadata)}
    <div class="endpoint-actions">
      <button class="action-btn copy-btn" data-url="${escapeHtml(endpoint.url)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        Copy
      </button>
      <button class="action-btn open-btn" data-url="${escapeHtml(endpoint.url)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
        </svg>
        Open
      </button>
    </div>
  `;
  
  // Add event listeners
  card.querySelector('.copy-btn').addEventListener('click', () => copyToClipboard(endpoint.url));
  card.querySelector('.open-btn').addEventListener('click', () => openUrl(endpoint.url));
  
  return card;
}

function renderMetadata(metadata) {
  if (!metadata || Object.keys(metadata).length === 0) return '';
  
  const tags = [];
  if (metadata.method) tags.push(`<span class="metadata-tag">${escapeHtml(metadata.method)}</span>`);
  if (tags.length === 0) return '';
  
  return `<div class="endpoint-metadata">${tags.join('')}</div>`;
}

function showEmptyState() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('emptyState').style.display = 'flex';
  document.getElementById('endpointsList').style.display = 'none';
  document.getElementById('endpointCount').textContent = '0';
}

function clearEndpoints() {
  if (!confirm('Clear all detected endpoints?')) return;
  chrome.runtime.sendMessage({ type: 'CLEAR_ENDPOINTS', tabId: currentTabId }, (response) => {
    if (response?.success) {
      endpoints = [];
      showEmptyState();
    }
  });
}

function exportEndpoints() {
  if (endpoints.length === 0) return alert('No endpoints to export');
  
  const data = {
    exportDate: new Date().toISOString(),
    tabId: currentTabId,
    endpointCount: endpoints.length,
    endpoints: endpoints.map(e => ({
      url: e.url,
      source: e.source,
      metadata: e.metadata,
      timestamp: e.timestamp,
      detectedAt: new Date(e.timestamp).toISOString()
    }))
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `graphql-endpoints-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard!');
  } catch (err) {
    showNotification('Failed to copy', true);
  }
}

function openUrl(url) {
  chrome.tabs.create({ url });
}

function showNotification(message, isError = false) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.textContent = message;
  if (isError) notif.style.background = '#ef4444';
  
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 2000);
}

function getTimeAgo(timestamp) {
  const s = Math.floor((Date.now() - timestamp) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
