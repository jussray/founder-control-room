import { describe, expect, it } from 'vitest';
import { linkedinPostIdentity } from '../capabilities.js';

describe('LinkedIn founder-content canonical post identity', () => {
  it('accepts canonical activity URNs and feed/update permalinks without widening host/path acceptance', () => {
    const urn = 'urn:li:activity:7423456789012345678';
    const canonical = `https://www.linkedin.com/feed/update/${urn}/`;

    expect(linkedinPostIdentity(urn)).toEqual({ postUrn: urn, permalink: canonical });
    expect(linkedinPostIdentity(canonical)).toEqual({ postUrn: urn, permalink: canonical });
    expect(linkedinPostIdentity(`https://linkedin.com/feed/update/${urn}`)).toEqual({ postUrn: urn, permalink: canonical });

    expect(linkedinPostIdentity(`https://example.com/feed/update/${urn}/`)).toBeNull();
    expect(linkedinPostIdentity(`https://www.linkedin.com/posts/${urn}/`)).toBeNull();
    expect(linkedinPostIdentity('urn:li:comment:7423456789012345678')).toBeNull();
  });

  it('preserves existing share and ugcPost normalization', () => {
    for (const urn of [
      'urn:li:share:1234567890',
      'urn:li:ugcPost:1234567890',
    ]) {
      expect(linkedinPostIdentity(urn)).toEqual({
        postUrn: urn,
        permalink: `https://www.linkedin.com/feed/update/${urn}/`,
      });
    }
  });
});
