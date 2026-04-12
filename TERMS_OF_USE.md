# Orellius Browser Bridge — Terms of Use

**Last updated:** 2026-04-12

By installing, configuring, or running Orellius Browser Bridge ("the Software"),
you agree to the following terms. If you do not agree, do not use the Software.

## 1. Acceptance

You must explicitly accept these terms during installation. Acceptance is
recorded locally on your machine. You may revoke acceptance at any time by
deleting the file `~/.config/orellius-browser-bridge/.terms-accepted`.

## 2. Nature of the Software

The Software connects an AI assistant (Claude Code) to your real, signed-in
Chromium browser session. It grants the AI the ability to navigate, read,
interact with, screenshot, and execute JavaScript on **any website** your
browser can access — including sites where you are authenticated. There is
**no domain blocklist**.

## 3. You Are the Operator

Every automation session is initiated by you and executes under your
supervision. **You — not the Software authors, not contributors, and not
Anthropic — bear sole responsibility for:**

- Which websites you direct the Software to visit.
- Which actions (posting, commenting, messaging, deleting, purchasing,
  approving, or any other interaction) you instruct it to perform.
- Which browser profile, cookies, saved passwords, and logged-in sessions
  you expose to it.
- Ensuring that your use complies with all applicable local, state, national,
  and international laws in your jurisdiction.

## 4. Third-Party Terms of Service

Most websites prohibit automated access in their Terms of Service. **You are
solely responsible for reviewing and complying with the Terms of Service of
every website you automate.** Violations may result in account suspension,
permanent bans, or legal action by the platform. The Software authors make
no representations about the legality or permissibility of automating any
particular website.

## 5. Security Risks

By using the Software you acknowledge that:

- The browser extension requests `<all_urls>` and `debugger` permissions,
  giving the AI access to every page you can visit — including email, banking,
  password managers, and internal tools.
- Your cookies and authenticated sessions are the access model. If the AI opens
  a site where you are logged in, it can act as you.
- Running the Software in a browser profile containing sensitive accounts is
  your choice and your risk.

You are strongly advised to use a **dedicated browser profile** containing
only the accounts you explicitly intend to automate.

## 6. Prohibited Uses

You agree **not** to use the Software for:

- Spamming, credential stuffing, or brute-force attacks.
- Unauthorized data harvesting or scraping in violation of applicable law.
- Impersonation, harassment, or any form of abuse.
- Circumventing access controls, authentication mechanisms, or security
  measures on systems you do not own or have authorization to test.
- Any activity that violates applicable law.

## 7. No Warranty

THE SOFTWARE IS PROVIDED "AS IS" UNDER THE GNU GENERAL PUBLIC LICENSE v3.0,
WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
NONINFRINGEMENT.

## 8. Limitation of Liability

IN NO EVENT SHALL THE AUTHORS, CONTRIBUTORS, OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY — WHETHER IN AN ACTION OF CONTRACT,
TORT, OR OTHERWISE — ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. THIS INCLUDES BUT IS NOT LIMITED
TO: ACCOUNT SUSPENSIONS OR BANS, DATA LOSS, FINANCIAL LOSS, UNAUTHORIZED
ACTIONS PERFORMED THROUGH AUTOMATED SESSIONS, OR LEGAL CLAIMS INITIATED BY
THIRD-PARTY PLATFORMS.

## 9. Indemnification

You agree to indemnify and hold harmless the authors and contributors of the
Software from any claims, damages, losses, or expenses (including legal fees)
arising from your use or misuse of the Software.

## 10. Changes to These Terms

These terms may be updated in future versions of the Software. Continued use
after an update constitutes acceptance of the revised terms. Material changes
will be noted in the repository's release notes.
