// ==UserScript==
// @name         Claude.ai Chat Exporter (self-hosted)
// @namespace    local.design3d-kit
// @version      0.1
// @description  Export claude.ai conversations to Markdown + raw JSON using the site's own internal API (session cookie). No third parties. v1 = current conversation, downloads MD and raw JSON so the schema (incl. extended thinking) can be verified before scaling to bulk.
// @match        https://claude.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- config -------------------------------------------------------------
  const API = 'https://claude.ai/api';

  // --- small helpers ------------------------------------------------------
  const log = (...a) => console.log('[claude-export]', ...a);

  async function getJSON(url) {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin', // send the claude.ai session cookie
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.json();
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function safeName(s) {
    return (s || 'conversation')
      .replace(/[^\w\-À-ÿ ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }

  // --- discover ids -------------------------------------------------------
  async function getOrgId() {
    const orgs = await getJSON(`${API}/organizations`);
    if (!Array.isArray(orgs) || orgs.length === 0) {
      throw new Error('no organizations returned');
    }
    // Prefer an org that has chat capability; fall back to the first one.
    const withChat = orgs.find(
      (o) => Array.isArray(o.capabilities) && o.capabilities.includes('chat')
    );
    return (withChat || orgs[0]).uuid;
  }

  function getConvIdFromUrl() {
    const m = location.pathname.match(/\/chat\/([0-9a-fA-F-]{16,})/);
    return m ? m[1] : null;
  }

  async function fetchConversation(orgId, convId) {
    // tree + rendered_content pull the full message tree, not just what the
    // virtualized UI has in the DOM. render_all_tools includes tool blocks.
    const url =
      `${API}/organizations/${orgId}/chat_conversations/${convId}` +
      `?tree=True&rendered_content=True&render_all_tools=True`;
    return getJSON(url);
  }

  // --- conversion ---------------------------------------------------------
  function blockToMd(block) {
    if (!block || typeof block !== 'object') return '';
    switch (block.type) {
      case 'text':
        return block.text || '';
      case 'thinking':
        // Explicit tags so downstream tooling can find reasoning trivially.
        return `\n\n<thinking>\n${block.thinking || block.text || ''}\n</thinking>\n\n`;
      case 'tool_use':
        return `\n\n[tool_use: ${block.name || '?'}]\n\`\`\`json\n${JSON.stringify(
          block.input ?? {},
          null,
          2
        )}\n\`\`\`\n`;
      case 'tool_result': {
        const content = block.content
          ? typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content, null, 2)
          : '';
        return `\n\n[tool_result]\n\`\`\`\n${content}\n\`\`\`\n`;
      }
      default:
        // Unknown block type: keep it visible instead of silently dropping it.
        return `\n\n[block:${block.type || 'unknown'}]\n\`\`\`json\n${JSON.stringify(
          block,
          null,
          2
        )}\n\`\`\`\n`;
    }
  }

  function messageToMd(msg) {
    const who = msg.sender === 'human' ? '## User' : '## Assistant';
    let body = '';
    if (Array.isArray(msg.content) && msg.content.length) {
      body = msg.content.map(blockToMd).join('');
    } else {
      body = msg.text || '';
    }
    return `${who}\n\n${body.trim()}\n`;
  }

  function conversationToMd(conv) {
    const lines = [];
    lines.push(`# ${conv.name || 'Untitled conversation'}`);
    lines.push('');
    lines.push(`- uuid: ${conv.uuid || ''}`);
    lines.push(`- created_at: ${conv.created_at || ''}`);
    lines.push(`- updated_at: ${conv.updated_at || ''}`);
    lines.push(`- model: ${conv.model || conv.settings?.preview_feature_uses_paprika || 'unknown'}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    const msgs = conv.chat_messages || [];
    for (const m of msgs) {
      lines.push(messageToMd(m));
      lines.push('---');
      lines.push('');
    }
    return lines.join('\n');
  }

  // --- actions ------------------------------------------------------------
  async function exportCurrent(statusEl) {
    const setStatus = (t) => {
      if (statusEl) statusEl.textContent = t;
      log(t);
    };
    try {
      const convId = getConvIdFromUrl();
      if (!convId) {
        setStatus('Open a conversation first (URL /chat/<id>).');
        return;
      }
      setStatus('resolving org…');
      const orgId = await getOrgId();
      setStatus('fetching conversation…');
      const conv = await fetchConversation(orgId, convId);

      const base = `${safeName(conv.name)}-${convId.slice(0, 8)}`;
      // Raw JSON first — this is what lets us verify the real schema.
      download(`${base}.json`, JSON.stringify(conv, null, 2), 'application/json');
      download(`${base}.md`, conversationToMd(conv), 'text/markdown;charset=utf-8');

      const nMsgs = (conv.chat_messages || []).length;
      const nThinking = JSON.stringify(conv).match(/"type":\s*"thinking"/g);
      setStatus(
        `done: ${nMsgs} messages, thinking blocks in JSON: ${
          nThinking ? nThinking.length : 0
        }`
      );
    } catch (e) {
      setStatus('ERROR: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // --- UI -----------------------------------------------------------------
  function mountUI() {
    if (document.getElementById('cexp-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'cexp-panel';
    panel.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'background:#1f1f1f',
      'color:#eee',
      'font:12px/1.4 system-ui,sans-serif',
      'padding:10px',
      'border-radius:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,.4)',
      'max-width:280px',
    ].join(';');

    const btn = document.createElement('button');
    btn.textContent = '⬇ Export this chat (MD + JSON)';
    btn.style.cssText =
      'display:block;width:100%;padding:8px;cursor:pointer;border:0;border-radius:6px;background:#c96442;color:#fff;font-weight:600;';

    const status = document.createElement('div');
    status.style.cssText = 'margin-top:8px;white-space:pre-wrap;opacity:.85;';
    status.textContent = 'ready';

    btn.addEventListener('click', () => exportCurrent(status));

    panel.appendChild(btn);
    panel.appendChild(status);
    document.body.appendChild(panel);
  }

  // claude.ai is a SPA; mount once and keep it alive across route changes.
  mountUI();
  setInterval(mountUI, 3000);
})();
