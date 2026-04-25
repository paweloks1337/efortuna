const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

// POST /api/admin/matches - create a match
router.post('/matches', async (req, res) => {
  const { team_a, team_b, start_time } = req.body;

  if (!team_a?.trim() || !team_b?.trim() || !start_time) {
    return res.status(400).json({ error: 'team_a, team_b, and start_time are required' });
  }

  if (new Date(start_time) <= new Date()) {
    return res.status(400).json({ error: 'start_time must be in the future' });
  }

  try {
    const { data, error } = await supabase
      .from('matches')
      .insert({
        team_a: team_a.trim(),
        team_b: team_b.trim(),
        start_time,
        status: 'upcoming'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create match' });
  }
});

// PATCH /api/admin/matches/:id - update match (set result)
router.patch('/matches/:id', async (req, res) => {
  const { result, score_a, score_b, status } = req.body;

  const updates = {};
  if (result) updates.result = result;
  if (score_a !== undefined) updates.score_a = score_a;
  if (score_b !== undefined) updates.score_b = score_b;
  if (status) updates.status = status;

  try {
    const { data, error } = await supabase
      .from('matches')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update match' });
  }
});

// POST /api/admin/matches/:id/settle - trigger point calculation
router.post('/matches/:id/settle', async (req, res) => {
  const matchId = req.params.id;

  try {
    // Fetch match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (!match.result || match.score_a === null || match.score_b === null) {
      return res.status(400).json({ error: 'Match result and scores must be set before settling' });
    }

    if (match.settled) {
      return res.status(400).json({ error: 'Match already settled (idempotency check)' });
    }

    // Fetch all bets for this match
    const { data: bets, error: betsError } = await supabase
      .from('bets')
      .select('*')
      .eq('match_id', matchId)
      .is('points_awarded', null); // only unprocessed bets

    if (betsError) throw betsError;

    // Calculate points for each bet
    const betUpdates = bets.map(bet => {
      let points = 0;
      const winnerCorrect = bet.predicted_winner === match.result;
      const exactScoreCorrect =
        bet.predicted_score_a === match.score_a &&
        bet.predicted_score_b === match.score_b;

      if (exactScoreCorrect) {
        points = 3; // exact score includes winner
      } else if (winnerCorrect) {
        points = 1;
      }

      return {
        id: bet.id,
        user_id: bet.user_id,
        points_awarded: points,
        winner_correct: winnerCorrect,
        exact_score_correct: exactScoreCorrect
      };
    });

    // Fetch bonus questions for this match
    const { data: questions } = await supabase
      .from('bonus_questions')
      .select('*')
      .eq('match_id', matchId);

    // Fetch all bonus answers for these questions
    const questionIds = (questions || []).map(q => q.id);
    let bonusUpdates = [];

    if (questionIds.length > 0) {
      const { data: answers } = await supabase
        .from('bonus_answers')
        .select('*')
        .in('question_id', questionIds)
        .is('points_awarded', null);

      const questionMap = {};
      (questions || []).forEach(q => { questionMap[q.id] = q; });

      bonusUpdates = (answers || []).map(ans => {
        const q = questionMap[ans.question_id];
        const correct = q?.correct_answer?.toLowerCase().trim() === ans.answer?.toLowerCase().trim();
        return {
          id: ans.id,
          user_id: ans.user_id,
          points_awarded: correct ? 2 : 0
        };
      });
    }

    // Apply bet points in batch
    for (const b of betUpdates) {
      await supabase
        .from('bets')
        .update({
          points_awarded: b.points_awarded,
          winner_correct: b.winner_correct,
          exact_score_correct: b.exact_score_correct
        })
        .eq('id', b.id);
    }

    // Apply bonus points in batch
    for (const a of bonusUpdates) {
      await supabase
        .from('bonus_answers')
        .update({ points_awarded: a.points_awarded })
        .eq('id', a.id);
    }

    // Aggregate all point changes per user
    const userPoints = {};
    [...betUpdates, ...bonusUpdates].forEach(item => {
      userPoints[item.user_id] = (userPoints[item.user_id] || 0) + item.points_awarded;
    });

    // Update user totals
    for (const [userId, pts] of Object.entries(userPoints)) {
      if (pts > 0) {
        await supabase.rpc('increment_user_points', { uid: userId, pts });
      }
    }

    // Mark match as settled
    await supabase
      .from('matches')
      .update({ settled: true, status: 'finished' })
      .eq('id', matchId);

    res.json({
      message: 'Match settled successfully',
      bets_processed: betUpdates.length,
      bonus_processed: bonusUpdates.length,
      users_updated: Object.keys(userPoints).length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Settlement failed', details: err.message });
  }
});

// POST /api/admin/bonus - add bonus question to match
router.post('/bonus', async (req, res) => {
  const { match_id, question, correct_answer } = req.body;

  if (!match_id || !question?.trim() || !correct_answer?.trim()) {
    return res.status(400).json({ error: 'match_id, question, and correct_answer are required' });
  }

  try {
    const { data, error } = await supabase
      .from('bonus_questions')
      .insert({
        match_id,
        question: question.trim(),
        correct_answer: correct_answer.trim()
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create bonus question' });
  }
});

// GET /api/admin/matches - list all matches for admin
router.get('/matches', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select(`*, bonus_questions(*)`)
      .order('start_time', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// GET /api/admin/stats - overview stats
router.get('/stats', async (req, res) => {
  try {
    const [{ count: userCount }, { count: matchCount }, { count: betCount }] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }),
      supabase.from('bets').select('*', { count: 'exact', head: true })
    ]);

    res.json({ users: userCount, matches: matchCount, bets: betCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
