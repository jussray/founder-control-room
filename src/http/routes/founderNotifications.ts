import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, requireInteractiveFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { founderPushConfig } from '../../services/founderNotificationDelivery.js';
import { normalizePushSubscription, sealSubscription, subscriptionFingerprint, unsealSubscription, sendWebPush } from '../../services/webPushTransport.js';

export const founderNotificationsRouter = Router();
founderNotificationsRouter.use((_req,res,next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  next();
});

founderNotificationsRouter.get('/config', requireFounder, async (_req,res) => {
  try {
    const config = founderPushConfig();
    return res.json({ enabled: Boolean(config), publicKey: config?.publicKey ?? null });
  } catch { return res.status(503).json({ error: 'push_configuration_unavailable' }); }
});

founderNotificationsRouter.get('/feed', requireFounder, async (req: FounderRequest,res) => {
  try {
    const { data, error } = await supabase.from('project_events')
      .select('id,metadata,created_at').eq('event_type','founder_notification_intent')
      .order('created_at',{ascending:false}).limit(50);
    if (error) throw Error('feed_unavailable');
    const config = founderPushConfig();
    const events = (data ?? []).map(row => ({ id: row.id, intent: row.metadata?.intent, occurredAt: row.created_at }));
    if (!config) return res.json({ events, pushEnabled: false, deliveries: [] });
    const { data: devices, error: devicesError } = await supabase.from('founder_notification_subscriptions')
      .select('id').eq('user_id', req.founder!.userId);
    if (devicesError) throw Error('devices_unavailable');
    const ids = (devices ?? []).map(row => row.id);
    const eventIds = events.map(row => row.id);
    let deliveries: unknown[] = [];
    if (ids.length && eventIds.length) {
      const result = await supabase.from('founder_notification_deliveries')
        .select('event_id,state,provider_accepted_at,attempt_count').in('subscription_id',ids).in('event_id',eventIds).limit(500);
      if (result.error) throw Error('deliveries_unavailable');
      deliveries = result.data ?? [];
    }
    return res.json({ events, pushEnabled: true, deliveries });
  } catch { return res.status(503).json({error:'notification_feed_unavailable'}); }
});

founderNotificationsRouter.post('/subscribe', requireInteractiveFounder, async (req: FounderRequest,res) => {
  let subscription;
  try { subscription = normalizePushSubscription(req.body); }
  catch { return res.status(400).json({error:'invalid_push_subscription'}); }
  try {
    const config = founderPushConfig();
    if (!config) return res.status(503).json({error:'push_disabled'});
    const userId = req.founder!.userId;
    const fingerprint = subscriptionFingerprint(subscription.endpoint);
    const { data: existing, error } = await supabase.from('founder_notification_subscriptions')
      .select('id,revoked_at').eq('user_id',userId).eq('endpoint_hash',fingerprint).maybeSingle();
    if (error) throw Error('subscription_lookup_failed');
    const encrypted = sealSubscription(subscription, config.storageKey, userId);
    if (existing) {
      const changes = existing.revoked_at ? { encrypted_subscription: encrypted, revoked_at:null, enrolled_at:new Date().toISOString() } : {encrypted_subscription:encrypted};
      const result = await supabase.from('founder_notification_subscriptions').update(changes).eq('id',existing.id).eq('user_id',userId);
      if (result.error) throw Error('subscription_update_failed');
    } else {
      const result = await supabase.from('founder_notification_subscriptions').insert({ user_id:userId, endpoint_hash:fingerprint, encrypted_subscription:encrypted });
      if (result.error) return res.status(result.error.code === '23505' ? 409 : 503).json({error:'subscription_not_registered'});
    }
    return res.status(201).json({registered:true});
  } catch { return res.status(503).json({error:'subscription_registration_unavailable'}); }
});

founderNotificationsRouter.post('/unsubscribe', requireInteractiveFounder, async (req: FounderRequest,res) => {
  try {
    const subscription = normalizePushSubscription(req.body);
    const { error } = await supabase.from('founder_notification_subscriptions').update({revoked_at:new Date().toISOString()})
      .eq('user_id',req.founder!.userId).eq('endpoint_hash',subscriptionFingerprint(subscription.endpoint)).is('revoked_at',null);
    if (error) throw Error('subscription_revoke_failed');
    return res.json({revoked:true});
  } catch { return res.status(503).json({error:'subscription_revocation_unavailable'}); }
});

founderNotificationsRouter.post('/test', requireInteractiveFounder, async (req: FounderRequest,res) => {
  try {
    const config = founderPushConfig();
    if (!config) return res.status(503).json({error:'push_disabled'});
    const device = normalizePushSubscription(req.body);
    const userId = req.founder!.userId;
    const {data,error} = await supabase.from('founder_notification_subscriptions').update({last_test_at:new Date().toISOString()})
      .eq('user_id',userId).eq('endpoint_hash',subscriptionFingerprint(device.endpoint)).is('revoked_at',null)
      .or('last_test_at.is.null,last_test_at.lt.'+new Date(Date.now()-60_000).toISOString())
      .select('encrypted_subscription').maybeSingle();
    if (error) throw Error('test_claim_failed');
    if (!data) return res.status(429).json({error:'not_enrolled_or_test_rate_limited'});
    const registered = unsealSubscription(data.encrypted_subscription, config.storageKey, userId);
    const id = randomUUID();
    const status = await sendWebPush(registered, {title:'FCR · Test notification',body:'This is a test, not a workflow success.',tag:id,url:'/control-room/notifications'}, config.privateKey,config.subject,id);
    return res.status(status >= 200 && status < 300 ? 200 : 502).json({providerAccepted:status >= 200 && status < 300,providerStatus:status,deviceReceipt:'unverified'});
  } catch { return res.status(503).json({error:'test_delivery_unavailable',deviceReceipt:'unknown'}); }
});
