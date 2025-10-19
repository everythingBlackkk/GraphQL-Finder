
console.log('GraphQL Finder content script loaded');

function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data.type !== 'GRAPHQL_DETECTED') return;
  chrome.runtime.sendMessage({
    type: 'GRAPHQL_ENDPOINT_FOUND',
    url: event.data.url,
    source: event.data.source,
    metadata: event.data.metadata
  });
});

function scanScriptTags() {
  document.querySelectorAll('script[src]').forEach(script => {
    if (/graphql|gql|apollo|relay/i.test(script.src)) {
      chrome.runtime.sendMessage({ type: 'GRAPHQL_ENDPOINT_FOUND', url: script.src, source: 'Script', metadata: {} });
    }
  });
  
  const patterns = [
    /['"\`](https?:\/\/[^'"\`]*(?:graphql|gql|\/api\/graph)[^'"\`]*)['"`]/gi,
    /endpoint\s*[:=]\s*['"\`]([^'"\`]+graphql[^'"\`]*)['"`]/gi,
    /url\s*[:=]\s*['"\`]([^'"\`]+graphql[^'"\`]*)['"`]/gi
  ];
  
  document.querySelectorAll('script:not([src])').forEach(script => {
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(script.textContent)) !== null) {
        if (match[1]?.length > 5) {
          chrome.runtime.sendMessage({ type: 'GRAPHQL_ENDPOINT_FOUND', url: match[1], source: 'Script', metadata: {} });
        }
      }
    });
  });
}
function scanPage() {
  document.querySelectorAll('[data-graphql], [data-gql], [data-apollo]').forEach(el => {
    const url = el.getAttribute('data-graphql') || el.getAttribute('data-gql') || el.getAttribute('data-apollo');
    if (url) {
      chrome.runtime.sendMessage({ type: 'GRAPHQL_ENDPOINT_FOUND', url, source: 'DOM', metadata: {} });
    }
  });
  
  document.querySelectorAll('meta[name*="graphql"], meta[property*="graphql"]').forEach(meta => {
    const content = meta.getAttribute('content');
    if (content) {
      chrome.runtime.sendMessage({ type: 'GRAPHQL_ENDPOINT_FOUND', url: content, source: 'Meta', metadata: {} });
    }
  });
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeName === 'SCRIPT' && node.src && /graphql|gql|apollo|relay/i.test(node.src)) {
        chrome.runtime.sendMessage({ type: 'GRAPHQL_ENDPOINT_FOUND', url: node.src, source: 'Script', metadata: {} });
      }
    });
  });
});

observer.observe(document.documentElement, { childList: true, subtree: true });

function init() {
  injectScript();
  scanScriptTags();
  scanPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('load', () => setTimeout(() => { scanScriptTags(); scanPage(); }, 1000));
