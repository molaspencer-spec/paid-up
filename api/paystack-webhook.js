import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const raw = await readRaw(req);
  const signature = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(raw)
    .digest('hex');

  if (signature !== req.headers['x-paystack-signature']) {
    return res.status(401).end();
  }

  const event = JSON.parse(raw.toString('utf8'));
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  async function userIdByEmail(email) {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = data?.users?.find(x => x.email?.toLowerCase() === email?.toLowerCase());
    return u?.id;
  }

  const email = event.data?.customer?.email;

  if (event.event === 'charge.success') {
    const id = event.data?.metadata?.user_id || (await userIdByEmail(email));
    if (id) {
      const until = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('profiles')
        .update({ is_pro: true, pro_until: until })
        .eq('id', id);
    }
  }

  if (event.event === 'subscription.disable' || event.event === 'invoice.payment_failed') {
    const id = await userIdByEmail(email);
    if (id) {
      await supabase.from('profiles')
        .update({ is_pro: false })
        .eq('id', id);
    }
  }

  return res.status(200).json({ received: true });
}
