// Sandbox proxy bootstrap: routes Node's undici (fetch + OpenAI/Anthropic SDKs)
// through HTTPS_PROXY env when present. Required because undici does not honor
// proxy env vars by default. Safe no-op when HTTPS_PROXY is unset.
import { ProxyAgent, setGlobalDispatcher } from 'undici'
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
if (proxy) {
  setGlobalDispatcher(new ProxyAgent(proxy))
}
