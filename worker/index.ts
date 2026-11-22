import assets from 'vinext/server/fetch-handler'
import {serve} from '../src/portal.js'
import {renderManual} from '../src/manual.js'
import {programs} from '../src/catalog.js'
import {followupOnCapture} from '../src/capture-followup.js'
import {withConversationWake} from '../src/conversation-wake.js'
const worker = {
  fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext) {
    const path = new URL(request.url).pathname
    if (/^\/(?:media\/|_next\/|@|__vite|@vite\/)|\.(?:css|js|png|svg|webp|jpg|woff2?|ico)$/.test(path)) return assets.fetch(request,env,ctx)
    const onLeadCreated = request.method==='POST' && /^\/api\/leads\/?$/.test(path)
      ? followupOnCapture(env,ctx,programs)
      : undefined
    const runtime = request.method==='POST' && path.startsWith('/api/webhooks/') ? withConversationWake(env,ctx,programs) : env
    return serve(request,runtime,renderManual,onLeadCreated)
  }
}
export default worker
