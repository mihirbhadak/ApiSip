# Replay context and authentication

Context answers **where the request runs**. The cookie setting answers **whether Chrome may use eligible browser credentials**. Header eyes answer **which captured header rows ApiSip passes to fetch**. They are three different controls.

## Choose the right context

| Use case                              | Context   | Browser cookies              | Other requirements                                                                      |
| ------------------------------------- | --------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| Reproduce a logged-in website request | Browser   | Context default (include)    | Original tab open on the captured origin; required CSRF/token headers enabled           |
| API with Bearer token or API key      | Extension | Context default (omit)       | Valid enabled Authorization/API-key header and host access                              |
| Cookie-based API from ApiSip          | Extension | Use eligible browser cookies | Explicit selection for this origin; browser cookie rules still apply; redirects blocked |
| Test without authentication           | Either    | Do not send browser cookies  | Also exclude auth headers and credentials in query/body                                 |
| Timed runs or Test lab                | Extension | Always omit                  | Explicit test tokens; Test lab can extract a token from a preceding login response      |

Automatic selects Browser when the capture has a source tab ID, otherwise Extension. It never silently switches after a failure. A stale source tab produces an error, not an automatic resend.

## Why hidden headers can still authenticate

1. You log in on a website and it sets a session cookie (possibly HTTP-only).
2. Browser replay runs a bundled fetch function from that tab's isolated content-script world.
3. The default credential setting is `include`; Chrome attaches eligible cookies itself.
4. Hiding the captured Cookie row only removes that row from ApiSip's request definition. Chrome controls Cookie, Origin, Host, Sec-* and other restricted headers.
5. Extension replay defaults to `omit`. With neither a session cookie nor an enabled token header, a cookie-based API can return **401 / not logged in**.

The new selector makes this behavior explicit. It does not change the website's session merely by selecting an option. A sent credentialed request can modify server data, and response Set-Cookie headers may update eligible cookies.

## Use cookie login in Extension

1. Open a request's **Replay** tab or **Open in new tab** editor.
2. Select **Extension** context and verify the request URL.
3. Under **Browser cookies**, choose **Use eligible browser cookies**.
4. Keep CSRF/Authorization/custom authentication headers enabled if the endpoint requires them.
5. Send once. Inspect status, body and replay guidance. This option does not guarantee login.

The explicit choice is stored with this draft, bound to scheme + host + port. Editing to another origin refuses to send until you choose again. Extension requests with cookies enabled reject redirects; use the intended final URL directly. They do not read cookies with the cookies API or copy the captured Cookie string. No additional permissions are requested.

Use Browser if the API depends on the page origin, partitioned cookies or page CORS context. Neither mode runs your framework's fetch interceptors or reads an Authorization token from page localStorage. Supply that header explicitly. A **403** may mean authorization or CSRF failure even when login cookies were accepted.

## Test lab token chaining

For a test API you control, create a first step that posts test credentials to its token endpoint. Assert success and extract a scalar token using its actual JSON Pointer, such as `/access_token`. In a later step use `Authorization: Bearer {{accessToken}}`. Extracted values exist only in memory during that suite; bodies and extracted values are omitted from saved reports. Keep environments containing credentials local and review exports before sharing. This pattern is not automatic OAuth, a refresh-token manager, or a secrets vault.

## Limits and verification

Chrome manages cookie eligibility, SameSite behavior, partitioning and browser settings. Extensions with host permissions have special same-site treatment for network requests; this does not mean every website login can be reproduced. Browser content-script requests still follow page-origin CORS restrictions.

Official references:

- [Chrome: cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chrome: storage and cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [Fetch credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)

The automated Chrome fixture performs a real HTTP-only cookie login, captures a request, hides every captured header, checks both default contexts, enables extension cookies, tests Browser omit and token-only authentication, reloads the saved preference, and checks changed-origin/redirect failures. This verifies the fixture behavior; it does not certify every site's authentication scheme.
