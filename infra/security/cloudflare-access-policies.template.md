# Cloudflare Access Policy Templates

Use these templates for exposed scanner/control-tower surfaces.

## 1) Public Read Surface

- App: `portals-control-tower-public`
- Domain: `https://portals.elfadil.com/api/control-tower/summary*`
- Domain: `https://portals.elfadil.com/api/control-tower/details*`
- Policy Action: `Allow`
- Include: `Everyone`
- Session Duration: `15 minutes`
- Purpose: allow read-only redacted telemetry for dashboard and observers.

## 2) Operator Protected API Surface

- App: `portals-control-tower-operator`
- Domain: `https://portals.elfadil.com/api/control-tower*`
- Domain: `https://portals.elfadil.com/api/scan/*`
- Policy Action: `Allow`
- Include: `Emails ending in @elfadil.com`
- Require: `One-time PIN` or configured IdP MFA
- Session Duration: `10 minutes`
- Purpose: enforce strong identity on internal control operations.

## 3) Scanner Automation Surface

- App: `oracle-scanner-automation`
- Domain: `https://oracle-scanner.elfadil.com/scan*`
- Domain: `https://oracle-scanner.elfadil.com/sessions*`
- Policy Action: `Service Auth`
- Include: `Service Token scanner-ci`
- Service Token Header: `CF-Access-Client-Id` and `CF-Access-Client-Secret`
- Purpose: machine-to-machine access without user cookies.

## 4) Block-by-Default Catchall

- App: `control-tower-catchall`
- Domain: `https://portals.elfadil.com/api/*`
- Policy Action: `Block`
- Exclude: previously allowed policies above.

## Recommended Additional Constraints

- Enable Access logs and export to SIEM.
- Require device posture for privileged admins.
- Rotate service tokens every 90 days.
- Pair Access with API key auth in Worker for layered defense.
