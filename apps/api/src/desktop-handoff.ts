const SCHEME = "com.endurancelabs.relaydesktop";

export const desktopHandoffHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Relay</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#3F0E40;color:#fff;font-family:Lato,sans-serif">
    <p id="msg">Finishing sign-in…</p>
    <script>
      const name = "better-auth.electron";
      const started = Date.now();
      const read = () => {
        const row = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
        return row ? row.slice(name.length + 1) : "";
      };
      const timer = setInterval(() => {
        const token = read();
        if (token) {
          clearInterval(timer);
          document.cookie = name + "=; Max-Age=0; Path=/";
          location.replace("${SCHEME}:/auth/callback#token=" + encodeURIComponent(token));
          return;
        }
        if (Date.now() - started > 4000) {
          clearInterval(timer);
          document.getElementById("msg").textContent = "Relay API is running. Return to the desktop app to sign in.";
        }
      }, 100);
    </script>
  </body>
</html>`;
