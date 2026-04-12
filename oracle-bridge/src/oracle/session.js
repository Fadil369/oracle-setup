/**
 * Oracle Session Manager v2.1
 * Handles login to Oracle OASIS (JSF / Oracle ADF Rich Client), session caching in KV.
 *
 * Oracle OASIS login flow:
 *  1. GET /prod/faces/Login.jsf  → extract ViewState + all form inputs + form ID
 *  2. POST credentials using multiple ADF/JSF field-name patterns until one works
 *  3. Capture JSESSIONID (+ ORA_WWW_COOKIE_TIME / oracle.adf.faces.CONTEXT) cookies
 *  4. Cache session in KV (TTL 8 hours)
 *
 * ADF Rich Client login field patterns (tried in order):
 *   Pattern A: ${formId}:it1::content  /  ${formId}:it2::content   (ADF inputText)
 *   Pattern B: ${formId}:userName      /  ${formId}:password
 *   Pattern C: j_username              /  j_password                (J2EE form-based)
 */

/** Hospital base URLs — elfadil.com zone (security_level: essentially_off, no CF bot check) */
const HOSPITAL_BASES = {
  riyadh:  'https://oracle-riyadh.elfadil.com',
  madinah: 'https://oracle-madinah.elfadil.com',
  unaizah: 'https://oracle-unaizah.elfadil.com',
  khamis:  'https://oracle-khamis.elfadil.com',
  jizan:   'https://oracle-jizan.elfadil.com',
  abha:    'https://oracle-abha.elfadil.com',
}

/** brainsait.org portal URLs (security_level: medium — for browser portal config, kept as-is) */
const HOSPITAL_BRAINSAIT = {
  riyadh:  'https://oracle-riyadh.brainsait.org',
  madinah: 'https://oracle-madinah.brainsait.org',
  unaizah: 'https://oracle-unaizah.brainsait.org',
  khamis:  'https://oracle-khamis.brainsait.org',
  jizan:   'https://oracle-jizan.brainsait.org',
  abha:    'https://oracle-abha.brainsait.org',
}

/** Tunnel origin IPs (private — accessible only via hayath-mcp CF tunnel e5cb8c86) */
const HOSPITAL_ORIGINS = {
  riyadh:  'https://128.1.1.185',
  madinah: 'http://172.25.11.26',
  unaizah: 'http://10.0.100.105',
  khamis:  'http://172.30.0.77',
  jizan:   'http://172.17.4.84',
  abha:    'http://172.19.1.1',
}

/** Context root per hospital */
const CTX_ROOTS = {
  riyadh:  '/prod',
  madinah: '/Oasis',
  unaizah: '/prod',
  khamis:  '/prod',
  jizan:   '/prod',
  abha:    '/Oasis',
}

/** Login JSF path per hospital */
const LOGIN_PATHS = {
  riyadh:  '/prod/faces/Login.jsf',
  madinah: '/Oasis/faces/Login.jsf',
  unaizah: '/prod/faces/Login.jsf',
  khamis:  '/prod/faces/Login.jsf',
  jizan:   '/prod/faces/Login.jsf',
  abha:    '/Oasis/faces/Login.jsf',
}

const SESSION_TTL = 8 * 3600 // 8 hours in seconds

export class OracleSession {
  constructor(kv, hospital) {
    this.kv = kv
    this.hospital = hospital
    this.base = HOSPITAL_BASES[hospital]
    this.loginPath = LOGIN_PATHS[hospital]
    this.ctx = CTX_ROOTS[hospital]
    this._sessionCookie = null
  }

  // ─────────────────── Public API ───────────────────

  /** Get or create a valid session cookie (cached in KV) */
  async getSession(username, password) {
    const cacheKey = `session:${this.hospital}:${username}`
    const cached = await this.kv.get(cacheKey, 'json')
    if (cached && cached.expires > Date.now()) {
      console.log(`[${this.hospital}] Using cached session for ${username}`)
      return cached.cookie
    }
    const cookie = await this.login(username, password)
    if (cookie) {
      await this.kv.put(cacheKey, JSON.stringify({
        cookie,
        expires: Date.now() + SESSION_TTL * 1000,
        hospital: this.hospital,
        username,
      }), { expirationTtl: SESSION_TTL })
    }
    return cookie
  }

  /** Invalidate a cached session (on 401/403 response) */
  async invalidateSession(username) {
    await this.kv.delete(`session:${this.hospital}:${username}`)
    this._sessionCookie = null
  }

  setSessionCookie(cookie) {
    this._sessionCookie = cookie
  }

  // ─────────────────── Login ───────────────────

