export const controlRoomHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Founder Control Room</title>
  <link rel="stylesheet" href="/assets/control-room.css">
  <script type="module" src="/assets/control-room.js"></script>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Founder operating system</p>
        <h1>Founder Control Room</h1>
        <p class="lede">Your repository hub, automation switchboard, CRM command layer, and independent evidence authority.</p>
      </div>
      <span id="system-status" class="status pending">Checking system</span>
    </header>

    <section id="signed-out" class="panel auth" hidden>
      <div>
        <p class="eyebrow">Founder identity</p>
        <h2>Enter your private control plane.</h2>
        <p>Google or a secure email link verifies identity through Supabase Auth. The private founder allowlist still decides who gets access.</p>
        <a id="google-login" class="google-button" href="/auth/google">Continue with Google</a>
      </div>
      <div class="email-fallback">
        <p class="divider"><span>or use email</span></p>
        <form id="login-form">
          <label for="email">Founder email</label>
          <input id="email" name="email" type="email" autocomplete="email" required placeholder="founder@example.com">
          <button id="login-button" type="submit">Send secure login link</button>
        </form>
      </div>
    </section>

    <section id="signed-in" hidden>
      <div class="panel identity">
        <div>
          <p class="eyebrow">Authenticated founder</p>
          <h2 id="founder-email">Founder</h2>
          <p>Identity verified. Execution authority remains locked behind separate proof and approval gates.</p>
        </div>
        <button id="logout-button" class="secondary" type="button">Sign out</button>
      </div>

      <section id="onboarding-flow" class="panel onboarding" hidden>
        <div class="onboarding-heading">
          <div>
            <p class="eyebrow">Workspace onboarding</p>
            <h2>Build your first sovereign workspace.</h2>
            <p>This creates Control Room records and disconnected provider slots. It does not store credentials, connect providers, merge code, or deploy production.</p>
          </div>
          <ol class="steps" aria-label="Onboarding steps">
            <li class="active">1. Project</li>
            <li>2. Tools</li>
            <li>3. Authority</li>
          </ol>
        </div>

        <form id="workspace-form">
          <fieldset>
            <legend>Project foundation</legend>
            <div class="form-grid">
              <div>
                <label for="project-name">Project name</label>
                <input id="project-name" name="projectName" required value="Founder Control Room">
              </div>
              <div>
                <label for="project-slug">Project slug</label>
                <input id="project-slug" name="projectSlug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="founder-control-room">
              </div>
              <div>
                <label for="repo-identifier">Repository</label>
                <input id="repo-identifier" name="repoIdentifier" placeholder="owner/repository">
              </div>
              <div>
                <label for="project-stack">Stack</label>
                <input id="project-stack" name="stack" value="Cloudflare + Supabase + provider adapters">
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Declare your tool slots</legend>
            <p class="field-help">Slots begin disconnected. Credentials remain in provider-held OAuth or server-side secret storage.</p>
            <div class="provider-grid">
              <label class="provider-card"><input type="checkbox" name="providers" value="github" checked><span><strong>GitHub</strong><small>Repos, branches, PRs, and mirrored checks</small></span></label>
              <label class="provider-card"><input type="checkbox" name="providers" value="cloudflare" checked><span><strong>Cloudflare</strong><small>Frontend, Workers, preview, and deployment evidence</small></span></label>
              <label class="provider-card"><input type="checkbox" name="providers" value="supabase" checked><span><strong>Supabase</strong><small>Auth and founder-operations data</small></span></label>
              <label class="provider-card"><input type="checkbox" name="providers" value="openai" checked><span><strong>OpenAI Developers</strong><small>Replaceable AI build and reasoning capability</small></span></label>
              <label class="provider-card"><input type="checkbox" name="providers" value="hubspot" checked><span><strong>HubSpot</strong><small>CRM records with separate mutation approval</small></span></label>
              <label class="provider-card"><input type="checkbox" name="providers" value="playwright" checked><span><strong>Playwright</strong><small>Real-path browser proof and traces</small></span></label>
            </div>
          </fieldset>

          <fieldset class="authority-confirmation">
            <legend>Authority boundary</legend>
            <label class="confirm-row">
              <input id="authority-confirm" type="checkbox" required>
              <span>I understand that login and onboarding do not approve merge, deployment, migration, spending, CRM mutation, external communication, deletion, or provider changes.</span>
            </label>
          </fieldset>

          <div class="actions">
            <button id="workspace-button" type="submit">Create Control Room workspace</button>
            <button id="cancel-onboarding" class="secondary" type="button" hidden>Back to workspace</button>
          </div>
        </form>
      </section>

      <section id="workspace-ready" hidden>
        <div class="panel ready">
          <div>
            <p class="eyebrow">Workspace online</p>
            <h2 id="workspace-title">Your Control Room is ready.</h2>
            <p id="workspace-summary">Loading workspace state.</p>
          </div>
          <button id="start-onboarding" class="secondary" type="button">Add another project</button>
        </div>

        <div class="module-grid">
          <a class="module-card" href="/control-room/github-workspace.html"><small>Repository system</small><strong>GitHub Workspace</strong><span>Read files and commit only to mission branches.</span></a>
          <a class="module-card" href="/control-room/command-bridge.html"><small>Automation system</small><strong>Command Bridge</strong><span>Run allowlisted workflows with exact-head evidence.</span></a>
          <a class="module-card" href="/control-room/plugin-center.html"><small>CRM + providers</small><strong>Plugin Center</strong><span>Declare tool power, boundaries, and temporary grants.</span></a>
          <a class="module-card" href="/control-room/"><small>Founder cockpit</small><strong>Control Room</strong><span>Review missions, approvals, evidence, and releases.</span></a>
        </div>

        <div class="metrics">
          <div class="metric"><span id="project-count">0</span><small>projects</small></div>
          <div class="metric"><span id="connection-count">0</span><small>declared tool slots</small></div>
          <div class="metric"><span>0</span><small>automatic merge approvals</small></div>
          <div class="metric"><span>0</span><small>automatic deploy approvals</small></div>
        </div>
      </section>

      <section class="panel password">
        <div>
          <p class="eyebrow">Optional credential handoff</p>
          <h2>Set or change your founder password.</h2>
          <p>Google and magic-link access remain available. Passwords are sent only to Supabase Auth and are never stored by Control Room.</p>
        </div>
        <form id="password-form">
          <label for="new-password">New password</label>
          <input id="new-password" name="password" type="password" autocomplete="new-password" required minlength="12" placeholder="12+ characters">
          <label for="confirm-password">Confirm password</label>
          <input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="12" placeholder="Repeat password">
          <button id="password-button" type="submit">Update password</button>
        </form>
      </section>

      <section class="panel truth">
        <p class="eyebrow">Truth boundary</p>
        <h2>Connection slots are declarations, not proof.</h2>
        <p>Each provider stays disconnected until its provider-held authorization is completed and verified. Every risky action still needs fresh evidence and its own founder decision.</p>
      </section>
    </section>

    <p id="notice" class="notice" role="status" aria-live="polite"></p>
  </main>
</body>
</html>`;
