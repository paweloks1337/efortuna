const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/bets/my - get current user's bets
router.get('/my', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bets')
      .select(`
        *,
        matches (id, team_a, team_b, start_time, status, result, score_a, score_b)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bets' });
  }
});

// POST /api/bets - place or update a bet
router.post('/', authenticate, async (req, res) => {
  const { match_id, predicted_winner, predicted_score_a, predicted_score_b } = req.body;

  if (!match_id || !predicted_winner) {
    return res.status(400).json({ error: 'match_id and predicted_winner are required' });
  }

  try {
    // Fetch match to check start time
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, start_time, status')
      .eq('id', match_id)
      .single();

    if (matchError || !match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match.status !== 'upcoming') {
      return res.status(400).json({ error: 'Betting is closed for this match' });
    }

    if (new Date() >= new Date(match.start_time)) {
      return res.status(400).json({ error: 'Betting is closed — match has already started' });
    }

    // Validate predicted_winner is team_a or team_b
    const { data: matchFull } = await supabase
      .from('matches')
      .select('team_a, team_b')
      .eq('id', match_id)
      .single();

    if (predicted_winner !== matchFull.team_a && predicted_winner !== matchFull.team_b) {
      return res.status(400).json({ error: 'predicted_winner must be team_a or team_b' });
    }

    // Validate score if provided
    if (
      predicted_score_a !== null && predicted_score_a !== undefined &&
      predicted_score_b !== null && predicted_score_b !== undefined
    ) {
      if (
        !Number.isInteger(predicted_score_a) ||
        !Number.isInteger(predicted_score_b) ||
        predicted_score_a < 0 ||
        predicted_score_b < 0
      ) {
        return res.status(400).json({ error: 'Invalid score values' });
      }
    }

    // Upsert bet
    const { data, error } = await supabase
      .from('bets')
      .upsert({
        user_id: req.user.id,
        match_id,
        predicted_winner,
        predicted_score_a: predicted_score_a ?? null,
        predicted_score_b: predicted_score_b ?? null,
        points_awarded: null
      }, {
        onConflict: 'user_id,match_id'
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place bet' });
  }
});

// GET /api/bets/match/:matchId - get all bets for a match (admin sees all, user sees own)
router.get('/match/:matchId', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .eq('match_id', req.params.matchId)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bets' });
  }
});

module.exports = router;