  /**
   * Perform Oracle ADF/JSF login and return session cookie string.
   * Tries three ADF field-name patterns automatically.
   */
  async login(username, password) {
    const loginUrl = `${this.base}${this.loginPath}`
    console.log(`[${this.hospital}] Attempting login at ${loginUrl}`)

    try {
      // ── Step 1: GET login page ──
      const getResp = await fetch(loginUrl, {
        headers: {
          'User-Agent': 'BrainSAIT-Oracle-Bridge/2.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'follow',
      })

      if (!getResp.ok) {
        console.warn(`[${this.hospital}] Login page unreachable: HTTP ${getResp.status}`)
        return null
      }

      const html = await getResp.text()
      const initCookies = this._getAllCookies(getResp.headers)
      const viewState   = this._extractViewState(html)
      const adfCtrl     = this._extractAdfCtrlState(html)
      const formId      = this._extractFormId(html)
      const allInputs   = this._extractHiddenInputs(html)

      console.log(`[${this.hospital}] Login page OK — formId="${formId}" viewState="${viewState?.slice(0,20)}..."`)

      // ── Step 2: Build base form payload ──
      const base = {
        ...allInputs,
        ...(viewState && { 'javax.faces.ViewState': viewState }),
        ...(adfCtrl   && { '_adf.ctrl-state': adfCtrl }),
        'javax.faces.partial.ajax': 'false',
      }

      // Three ADF/JSF username/password field patterns
      const patterns = [
        // Oracle ADF Rich Client inputText (most common in OASIS)
        {
          [`${formId}:it1::content`]:     username,
          [`${formId}:it2::content`]:     password,
          [`${formId}:cb1`]:              formId ? 'Login' : undefined,
        },
        // Generic JSF field names
        {
          [`${formId}:userName`]:         username,
          [`${formId}:password`]:         password,
          [`${formId}:LoginButton`]:      'Login',
        },
        // J2EE FORM-based auth fallback
        {
          'j_username':                   username,
          'j_password':                   password,
        },
      ]

      for (const [i, fields] of patterns.entries()) {
        const form = new URLSearchParams()
        // Add base hidden fields first
        for (const [k, v] of Object.entries(base)) {
          if (v != null && v !== '') form.set(k, v)
        }
        // Overlay pattern-specific fields
        for (const [k, v] of Object.entries(fields)) {
          if (k && v != null) form.set(k, v)
        }

        const cookie = await this._attemptLogin(loginUrl, form.toString(), initCookies, i + 1)
        if (cookie) return cookie
      }

      console.warn(`[${this.hospital}] All login patterns exhausted — no valid session`)
      return null
    } catch (e) {
      console.error(`[${this.hospital}] Login exception:`, e.message)
      return null
    }
  }

  async _attemptLogin(loginUrl, formBody, initCookies, patternNum) {
    try {
      const postResp = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': this._serializeCookies(initCookies),
          'User-Agent': 'BrainSAIT-Oracle-Bridge/2.1',
          'Referer': loginUrl,
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Origin': this.base,
        },
        body: formBody,
        redirect: 'manual', // Catch 302 → successful login
      })

      const newCookies = this._getAllCookies(postResp.headers)
      const merged = { ...initCookies, ...newCookies }
      const serialized = this._serializeCookies(merged)

      // Success signals:
      //  a) 302/303 redirect (away from login page = success)
      //  b) 200 with JSESSIONID in cookies
      //  c) 200 body no longer contains the login form
      const hasSession = serialized.includes('JSESSIONID')
      const isRedirect = postResp.status === 302 || postResp.status === 303
      const location   = postResp.headers.get('location') || ''
      const redirectsAway = isRedirect && !location.toLowerCase().includes('login')

      if (redirectsAway || (hasSession && isRedirect)) {
        console.log(`[${this.hospital}] Login OK via pattern ${patternNum} (302 redirect)`)
        return serialized
      }

      if (hasSession && postResp.status === 200) {
        // Double-check: follow through to home page to confirm
        const bodyText = await postResp.text()
        const stillOnLogin = /login|password|sign\s*in/i.test(bodyText.slice(0, 3000))
        if (!stillOnLogin) {
          console.log(`[${this.hospital}] Login OK via pattern ${patternNum} (200 + JSESSIONID)`)
          return serialized
        }
      }

