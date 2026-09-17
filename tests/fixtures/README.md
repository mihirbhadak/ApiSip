# Local HTTP/2 test certificate

`localhost-cert.pem` and `localhost-key.pem` are public, disposable test fixtures for a loopback-only HTTP/2 server. They are not production credentials and are not included in the extension. Never use this private key for a real service or add this certificate to the operating system trust store.

The Playwright regression test permits only this certificate's public-key fingerprint in its isolated Chrome test profile. Regenerate with OpenSSL if needed:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -keyout tests/fixtures/localhost-key.pem -out tests/fixtures/localhost-cert.pem -days 3650 -subj '/CN=ApiSip Local Test Only' -addext 'subjectAltName=IP:127.0.0.1,DNS:localhost'
```
