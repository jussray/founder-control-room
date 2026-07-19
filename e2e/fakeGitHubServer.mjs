// Minimal in-memory GitHub REST API fake, faithful to exactly the Octokit
// calls GitHubProvider (src/providers/GitHubProvider.ts) makes — verified
// against that file's actual method bodies, not guessed. GitHubProvider
// gets pointed at this server via GITHUB_API_BASE_URL (an Octokit
// constructor option, additive and unused in production). This lets the
// e2e harness exercise real branch-create / file-edit / merge routes
// through the real browser without a real GitHub token.
//
// Modeled as a tiny git-shaped store: branches -> {sha, treeSha}, commits
// (sha -> {treeSha, parents}), trees (sha -> Map<path, content>). Not a
// full git implementation — just enough for this app's call sequence.
import express from 'express';
import { randomBytes } from 'node:crypto';

const sha = () => randomBytes(20).toString('hex');

export function createFakeGitHubServer({ owner, repo, defaultBranch = 'main', seedFiles = {} }) {
  const app = express();
  app.use(express.json());

  const trees = new Map(); // treeSha -> Map<path, content>
  const commits = new Map(); // sha -> { treeSha, parents }
  const branches = new Map(); // name -> { sha, treeSha }
  const blobs = new Map(); // sha -> content

  const rootTreeSha = sha();
  trees.set(rootTreeSha, new Map(Object.entries(seedFiles)));
  const rootCommitSha = sha();
  commits.set(rootCommitSha, { treeSha: rootTreeSha, parents: [] });
  branches.set(defaultBranch, { sha: rootCommitSha, treeSha: rootTreeSha });

  function requireRepo(req, res, next) {
    if (req.params.owner !== owner || req.params.repo !== repo) {
      return res.status(404).json({ message: 'Not Found' });
    }
    next();
  }

  app.get('/repos/:owner/:repo', requireRepo, (req, res) => {
    res.json({ name: repo, default_branch: defaultBranch, archived: false });
  });

  app.get('/repos/:owner/:repo/branches/:branch', requireRepo, (req, res) => {
    const branch = branches.get(req.params.branch);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json({ commit: { sha: branch.sha, commit: { tree: { sha: branch.treeSha } } } });
  });

  function getContents(req, res) {
    const path = req.params[0] ?? '';
    const ref = req.query.ref;
    let treeSha = branches.get(defaultBranch).treeSha;
    if (ref && branches.has(ref)) treeSha = branches.get(ref).treeSha;
    else if (ref && commits.has(ref)) treeSha = commits.get(ref).treeSha;
    const fileMap = trees.get(treeSha) ?? new Map();

    if (fileMap.has(path)) {
      const content = fileMap.get(path);
      return res.json({ type: 'file', path, content: Buffer.from(content, 'utf8').toString('base64'), encoding: 'base64' });
    }

    const prefix = path ? `${path}/` : '';
    const seenDirs = new Set();
    const entries = [];
    for (const filePath of fileMap.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const [first, ...more] = rest.split('/');
      if (more.length > 0) {
        if (!seenDirs.has(first)) { seenDirs.add(first); entries.push({ type: 'dir', path: `${prefix}${first}` }); }
      } else {
        entries.push({ type: 'file', path: filePath, size: fileMap.get(filePath).length });
      }
    }
    if (entries.length === 0 && path) return res.status(404).json({ message: 'Not Found' });
    res.json(entries);
  }
  // Octokit omits the trailing slash entirely when path is empty (GET
  // .../contents, no trailing segment) — register both shapes.
  app.get('/repos/:owner/:repo/contents', requireRepo, (req, res) => getContents({ ...req, params: { ...req.params, 0: '' } }, res));
  app.get('/repos/:owner/:repo/contents/*', requireRepo, getContents);

  app.post('/repos/:owner/:repo/git/refs', requireRepo, (req, res) => {
    const { ref, sha: baseSha } = req.body;
    const name = ref.replace(/^refs\/heads\//, '');
    const baseCommit = commits.get(baseSha);
    branches.set(name, { sha: baseSha, treeSha: baseCommit ? baseCommit.treeSha : rootTreeSha });
    res.status(201).json({ ref, object: { sha: baseSha } });
  });

  app.post('/repos/:owner/:repo/git/blobs', requireRepo, (req, res) => {
    const { content } = req.body;
    const blobSha = sha();
    blobs.set(blobSha, content);
    res.status(201).json({ sha: blobSha });
  });

  app.post('/repos/:owner/:repo/git/trees', requireRepo, (req, res) => {
    const { base_tree: baseTree, tree } = req.body;
    const fileMap = new Map(trees.get(baseTree) ?? []);
    for (const entry of tree) {
      if (entry.sha === null) fileMap.delete(entry.path);
      else fileMap.set(entry.path, blobs.get(entry.sha) ?? '');
    }
    const newTreeSha = sha();
    trees.set(newTreeSha, fileMap);
    res.status(201).json({ sha: newTreeSha });
  });

  app.post('/repos/:owner/:repo/git/commits', requireRepo, (req, res) => {
    const { tree, parents } = req.body;
    const commitSha = sha();
    commits.set(commitSha, { treeSha: tree, parents: parents ?? [] });
    res.status(201).json({ sha: commitSha });
  });

  app.patch('/repos/:owner/:repo/git/refs/*', requireRepo, (req, res) => {
    const branchName = req.params[0].replace(/^heads\//, '');
    const { sha: newSha } = req.body;
    const commit = commits.get(newSha);
    branches.set(branchName, { sha: newSha, treeSha: commit?.treeSha ?? rootTreeSha });
    res.json({ ref: `refs/heads/${branchName}`, object: { sha: newSha } });
  });

  app.post('/repos/:owner/:repo/merges', requireRepo, (req, res) => {
    const { base, head } = req.body;
    const headCommit = commits.get(head);
    if (!headCommit) return res.status(404).json({ message: `head ${head} not found` });
    const baseBranch = branches.get(base);
    const mergeCommitSha = sha();
    commits.set(mergeCommitSha, { treeSha: headCommit.treeSha, parents: [baseBranch?.sha, head].filter(Boolean) });
    branches.set(base, { sha: mergeCommitSha, treeSha: headCommit.treeSha });
    res.status(201).json({ sha: mergeCommitSha });
  });

  return { app, branches, trees };
}
