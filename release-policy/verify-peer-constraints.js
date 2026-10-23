#!/usr/bin/env node
/**
 * Verify peer constraints at selected release revisions.
 *
 * Reads .peer-dependencies.json from each selected repository and validates
 * that the constraint declarations do not conflict with the release tuple.
 */

const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../releases/portfolio-v0.1.0.json'), 'utf8'));

const repos = {
  storyengine: path.join(__dirname, '../../StoryEngine'),
  chiefAi: path.join(__dirname, '../../chief-ai-machine'),
  sekretBip: path.join(__dirname, '../../Sekret-Bip'),
};

let passed = true;

for (const [logicalName, repoPath] of Object.entries(repos)) {
  const peerFile = path.join(repoPath, '.peer-dependencies.json');

  if (!fs.existsSync(peerFile)) {
    console.warn(`⚠ ${logicalName}: no .peer-dependencies.json found at ${peerFile}`);
    continue;
  }

  try {
    const peers = JSON.parse(fs.readFileSync(peerFile, 'utf8'));
    console.log(`✓ ${logicalName}: peer constraints loaded`);

    // Verify structure
    if (!peers.peers || !Array.isArray(peers.peers)) {
      console.error(`✗ ${logicalName}: invalid peers structure`);
      passed = false;
      continue;
    }

    // Check each peer constraint against the release tuple
    for (const peer of peers.peers) {
      const pinned = manifest.repositories[
        peer.repository === 'jussray/chief-ai-machine' ? 'chiefAi' :
        peer.repository === 'jussray/storyengine' ? 'storyengine' :
        peer.repository === 'jussray/Sekret-Bip' ? 'sekretBip' : null
      ];

      if (!pinned) {
        console.warn(`  ⚠ ${peer.repository} not in release tuple`);
        continue;
      }

      if (peer.expectedCommit && !pinned.commit.startsWith(peer.expectedCommit.substring(0, 7))) {
        console.error(`  ✗ constraint conflict: ${peer.repository} expects ${peer.expectedCommit}, tuple has ${pinned.commit}`);
        passed = false;
      } else {
        console.log(`  ✓ ${peer.repository}: constraint satisfied by release tuple`);
      }
    }
  } catch (error) {
    console.error(`✗ ${logicalName}: failed to parse peer constraints: ${error.message}`);
    passed = false;
  }
}

process.exit(passed ? 0 : 1);
