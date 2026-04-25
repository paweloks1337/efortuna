const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/users/me - get own profile
router.get('/me', authenticate, async (req, res) => {
  res.json(req.user);
});

// PATCH /api/users/me - update username
router.patch('/me', authenticate, async (req, res) => {
  const { username } = req.body;
  if (!username?.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const clean = username.trim().slice(0, 32);

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ username: clean })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
