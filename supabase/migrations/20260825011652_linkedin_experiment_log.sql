-- Production-applied migration fossil restored from supabase_migrations.schema_migrations.
-- Tracks approved LinkedIn posts as controlled content experiments.

CREATE TABLE IF NOT EXISTS linkedin_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_name TEXT NOT NULL,
  publish_date DATE,
  related_project TEXT CHECK (related_project IN ('chief-ai','fcr','l99','bip','storyengine','jbh','think-tank','trading-agent')),
  core_thesis TEXT NOT NULL,
  audience_targeted TEXT,
  primary_hook TEXT NOT NULL,
  hook_type TEXT CHECK (hook_type IN ('Contrarian','Story','Proof','Insight','Build-in-public')),
  angle TEXT,
  proof_style TEXT CHECK (proof_style IN ('Build evidence','Customer evidence','Technical proof','Personal lesson','Data')),
  cta TEXT,
  experiment_hypothesis TEXT,
  impressions INTEGER,
  profile_views INTEGER,
  engagement_rate NUMERIC(5,2),
  meaningful_comments INTEGER,
  saves INTEGER,
  shares INTEGER,
  follower_movement INTEGER,
  qualified_conversations INTEGER,
  what_improved TEXT,
  what_regressed TEXT,
  repetition_risk TEXT CHECK (repetition_risk IN ('Low','Medium','High')),
  repetition_reason TEXT,
  prior_best_match_id UUID REFERENCES linkedin_experiments(id),
  meaningful_change TEXT,
  score_hook_strength SMALLINT CHECK (score_hook_strength BETWEEN 0 AND 10),
  score_proof_credibility SMALLINT CHECK (score_proof_credibility BETWEEN 0 AND 10),
  score_audience_fit SMALLINT CHECK (score_audience_fit BETWEEN 0 AND 10),
  score_originality SMALLINT CHECK (score_originality BETWEEN 0 AND 10),
  score_conversation_quality SMALLINT CHECK (score_conversation_quality BETWEEN 0 AND 10),
  score_business_relevance SMALLINT CHECK (score_business_relevance BETWEEN 0 AND 10),
  score_total SMALLINT GENERATED ALWAYS AS (
    COALESCE(score_hook_strength, 0) + COALESCE(score_proof_credibility, 0) +
    COALESCE(score_audience_fit, 0) + COALESCE(score_originality, 0) +
    COALESCE(score_conversation_quality, 0) + COALESCE(score_business_relevance, 0)
  ) STORED,
  next_hypothesis TEXT,
  next_why_now TEXT,
  next_prior_evidence TEXT,
  next_success_proof TEXT,
  next_failure_proof TEXT,
  hubspot_deal_id TEXT DEFAULT '337185466050',
  hubspot_synced_at TIMESTAMPTZ,
  hubspot_engagement_id TEXT,
  approved_by TEXT DEFAULT 'juss',
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','published','analyzed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_linkedin_experiments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER linkedin_experiments_updated_at
  BEFORE UPDATE ON linkedin_experiments
  FOR EACH ROW EXECUTE FUNCTION update_linkedin_experiments_updated_at();

CREATE INDEX idx_linkedin_exp_status ON linkedin_experiments(status);
CREATE INDEX idx_linkedin_exp_project ON linkedin_experiments(related_project);
CREATE INDEX idx_linkedin_exp_score ON linkedin_experiments(score_total DESC);
CREATE INDEX idx_linkedin_exp_publish_date ON linkedin_experiments(publish_date DESC);
CREATE INDEX idx_linkedin_exp_hook_type ON linkedin_experiments(hook_type);
CREATE INDEX idx_linkedin_exp_hs_synced ON linkedin_experiments(hubspot_synced_at);

CREATE VIEW linkedin_winning_patterns AS
SELECT post_name, publish_date, hook_type, proof_style, angle, score_total,
       meaningful_comments, saves, qualified_conversations, meaningful_change
FROM linkedin_experiments
WHERE status = 'analyzed' AND score_total >= 45
ORDER BY score_total DESC, publish_date DESC;

ALTER TABLE linkedin_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "founder_full_access" ON linkedin_experiments
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

COMMENT ON TABLE linkedin_experiments IS
  'Approved LinkedIn posts as controlled experiments. Fingerprint + performance + evidence score. Syncs to HubSpot deal 337185466050 via Founder Signal Engine.';
