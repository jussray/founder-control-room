export const callbackHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Completing founder login</title>
  <link rel="stylesheet" href="/assets/control-room.css">
  <script type="module" src="/assets/auth-callback.js"></script>
</head>
<body>
  <main class="shell callback">
    <section class="panel">
      <p class="eyebrow">Founder authentication</p>
      <h1 id="callback-title">Completing secure login</h1>
      <p id="callback-message">Verifying the one-time session and clearing credentials from the URL.</p>
      <a id="callback-return" href="/" hidden>Return to Founder Control Room</a>
    </section>
  </main>
</body>
</html>`;
