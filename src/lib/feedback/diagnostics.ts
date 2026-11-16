export interface CapturedErrorEntry {
  at: string;
  source: 'console.error' | 'window.error' | 'unhandledrejection';
  message: string;
}

export interface CapturedFailedRequest {
  at: string;
  method: string;
  url: string;
  status: number;
  errorSnippet?: string;
}

export interface DiagnosticContextSnapshot {
  capturedAt: string;
  pageUrl: string;
  pathname: string;
  search: string;
  viewport: { width: number; height: number } | null;
  userAgent: string;
  theme: string;
  recentErrors: CapturedErrorEntry[];
  recentFailedRequests: CapturedFailedRequest[];
}

const MAX_ERRORS = 15;
const MAX_FAILED_REQUESTS = 10;

let initialized = false;
const errorBuffer: CapturedErrorEntry[] = [];
const failedReqBuffer: CapturedFailedRequest[] = [];

function pushError(entry: CapturedErrorEntry) {
  errorBuffer.unshift(entry);
  if (errorBuffer.length > MAX_ERRORS) errorBuffer.length = MAX_ERRORS;
}

function pushFailedRequest(entry: CapturedFailedRequest) {
  failedReqBuffer.unshift(entry);
  if (failedReqBuffer.length > MAX_FAILED_REQUESTS) {
    failedReqBuffer.length = MAX_FAILED_REQUESTS;
  }
}

export function initDiagnosticsCapture() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const origConsoleError = console.error;
  console.error = (...args: any[]) => {
    try {
      const msg = args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}`;
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ')
        .slice(0, 500);
      pushError({
        at: new Date().toISOString(),
        source: 'console.error',
        message: msg,
      });
    } catch {
      // ignore
    }
    origConsoleError.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    pushError({
      at: new Date().toISOString(),
      source: 'window.error',
      message: `${event.message || 'Uncaught error'} (${event.filename || ''}:${event.lineno || 0})`.slice(
        0,
        500
      ),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : String(reason || 'Unhandled promise rejection');
    pushError({
      at: new Date().toISOString(),
      source: 'unhandledrejection',
      message: msg.slice(0, 500),
    });
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    try {
      const res = await origFetch(input, init);
      if (!res.ok && res.status >= 400 && !rawUrl.includes('/api/feedback')) {
        let snippet: string | undefined;
        try {
          const cloned = res.clone();
          const txt = await cloned.text();
          snippet = txt.slice(0, 250);
        } catch {
          // ignore
        }
        pushFailedRequest({
          at: new Date().toISOString(),
          method,
          url: rawUrl.split('?')[0],
          status: res.status,
          errorSnippet: snippet,
        });
      }
      return res;
    } catch (err: any) {
      if (!rawUrl.includes('/api/feedback')) {
        pushFailedRequest({
          at: new Date().toISOString(),
          method,
          url: rawUrl.split('?')[0],
          status: 0,
          errorSnippet: err instanceof Error ? err.message : 'Network error',
        });
      }
      throw err;
    }
  };
}

export function captureDiagnosticContext(): DiagnosticContextSnapshot {
  if (typeof window === 'undefined') {
    return {
      capturedAt: new Date().toISOString(),
      pageUrl: '',
      pathname: '',
      search: '',
      viewport: null,
      userAgent: '',
      theme: 'default',
      recentErrors: [],
      recentFailedRequests: [],
    };
  }

  return {
    capturedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    userAgent: navigator.userAgent,
    theme: document.documentElement.getAttribute('data-theme') || 'default',
    recentErrors: [...errorBuffer],
    recentFailedRequests: [...failedReqBuffer],
  };
}
