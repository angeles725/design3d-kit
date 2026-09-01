/*
 * Claude.ai bulk exporter -- paste into the DevTools console on claude.ai
 * (while logged in). No extension, no third parties: uses the site's own
 * internal API with your session cookie. Downloads ONE combined .json and
 * ONE combined .md with every conversation, so the browser's multi-download
 * block never triggers.
 *
 * Run: open claude.ai, press F12 -> Console, type "allow pasting" if asked,
 * paste all of this, Enter.
 */
(async () => {
  var API = 'https://claude.ai/api';
  var SLEEP = 250; // ms between requests, be gentle with the API
  var FENCE = '```';
  var log = function () { console.log.apply(console, ['[export-all]'].concat([].slice.call(arguments))); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function getJSON(url) {
    var res = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText + ' @ ' + url);
    return res.json();
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function blockToMd(b) {
    if (!b || typeof b !== 'object') return '';
    if (b.type === 'text') return b.text || '';
    if (b.type === 'thinking') {
      var t = b.thinking || b.text || '';
      // Raw chain-of-thought is hidden/empty; the visible reasoning lives in summaries[].
      if (!t && Array.isArray(b.summaries)) {
        t = b.summaries.map(function (s) { return '- ' + (s && s.summary ? s.summary : ''); }).join('\n');
      }
      return '\n\n<thinking>\n' + t + '\n</thinking>\n\n';
    }
    if (b.type === 'tool_use') {
      return '\n\n[tool_use: ' + (b.name || '?') + ']\n' + FENCE + 'json\n' + JSON.stringify(b.input || {}, null, 2) + '\n' + FENCE + '\n';
    }
    if (b.type === 'tool_result') {
      var c = b.content ? (typeof b.content === 'string' ? b.content : JSON.stringify(b.content, null, 2)) : '';
      return '\n\n[tool_result]\n' + FENCE + '\n' + c + '\n' + FENCE + '\n';
    }
    return '\n\n[block:' + (b.type || 'unknown') + ']\n' + FENCE + 'json\n' + JSON.stringify(b, null, 2) + '\n' + FENCE + '\n';
  }

  function msgToMd(m) {
    var who = m.sender === 'human' ? '## User' : '## Assistant';
    var body = (Array.isArray(m.content) && m.content.length) ? m.content.map(blockToMd).join('') : (m.text || '');
    return who + '\n\n' + body.trim() + '\n';
  }

  function convToMd(c) {
    var out = [];
    out.push('# ' + (c.name || 'Untitled'));
    out.push('\n- uuid: ' + (c.uuid || '') + '\n- created_at: ' + (c.created_at || '') + '\n- updated_at: ' + (c.updated_at || '') + '\n');
    out.push('---\n');
    var msgs = c.chat_messages || [];
    for (var i = 0; i < msgs.length; i++) {
      out.push(msgToMd(msgs[i]));
      out.push('---\n');
    }
    return out.join('\n');
  }

  try {
    log('resolving org...');
    var orgs = await getJSON(API + '/organizations');
    var org = null;
    for (var i = 0; i < orgs.length; i++) {
      if (orgs[i].capabilities && orgs[i].capabilities.indexOf('chat') !== -1) { org = orgs[i]; break; }
    }
    if (!org) org = orgs[0];
    var orgId = org.uuid;
    log('org:', orgId);

    log('listing conversations...');
    var list = await getJSON(API + '/organizations/' + orgId + '/chat_conversations');
    log('found ' + list.length + ' conversations');

    var full = [];
    for (var j = 0; j < list.length; j++) {
      var uuid = list[j].uuid;
      var name = list[j].name;
      try {
        var c = await getJSON(API + '/organizations/' + orgId + '/chat_conversations/' + uuid + '?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong');
        full.push(c);
        log('[' + (j + 1) + '/' + list.length + '] ' + (name || uuid));
      } catch (e) {
        log('[' + (j + 1) + '/' + list.length + '] FAILED ' + uuid + ': ' + e.message);
      }
      await sleep(SLEEP);
    }

    full.sort(function (a, b) { return new Date(a.created_at || 0) - new Date(b.created_at || 0); });

    var thinkingCount = (JSON.stringify(full).match(/"type":\s*"thinking"/g) || []).length;
    log('TOTAL thinking blocks across all conversations: ' + thinkingCount);

    var stamp = new Date().toISOString().slice(0, 10);
    download('claude-export-' + stamp + '.json', JSON.stringify(full, null, 2), 'application/json');

    var mdParts = [];
    for (var k = 0; k < full.length; k++) {
      mdParts.push('\n\n<!-- ============================================================ -->\n' + convToMd(full[k]));
    }
    download('claude-export-' + stamp + '.md', mdParts.join('\n'), 'text/markdown;charset=utf-8');

    log('DONE -- ' + full.length + ' conversations, ' + thinkingCount + ' thinking blocks. Check your downloads.');
  } catch (e) {
    console.error('[export-all] ERROR:', e);
  }
})();
