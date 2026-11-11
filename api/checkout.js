import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Not signed in' });

  const origin = req.headers.origin || `https://${req.headers.host}`;

  const r = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: user.email,
      amount: 99900,
      currency: 'KES',
      plan: process.env.PAYSTACK_PLAN_CODE,
      callback_url: `${origin}/?paid=1`,
      metadata: { user_id: user.id }
    })
  });

  const out = await r.json();
  if (!out.status) return res.status(400).json({ error: out.message });
  return res.json({ url: out.data.authorization_url });
}
