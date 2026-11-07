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
    <header class="masthead topbar">
      <div>
        <p class="eyebrow">Founder operating system</p>
        <h1>Founder Control Room</h1>
        <p class="lede">One place to establish reality, choose the mission, connect evidence, and move the right thing forward.</p>
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
      <div class="identity-strip">
        <div>
          <p class="eyebrow">Authenticated founder</p>
          <strong id="founder-email" class="founder-email">Founder</strong>
        </div>
        <button id="logout-button" class="secondary compact" type="button">Sign out</button>
      </div>

      <section id="onboarding-flow" class="panel onboarding composer" hidden>
        <div class="composer-hero">
          <div>
            <p class="eyebrow">Control Room Composer</p>
            <h2>What are you trying to move forward?</h2>
            <p>Pick the kind of project, the mission, and its current reality. FCR will shape the room around the work instead of dropping you into a generic dashboard.</p>
          </div>
          <ol class="steps" aria-label="Control Room setup steps">
            <li class="active" data-step-indicator="1"><span>1</span>Project</li>
            <li data-step-indicator="2"><span>2</span>Mission</li>
            <li data-step-indicator="3"><span>3</span>Reality</li>
            <li data-step-indicator="4"><span>4</span>Evidence</li>
          </ol>
        </div>

        <form id="workspace-form">
          <section class="composer-step" data-step="1">
            <fieldset>
              <legend>What are you working on?</legend>
              <p class="field-help">Choose the closest fit. You can create more Control Rooms later.</p>
              <div class="choice-grid project-type-grid">
                <label class="choice-card"><input type="radio" name="projectType" value="product-app" required><span class="choice-icon">◇</span><strong>Product / App</strong><small>Software, mobile, SaaS, or product work</small></label>
                <label class="choice-card"><input type="radio" name="projectType" value="website"><span class="choice-icon">▤</span><strong>Website</strong><small>Marketing sites, portals, and web experiences</small></label>
                <label class="choice-card"><input type="radio" name="projectType" value="ai-agent"><span class="choice-icon">✦</span><strong>AI / Agent System</strong><small>Models, agents, MCP, automations, or AI products</small></label>
                <label class="choice-card"><input type="radio" name="projectType" value="business-company"><span class="choice-icon">▥</span><strong>Business / Company</strong><small>Operations, offers, customers, and company goals</small></label>
                <label class="choice-card"><input type="radio" name="projectType" value="client-project"><span class="choice-icon">◎</span><strong>Client Project</strong><small>Bounded delivery for a customer or partner</small></label>
                <label class="choice-card"><input type="radio" name="projectType" value="content-brand"><span class="choice-icon">✎</span><strong>Content / Brand</strong><small>Audience, publishing, positioning, or campaigns</small></label>
                <label class="choice-card"><input type="radio" name="projectType" value="store-commerce"><span class="choice-icon">▱</span><strong>Store / Commerce</strong><small>Products, catalog, checkout, and sales</small></label>
                <label class="choice-card"><input type="radio" name="projectType" value="research-decision"><span class="choice-icon">⌕</span><strong>Research / Decision</strong><small>Evidence gathering and consequential choices</small></label>
                <label class="choice-card"><input type="radio" name="projectType" value="other"><span class="choice-icon">•••</span><strong>Other</strong><small>Start with the mission and adapt from there</small></label>
              </div>
            </fieldset>
            <div class="step-actions end"><button class="next-step" type="button" data-next-step="2">Next: choose the mission</button></div>
          </section>

          <section class="composer-step" data-step="2" hidden>
            <fieldset>
              <legend>What do you need FCR to do?</legend>
              <p class="field-help">Pick the main mission for this Control Room. This is the operating lens, not permanent authority.</p>
              <div class="choice-grid mission-grid">
                <label class="choice-card mission-card"><input type="radio" name="mission" value="build" required><span class="choice-icon">⌘</span><strong>Build</strong><small>Turn an idea into something working</small></label>
                <label class="choice-card mission-card"><input type="radio" name="mission" value="fix"><span class="choice-icon">◇</span><strong>Fix</strong><small>Diagnose and repair something broken</small></label>
                <label class="choice-card mission-card"><input type="radio" name="mission" value="launch"><span class="choice-icon">↗</span><strong>Launch</strong><small>Get production-ready and shipped</small></label>
                <label class="choice-card mission-card"><input type="radio" name="mission" value="grow"><span class="choice-icon">▥</span><strong>Grow</strong><small>Customers, traffic, content, or sales</small></label>
                <label class="choice-card mission-card"><input type="radio" name="mission" value="operate"><span class="choice-icon">⚙</span><strong>Operate</strong><small>Keep an existing system healthy</small></label>
                <label class="choice-card mission-card"><input type="radio" name="mission" value="decide"><span class="choice-icon">◉</span><strong>Decide</strong><small>Gather evidence and make a choice</small></label>
                <label class="choice-card mission-card"><input type="radio" name="mission" value="prove"><span class="choice-icon">✓</span><strong>Prove</strong><small>Verify that something really works</small></label>
              </div>
            </fieldset>
            <div class="step-actions"><button class="secondary previous-step" type="button" data-previous-step="1">Back</button><button class="next-step" type="button" data-next-step="3">Next: establish reality</button></div>
          </section>

          <section class="composer-step" data-step="3" hidden>
            <fieldset>
              <legend>Tell FCR what it is controlling.</legend>
              <p class="field-help">Name the thing and mark its current state. Repository and stack details are optional.</p>
              <div class="form-grid">
                <div class="wide-field">
                  <label for="project-name">What are we controlling?</label>
                  <input id="project-name" name="projectName" required maxlength="120" placeholder="e.g. Se'kret Bip, my Shopify store, client website">
                </div>
                <div>
                  <label for="project-slug">Project slug</label>
                  <input id="project-slug" name="projectSlug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="generated-from-name">
                </div>
                <div>
                  <label for="repo-identifier">Repository <span class="optional">optional</span></label>
                  <input id="repo-identifier" name="repoIdentifier" placeholder="owner/repository">
                </div>
                <div class="wide-field">
                  <label for="project-stack">Stack <span class="optional">optional</span></label>
                  <input id="project-stack" name="stack" maxlength="240" placeholder="e.g. React + Cloudflare + Supabase">
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>What's the current state?</legend>
              <div class="state-grid">
                <label class="state-chip"><input type="radio" name="currentState" value="idea" required><span>Idea</span></label>
                <label class="state-chip"><input type="radio" name="currentState" value="planning"><span>Planning</span></label>
                <label class="state-chip"><input type="radio" name="currentState" value="building"><span>Building</span></label>
                <label class="state-chip"><input type="radio" name="currentState" value="live"><span>Already live</span></label>
                <label class="state-chip"><input type="radio" name="currentState" value="broken"><span>Broken</span></label>
                <label class="state-chip"><input type="radio" name="currentState" value="needs-improvement"><span>Needs improvement</span></label>
                <label class="state-chip"><input type="radio" name="currentState" value="unsure"><span>Unsure</span></label>
              </div>
            </fieldset>
            <div class="step-actions"><button class="secondary previous-step" type="button" data-previous-step="2">Back</button><button class="next-step" type="button" data-next-step="4">Next: connect evidence</button></div>
          </section>

          <section class="composer-step" data-step="4" hidden>
            <fieldset>
              <legend>Connect the evidence layer.</legend>
              <p class="field-help">These create disconnected provider slots only. Credentials, provider authority, merge authority, and deployment authority are not granted here.</p>
              <div class="provider-grid">
                <label class="provider-card"><input type="checkbox" name="providers" value="github" checked><span><strong>GitHub</strong><small>Repos, branches, PRs, and checks</small></span></label>
                <label class="provider-card"><input type="checkbox" name="providers" value="cloudflare" checked><span><strong>Cloudflare</strong><small>Frontend, Workers, previews, deployment evidence</small></span></label>
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

            <div class="step-actions"><button class="secondary previous-step" type="button" data-previous-step="3">Back</button><button id="workspace-button" type="submit">Create my Control Room</button></div>
          </section>

          <button id="cancel-onboarding" class="text-button" type="button" hidden>Back to my existing Control Room</button>
        </form>
      </section>

      <section id="workspace-ready" hidden>
        <div class="panel ready">
          <div>
            <p class="eyebrow">Control Room online</p>
            <h2 id="workspace-title">Your Control Room is ready.</h2>
            <p id="workspace-summary">Loading workspace state.</p>
          </div>
          <div class="ready-actions"><a class="primary-link" href="/control-room/">Open Control Room</a><button id="start-onboarding" class="secondary" type="button">New Control Room</button></div>
        </div>

        <div id="control-room-profile" class="profile-card panel">
          <div><small>Room type</small><strong id="profile-project-type">Project</strong></div>
          <div><small>Mission</small><strong id="profile-mission">Not classified</strong></div>
          <div><small>Current reality</small><strong id="profile-current-state">Unknown</strong></div>
          <div><small>Next gate</small><strong id="profile-next-gate">Establish evidence</strong></div>
        </div>

        <div class="module-grid">
          <a class="module-card" href="/control-room/github-workspace.html"><small>Repository system</small><strong>GitHub Workspace</strong><span>Read files and commit only to mission branches.</span></a>
          <a class="module-card" href="/control-room/command-bridge.html"><small>Automation system</small><strong>Command Bridge</strong><span>Run allowlisted workflows with exact-head evidence.</span></a>
          <a class="module-card" href="/control-room/plugin-center.html"><small>CRM + providers</small><strong>Plugin Center</strong><span>Declare tool power, boundaries, and temporary grants.</span></a>
          <a class="module-card" href="/control-room/"><small>Founder cockpit</small><strong>Control Room</strong><span>Review missions, approvals, evidence, and releases.</span></a>
        </div>

        <div class="metrics">
          <div class="metric"><span id="project-count">0</span><small>Control Rooms</small></div>
          <div class="metric"><span id="connection-count">0</span><small>declared evidence slots</small></div>
          <div class="metric"><span>0</span><small>automatic merge approvals</small></div>
          <div class="metric"><span>0</span><small>automatic deploy approvals</small></div>
        </div>
      </section>

      <section id="account-secondary" hidden>
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
    </section>

    <p id="notice" class="notice" role="status" aria-live="polite"></p>
  </main>
</body>
</html>`;
