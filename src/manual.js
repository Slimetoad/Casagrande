import doc from '../docs/diseno-operativo.md?raw'
import report from '../docs/verificacion-v2.md?raw'
const esc = text=>String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
function inline(text) {
  return esc(text).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[\w/-]+)\)/g,'<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>')
}
export function renderManual(section='manual') {
  const verification=section==='verificacion'
  const lines=(verification?report:doc).trim().split(/\r?\n/)
  let output='',list='',table=false
  for (const line of [...lines,'']) {
    if (!line.startsWith('|') && table) {output+='</tbody></table></div>';table=false}
    if (line.startsWith('|')) {
      if (!table) {table=true;output+='<div class="table"><table><tbody>'}
      if (!/^\|[ |:\-]+\|$/.test(line)) output+='<tr>'+line.split('|').slice(1,-1).map(c=>'<td>'+inline(c.trim())+'</td>').join('')+'</tr>'
      continue
    }
    const item=line.match(/^([-*]|\d+\.)\s+(.*)/)
    const type=item?(/^\d/.test(item[1])?'ol':'ul'):''
    if(type!==list){if(list)output+='</'+list+'>';if(type)output+='<'+type+'>';list=type}
    if(item) {output+='<li>'+inline(item[2])+'</li>';continue}
    const head=line.match(/^(#{1,4}) (.+)/)
    if (head) {const n=head[1].length;output+='<h'+n+'>'+inline(head[2])+'</h'+n+'>';continue}
    if(line.trim())output+='<p>'+inline(line)+'</p>'
  }
  return `<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${verification?'Verificación independiente':'Guía operativa'} · Posgrados UCG</title><style>*{box-sizing:border-box}body{margin:0;color:#20231e;font:1rem/1.65 system-ui;background:#faf9f6}header{padding:1.3rem max(5vw,calc((100vw - 64rem)/2));border-bottom:1px solid #d6d4cc;background:white;display:flex;justify-content:space-between;align-items:center}header img{width:156px}a{color:inherit;text-underline-offset:.25em}main{max-width:66rem;margin:auto;padding:4rem 1.5rem 7rem}h1{font-size:clamp(2.4rem,5vw,4.7rem);line-height:1;letter-spacing:-.055em}h2{margin-top:2.5em;padding-top:.8em;border-top:4px solid #ff8300;letter-spacing:-.04em;font-size:1.85em;line-height:1.1}.table{overflow-x:auto}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #d6d4cc;padding:12px;vertical-align:top}tr:first-of-type{font-weight:bold;background:#f3e8d8}li{margin:.5rem 0}code{overflow-wrap:anywhere}</style></head><body><header><img src="/media/ucg-logo.png" alt="Universidad Casa Grande"><nav><a href="/equipo">Admisiones</a> · <a href="${verification?'/equipo/manual':'/equipo/verificacion'}">${verification?'Manual':'Verificación'}</a></nav></header><main>${output}</main></body></html>`
}
