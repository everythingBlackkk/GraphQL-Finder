const graphqlEndpoints = new Map();
const GRAPHQL_PATTERNS = [
  /graphql/i,
  /\/gql\b/i,
  /\/api\/graph/i,
  /__graphql/i,
  /query.*operation/i,
  /mutation.*operation/i
];

function isGraphQLRelated(url, body = '') {
  if (GRAPHQL_PATTERNS.some(pattern => pattern.test(url))) return true;
  if (body) {
    return /\b(query|mutation|subscription)\s*[{\(]/.test(body) || /__typename|operationName/.test(body);
  }
  return false;
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { tabId, url, method, requestBody } = details;
    if (tabId < 0) return;
    
    let body = '';
    if (requestBody?.raw) {
      body = requestBody.raw.map(data => new TextDecoder('utf-8').decode(data.bytes)).join('');
    } else if (requestBody?.formData) {
      body = JSON.stringify(requestBody.formData);
    }
    
    if (isGraphQLRelated(url, body)) {
      addEndpoint(tabId, url, 'Network', { method });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const { tabId, url, responseHeaders } = details;
    if (tabId < 0) return;
    
    const hasGraphQLHeaders = responseHeaders?.some(header => 
      /graphql|apollo|hasura/i.test(header.name) || /graphql|apollo|hasura/i.test(header.value)
    );
    
    if (hasGraphQLHeaders || isGraphQLRelated(url)) {
      addEndpoint(tabId, url, 'Network', {});
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

function addEndpoint(tabId, url, source, metadata = {}) {
  if (!graphqlEndpoints.has(tabId)) graphqlEndpoints.set(tabId, new Set());
  
  const endpointKey = `${url}|${source}`;
  if (graphqlEndpoints.get(tabId).has(endpointKey)) return;
  
  graphqlEndpoints.get(tabId).add(endpointKey);
  
  chrome.storage.local.get(['endpoints'], (result) => {
    const allEndpoints = result.endpoints || {};
    if (!allEndpoints[tabId]) allEndpoints[tabId] = [];
    
    allEndpoints[tabId].push({ url, source, metadata, timestamp: Date.now() });
    chrome.storage.local.set({ endpoints: allEndpoints });
    updateBadge(tabId, allEndpoints[tabId].length);
  });
}

function updateBadge(tabId, count) {
  chrome.action.setBadgeText({ tabId, text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, tabId, url, source, metadata } = message;
  
  if (type === 'GRAPHQL_ENDPOINT_FOUND' && sender.tab?.id) {
    addEndpoint(sender.tab.id, url, source, metadata);
  } else if (type === 'GET_ENDPOINTS') {
    chrome.storage.local.get(['endpoints'], (result) => {
      sendResponse({ endpoints: result.endpoints?.[tabId] || [] });
    });
    return true;
  } else if (type === 'CLEAR_ENDPOINTS') {
    chrome.storage.local.get(['endpoints'], (result) => {
      const allEndpoints = result.endpoints || {};
      delete allEndpoints[tabId];
      chrome.storage.local.set({ endpoints: allEndpoints });
      updateBadge(tabId, 0);
      sendResponse({ success: true });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  graphqlEndpoints.delete(tabId);
  chrome.storage.local.get(['endpoints'], (result) => {
    const allEndpoints = result.endpoints || {};
    delete allEndpoints[tabId];
    chrome.storage.local.set({ endpoints: allEndpoints });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    graphqlEndpoints.delete(tabId);
    chrome.storage.local.get(['endpoints'], (result) => {
      const allEndpoints = result.endpoints || {};
      delete allEndpoints[tabId];
      chrome.storage.local.set({ endpoints: allEndpoints });
      updateBadge(tabId, 0);
    });
  }
});

console.log('GraphQL Finder loaded');
