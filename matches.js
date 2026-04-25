const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/matches - list all matches (public)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        bonus_questions (id, question, correct_answer)
      `)
      .order('start_time', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// GET /api/matches/:id - single match with bets count
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        bonus_questions (id, question, correct_answer)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

module.exports = router;
