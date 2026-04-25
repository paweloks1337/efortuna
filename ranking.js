const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/ranking - global leaderboard
router.get('/', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, avatar, points')
      .order('points', { ascending: false });

    if (error) throw error;

    // Fetch exact score counts and earliest correct prediction for tie-breaking
    const userIds = users.map(u => u.id);

    const { data: exactScores } = await supabase
      .from('bets')
      .select('user_id')
      .eq('exact_score_correct', true);

    const exactScoreCounts = {};
    (exactScores || []).forEach(b => {
      exactScoreCounts[b.user_id] = (exactScoreCounts[b.user_id] || 0) + 1;
    });

    // Get earliest correct prediction per user
    const { data: correctBets } = await supabase
      .from('bets')
      .select('user_id, created_at')
      .eq('winner_correct', true)
      .order('created_at', { ascending: true });

    const earliestCorrect = {};
    (correctBets || []).forEach(b => {
      if (!earliestCorrect[b.user_id]) {
        earliestCorrect[b.user_id] = b.created_at;
      }
    });

    const ranked = users
      .map((u, i) => ({
        ...u,
        rank: i + 1,
        exact_score_count: exactScoreCounts[u.id] || 0,
        earliest_correct: earliestCorrect[u.id] || null
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.exact_score_count !== a.exact_score_count) return b.exact_score_count - a.exact_score_count;
        if (a.earliest_correct && b.earliest_correct) {
          return new Date(a.earliest_correct) - new Date(b.earliest_correct);
        }
        return 0;
      })
      .map((u, i) => ({ ...u, rank: i + 1 }));

    res.json(ranked);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch ranking' });
  }
});

module.exports = router;
