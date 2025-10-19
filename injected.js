(function() {
  'use strict';
  
  console.log('GraphQL Finder injected script loaded');
  
  function isGraphQLRequest(url, options = {}) {
    if (/graphql|\/gql\b|\/api\/graph|__graphql/i.test(url)) return true;
    
    if (options.body) {
      const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (/\b(query|mutation|subscription)\s*[{\(]|operationName|__typename/.test(bodyStr)) return true;
    }
    
    if (options.headers) {
      const headers = options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : options.headers;
      if (/graphql|apollo|hasura/i.test(JSON.stringify(headers))) return true;
    }
    
    return false;
  }
  
  function reportEndpoint(url, source, metadata = {}) {
    window.postMessage({ type: 'GRAPHQL_DETECTED', url, source, metadata }, '*');
  }
  
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    const urlStr = url instanceof Request ? url.url : url.toString();
    if (isGraphQLRequest(urlStr, options)) {
      reportEndpoint(urlStr, 'fetch()', { method: options.method || 'GET' });
    }
    return originalFetch.apply(this, arguments);
  };
  
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._gqlUrl = url;
    this._gqlMethod = method;
    return originalOpen.apply(this, [method, url, ...args]);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    if (this._gqlUrl && isGraphQLRequest(this._gqlUrl, { body, method: this._gqlMethod })) {
      reportEndpoint(this._gqlUrl, 'XHR', { method: this._gqlMethod });
    }
    return originalSend.apply(this, arguments);
  };
  
  const originalWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    const urlStr = url.toString();
    if (/graphql|gql|subscriptions|apollo/i.test(urlStr)) {
      reportEndpoint(urlStr, 'WebSocket', {});
    }
    return new originalWebSocket(url, protocols);
  };
  Object.setPrototypeOf(window.WebSocket, originalWebSocket);
  window.WebSocket.prototype = originalWebSocket.prototype;
  
  function scanWindowObject() {
    const keys = ['__APOLLO_CLIENT__', '__RELAY_ENVIRONMENT__', 'graphql', 'gql', '__GRAPHQL_ENDPOINT__'];
    keys.forEach(key => {
      if (!window[key]) return;
      const value = window[key];
      
      if (typeof value === 'string' && /^https?:\/\//.test(value)) {
        reportEndpoint(value, 'Window', {});
      } else if (typeof value === 'object') {
        const searchUrl = (obj, depth = 0) => {
          if (depth > 2) return;
          for (const prop in obj) {
            try {
              const val = obj[prop];
              if (typeof val === 'string' && /^https?:\/\/.*graphql/i.test(val)) {
                reportEndpoint(val, 'Window', {});
              } else if (typeof val === 'object' && val) {
                searchUrl(val, depth + 1);
              }
            } catch (e) {}
          }
        };
        searchUrl(value);
      }
    });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanWindowObject);
  } else {
    scanWindowObject();
  }
  setTimeout(scanWindowObject, 2000);
  
})();
