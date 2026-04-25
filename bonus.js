const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/bonus/my - get current user's bonus answers
router.get('/my', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bonus_answers')
      .select(`
        *,
        bonus_questions (id, question, correct_answer, match_id,
          matches (id, team_a, team_b, start_time, status)
        )
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bonus answers' });
  }
});

// POST /api/bonus/answer - submit a bonus answer
router.post('/answer', authenticate, async (req, res) => {
  const { question_id, answer } = req.body;

  if (!question_id || !answer?.trim()) {
    return res.status(400).json({ error: 'question_id and answer are required' });
  }

  try {
    // Fetch question + match start time
    const { data: question, error: qError } = await supabase
      .from('bonus_questions')
      .select('*, matches(start_time, status)')
      .eq('id', question_id)
      .single();

    if (qError || !question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (question.matches.status !== 'upcoming') {
      return res.status(400).json({ error: 'This match is no longer accepting answers' });
    }

    if (new Date() >= new Date(question.matches.start_time)) {
      return res.status(400).json({ error: 'Answers closed — match has started' });
    }

    const { data, error } = await supabase
      .from('bonus_answers')
      .upsert({
        user_id: req.user.id,
        question_id,
        answer: answer.trim(),
        points_awarded: null
      }, {
        onConflict: 'user_id,question_id'
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

module.exports = router;