      console.log(`[${this.hospital}] Pattern ${patternNum} → status ${postResp.status}, hasSession=${hasSession}`)
      return null
    } catch (e) {
      console.warn(`[${this.hospital}] Pattern ${patternNum} exception: ${e.message}`)
      return null
    }
  }

  // ─────────────────── Authenticated HTTP ───────────────────

  /** Make an authenticated request to Oracle OASIS */
  async fetch(path, options = {}) {
    if (!this._sessionCookie) throw new Error('No session cookie. Call getSession() first.')
    const url = `${this.base}${path}`
    const resp = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'BrainSAIT-Oracle-Bridge/2.1',
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers,
        'Cookie': this._sessionCookie,
      },
    })
    // 302 to login page means session expired
    if (resp.status === 302) {
      const loc = resp.headers.get('location') || ''
      if (loc.toLowerCase().includes('login')) {
        throw new Error('401: Session expired — redirected to login')
      }
    }
    return resp
  }

  /** Try Oracle REST API first; falls back to JSF scraping caller */
  async apiGet(restPath) {
    const url = `${this.base}${this.ctx}/api/v1${restPath}`
    try {
      const resp = await fetch(url, {
        headers: {
          'Cookie': this._sessionCookie || '',
          'Accept': 'application/json',
          'User-Agent': 'BrainSAIT-Oracle-Bridge/2.1',
        },
      })
      if (resp.ok) {
        const ct = resp.headers.get('content-type') || ''
        if (ct.includes('json')) {
          return { source: 'rest', data: await resp.json() }
        }
      }
      console.log(`[${this.hospital}] REST ${url} → ${resp.status} (falling back to JSF)`)
    } catch (e) {
      console.log(`[${this.hospital}] REST ${url} error: ${e.message} (falling back to JSF)`)
    }
    return { source: 'jsf', data: null }
  }

  /** POST to Oracle REST API */
  async apiPost(restPath, body) {
    const url = `${this.base}${this.ctx}/api/v1${restPath}`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Cookie': this._sessionCookie || '',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'BrainSAIT-Oracle-Bridge/2.1',
        },
        body: JSON.stringify(body),
      })
      if (resp.ok) {
        const ct = resp.headers.get('content-type') || ''
        return {
          ok: true,
          status: resp.status,
          data: ct.includes('json') ? await resp.json() : await resp.text(),
        }
      }
      return { ok: false, status: resp.status, data: null }
    } catch (e) {
      return { ok: false, status: 0, error: e.message, data: null }
    }
  }

  // ─────────────────── Diagnostics ───────────────────

  /**
   * Test connectivity to this hospital's Oracle server without logging in.
   * Returns { reachable, status, loginPageFound, ms }
   */
  async diagnose() {
    const loginUrl = `${this.base}${this.loginPath}`
    const start = Date.now()
    try {
      const resp = await fetch(loginUrl, {
        headers: { 'User-Agent': 'BrainSAIT-Oracle-Bridge/2.1' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      })
      const ms = Date.now() - start
      const text = await resp.text()
      return {
        hospital: this.hospital,
        base: this.base,
        loginPath: this.loginPath,
        reachable: resp.ok,
        status: resp.status,
        loginPageFound: /javax\.faces\.ViewState|oracle\.adf|j_username/i.test(text),
        formId: this._extractFormId(text) || null,
        viewStatePresent: !!this._extractViewState(text),
        ms,
      }
    } catch (e) {
      return {
        hospital: this.hospital,
        base: this.base,
        loginPath: this.loginPath,
        reachable: false,
        error: e.message,
        ms: Date.now() - start,
      }
    }
  }

  // ─────────────────── HTML Parsers ───────────────────

  _extractViewState(html) {
    // Standard JSF hidden input
    const m1 = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)
    if (m1) return m1[1]
    // Alternate attribute order
    const m2 = html.match(/value="([^"]+)"[^>]*name="javax\.faces\.ViewState"/)
    if (m2) return m2[1]
    // JSON embedded
    const m3 = html.match(/javax\.faces\.ViewState['":\s]+['"]([^'"]+)/)
    return m3 ? m3[1] : null
  }

  _extractAdfCtrlState(html) {
    const m1 = html.match(/name="_adf\.ctrl-state"[^>]*value="([^"]+)"/)
    if (m1) return m1[1]
    const m2 = html.match(/name="_adf_ctrl-state"[^>]*value="([^"]+)"/)
    return m2 ? m2[1] : null
  }

  _extractFormId(html) {
    // Prefer the first <form> with an id
    const m = html.match(/<form[^>]+id="([^"]+)"/)
    return m ? m[1] : null
  }

  /** Extract all hidden <input> values from the page */
  _extractHiddenInputs(html) {
    const inputs = {}
    const re = /<input[^>]+type="hidden"[^>]*>/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const nameM = m[0].match(/name="([^"]+)"/)
      const valM  = m[0].match(/value="([^"]*)"/)
      if (nameM && valM) {
        inputs[nameM[1]] = valM[1]
      }
    }
    return inputs
  }

  // ─────────────────── Cookie Helpers ───────────────────

  /**
   * Extract all Set-Cookie headers from a Response.
   * CF Workers exposes getAll('set-cookie') for multi-value headers.
   */
  _getAllCookies(headers) {
    const cookies = {}
    let parts = []

    // CF Workers / modern fetch: getAll exists for set-cookie
    if (typeof headers.getAll === 'function') {
      parts = headers.getAll('set-cookie')
    } else {
      const raw = headers.get('set-cookie') || ''
      // Split on comma NOT inside parentheses (e.g. expires dates have commas)
      parts = raw ? raw.split(/,(?=[^;]+=[^;]+)/) : []
    }

    for (const part of parts) {
      const segment = part.split(';')[0].trim()
      const eq = segment.indexOf('=')
      if (eq > 0) {
        cookies[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim()
      }
    }
    return cookies
  }

  _serializeCookies(obj) {
    return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

export { HOSPITAL_BASES, HOSPITAL_BRAINSAIT, HOSPITAL_ORIGINS, CTX_ROOTS, LOGIN_PATHS }
